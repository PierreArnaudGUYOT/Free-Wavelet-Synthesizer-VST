// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Generates the manual figures from the real DSP core (web/js/core.js).
// SVG files go to web/manual/img/; the inline diagrams are returned in SNIPS.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const W = path.join(ROOT, 'web', 'js') + path.sep;
const SPEC = require(W + 'spec.js'); const C = require(W + 'core.js')(SPEC); const N = C.N, P = C.P;
const IMG = path.join(ROOT, 'web', 'manual', 'img') + path.sep;
fs.mkdirSync(IMG, { recursive: true });
const SNIPS = {};
const FONT = `font-family="-apple-system, 'Segoe UI', system-ui, Roboto, Helvetica, Arial, sans-serif"`;
const TH = {
  a: { acc: '#2fd4c6', ink: '#0f9e93', deep: '#0a6b64', tint: '#e3f7f5', tint2: '#c4eeea' },
  b: { acc: '#ffae42', ink: '#c97a0a', deep: '#7c4a05', tint: '#fff2de', tint2: '#ffe0b0' },
};
const TXT = '#1d2430', MUT = '#5b6573', GRID = '#e3e7ec', FAINT = '#f5f7f9', SLATE = '#3b4552', GREY = '#a3abb6';
const f1 = v => (Math.round(v * 10) / 10).toString();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function svgDoc(w, h, body, title, inline) {
  const head = inline ? `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" ${FONT} class="fig-svg">`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ${FONT} role="img" aria-label="${esc(title)}">`;
  return `${head}<title>${esc(title)}</title>${body}</svg>`;
}
const text = (x, y, s, o = {}) => `<text x="${f1(x)}" y="${f1(y)}" font-size="${o.size || 12}" fill="${o.fill || MUT}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.weight ? ` font-weight="${o.weight}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''}>${esc(s)}</text>`;
const line = (x1, y1, x2, y2, st, sw = 1, dash) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${st}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const rect = (x, y, w, h, fill, o = {}) => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${fill}"${o.rx ? ` rx="${o.rx}"` : ''}${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ''}${o.op != null ? ` fill-opacity="${o.op}"` : ''}/>`;
function poly(pts, st, sw = 2, o = {}) {
  return `<polyline points="${pts.map(p => f1(p[0]) + ',' + f1(p[1])).join(' ')}" fill="none" stroke="${st}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.op ? ` stroke-opacity="${o.op}"` : ''}/>`;
}
// cycle -> points (min/max decimation keeps edges sharp)
function cyclePts(y, x0, y0, w, h, scale) {
  const pts = [], cols = Math.round(w);
  const Y = v => y0 + h / 2 - v * scale * h / 2;
  for (let c = 0; c < cols; c++) {
    const i0 = Math.floor(c / cols * N), i1 = Math.max(i0 + 1, Math.floor((c + 1) / cols * N));
    let mn = Infinity, mx = -Infinity;
    const first = y[i0], last = y[i1 - 1];
    for (let i = i0; i < i1; i++) { mn = Math.min(mn, y[i]); mx = Math.max(mx, y[i]); }
    const X = x0 + c * w / cols;
    if (mx - mn > 0.04 / scale) {
      pts.push([X, Y(first)]);
      if (first > last) { pts.push([X, Y(mx)]); pts.push([X, Y(mn)]); } else { pts.push([X, Y(mn)]); pts.push([X, Y(mx)]); }
      pts.push([X + w / cols, Y(last)]);
    } else pts.push([X, Y((mn + mx) / 2)]);
  }
  pts.push([x0 + w, Y(y[N - 1])]);
  return pts;
}
const peak = y => { let p = 0; for (const v of y) p = Math.max(p, Math.abs(v)); return p || 1; };
function params(o) { const p = Float64Array.from(C.defaults()); for (const k in o) p[P[k]] = o[k]; return p; }
function cycleFor(o, gains, win) {
  const p = params(o), tb = C.buildTables(p, false);
  const g = gains || C.staticGains(p, new Float64Array(11));
  const w = win || { c: p[P.p_center], w: p[P.p_width], d: p[P.p_depth] };
  return { y: C.displayCycle(tb, g, w.c, w.w, w.d, new Float64Array(N)), tb, p };
}
function panelFrame(x, y, w, h, o = {}) {
  let s = rect(x, y, w, h, o.bg || FAINT, { rx: 6, stroke: GRID });
  if (o.mid !== false) s += line(x + 4, y + h / 2, x + w - 4, y + h / 2, '#d5dbe2', 1, '3 3');
  return s;
}
const out = (name, s) => { fs.writeFileSync(name, s); console.log('  img/' + path.basename(name), (s.length / 1024).toFixed(1) + ' kB'); };
const legend = (items, x, y, step) => {
  let s = '', lx = x;
  for (const [label, col, sw, dash] of items) {
    s += line(lx, y - 4, lx + 26, y - 4, col, sw, dash) + text(lx + 32, y, label, { size: 11.5, fill: TXT });
    lx += 46 + label.length * (step || 6.4);
  }
  return s;
};

for (const E of ['a', 'b']) {
  const T = TH[E];
  // ---------------------------------------------------------------- 1. atom gallery
  {
    const cw = 118, ch = 96, gap = 6, Wd = 7 * cw + 6 * gap, Hd = ch + 42;
    let b = '';
    SPEC.WAVELETS.forEach((wv, wi) => {
      const a = C.atomShape(wi), x0 = wi * (cw + gap);
      b += rect(x0, 0, cw, ch, FAINT, { rx: 6, stroke: GRID });
      b += line(x0 + 4, ch / 2 + 4, x0 + cw - 4, ch / 2 + 4, '#d5dbe2', 1);
      const span = a.hi - a.lo + 1, m = Math.max(4, span * 0.15), lo = a.lo - m, hi = a.hi + m;
      let pk = 0; for (let i = a.lo; i <= a.hi; i++) pk = Math.max(pk, Math.abs(a.x[i]));
      const pts = [], cols = cw - 10;
      for (let c = 0; c <= cols; c++) { const i = Math.round(lo + c / cols * (hi - lo)); const v = i >= a.lo && i <= a.hi ? a.x[i] : 0; pts.push([x0 + 5 + c, ch / 2 + 4 - v / pk * (ch / 2 - 10)]); }
      b += poly(pts, T.ink, 1.8);
      b += text(x0 + cw / 2, ch + 18, wv.name, { anchor: 'middle', fill: TXT, weight: 600, size: 13 });
      b += text(x0 + cw / 2, ch + 33, `${wv.h.length} taps`, { anchor: 'middle', size: 12.5 });
    });
    out(IMG + `atoms-${E}.svg`, svgDoc(Wd, Hd, b, 'One atom of each of the seven wavelets, from Haar (2 taps) to Daubechies 20 (40 taps)'));
  }
  // ---------------------------------------------------------------- 2. filter curves
  {
    const pw = 410, ph = 170, gx = 40, Wd = 2 * pw + gx, Hd = 2 * ph + 70;
    const names = ['LOW-PASS', 'HIGH-PASS', 'BAND-PASS', 'BAND-REJECT'];
    const dbTop = 24, dbBot = -60;
    let b = '';
    const gainAt = (type, band, cut, slope, res) => { const o = new Float64Array(11); C.filterGains(type, cut - (band - 1), slope, res, o); return o[0]; };
    names.forEach((nm, t) => {
      const ox = (t % 2) * (pw + gx), oy = Math.floor(t / 2) * (ph + 35) + 4;
      const L = ox + 40, R = ox + pw - 6, Tp = oy + 18, B = oy + ph - 18;
      const X = band => L + (band - 1) / 10 * (R - L), Y = db => Tp + (dbTop - Math.max(dbBot, Math.min(dbTop, db))) / (dbTop - dbBot) * (B - Tp);
      b += text(ox, oy + 8, nm, { fill: TXT, weight: 700, size: 12, ls: '0.06em' });
      for (const db of [24, 0, -24, -48]) { b += line(L, Y(db), R, Y(db), db === 0 ? '#c3cad3' : GRID, 1); b += text(L - 6, Y(db) + 4, (db > 0 ? '+' : '') + db, { anchor: 'end', size: 10.5 }); }
      for (let k = 1; k <= 11; k++) { b += line(X(k), B, X(k), B + 4, '#c3cad3'); b += text(X(k), B + 15, String(k), { anchor: 'middle', size: 10.5 }); }
      b += line(X(6), Tp, X(6), B, T.acc, 1, '2 3');
      const curve = (slope, res, col, sw, dash) => {
        const pts = []; for (let s = 0; s <= 200; s++) { const band = 1 + s / 20; const g = gainAt(t, band, 6, slope, res); pts.push([X(band), Y(20 * Math.log10(Math.max(g, 1e-9)))]); }
        return poly(pts, col, sw, { dash });
      };
      b += curve(6, 0, GREY, 1.5);
      b += curve(96, 0, SLATE, 1.5, '5 4');
      if (t < 3) b += curve(24, 12, T.acc, 2, '2 3');
      b += curve(24, 0, T.ink, 2.4);
      for (let k = 1; k <= 11; k++) { const g = gainAt(t, k, 6, 24, 0); b += `<circle cx="${f1(X(k))}" cy="${f1(Y(20 * Math.log10(Math.max(g, 1e-9))))}" r="2.6" fill="${T.ink}"/>`; }
    });
    b += legend([['slope 24 dB/band', T.ink, 2.4], ['slope 6', GREY, 1.5], ['slope 96', SLATE, 1.5, '5 4'], ['slope 24 + RESO 12 dB', T.acc, 2, '2 3']], 40, Hd - 14, 6.6);
    b += text(Wd - 4, Hd - 14, 'x: band · y: gain in dB · CUTOFF 6', { anchor: 'end', size: 11 });
    out(IMG + `filter-${E}.svg`, svgDoc(Wd, Hd, b, 'Gain applied to each band by the four filter types at CUTOFF 6'));
  }
  // ---------------------------------------------------------------- 3. window
  {
    const Wd = 860, Hd = 200, L = 60, R = Wd - 20, Tp = 26, B = 150;
    const X = ph => L + ph * (R - L), Y = v => B - v * (B - Tp);
    let b = '';
    const pc = 0.5, w = 0.4;
    b += rect(X(pc - w / 2), Tp - 6, X(pc + w / 2) - X(pc - w / 2), B - Tp + 6, T.tint, { op: 0.8 });
    for (const v of [0, 0.5, 1]) { b += line(L, Y(v), R, Y(v), v === 0 ? '#c3cad3' : GRID); b += text(L - 8, Y(v) + 4, v === 1 ? '100%' : v === 0 ? '0%' : '50%', { anchor: 'end', size: 11 }); }
    for (let d = 0; d <= 360; d += 45) { b += line(X(d / 360), B, X(d / 360), B + 4, '#c3cad3'); b += text(X(d / 360), B + 17, d + '°', { anchor: 'middle', size: 11 }); }
    const curve = (D, col, sw, dash) => { const pts = []; for (let s = 0; s <= 360; s++) pts.push([X(s / 360), Y(C.windowValue(s / 360, pc, w, D))]); return poly(pts, col, sw, { dash }); };
    b += curve(0, GREY, 1.6, '5 4') + curve(0.5, T.acc, 2.2, '6 4') + curve(1, T.ink, 2.6);
    b += line(X(pc), Tp - 6, X(pc), B, T.deep, 1, '2 3');
    b += text(X(pc), Tp - 11, 'POSITION 180°', { anchor: 'middle', size: 11.5, fill: T.deep, weight: 600 });
    const ay = B - 10; b += line(X(pc - w / 2) + 2, ay, X(pc + w / 2) - 2, ay, T.deep, 1.2);
    b += `<path d="M${f1(X(pc - w / 2) + 2)},${ay} l7,-4 v8 z M${f1(X(pc + w / 2) - 2)},${ay} l-7,-4 v8 z" fill="${T.deep}"/>`;
    b += text(X(pc + w / 2) + 8, ay + 4, 'WIDTH 40% of the cycle', { size: 11.5, fill: T.deep, weight: 600 });
    const yl = E === 'a' ? 'filter amount' : 'detail level';
    b += `<text transform="translate(16,${f1((Tp + B) / 2)}) rotate(-90)" font-size="11.5" fill="${MUT}" text-anchor="middle">${yl}</text>`;
    b += legend([['DEPTH 100%', T.ink, 2.6], ['DEPTH 50%', T.acc, 2.2, '6 4'], ['DEPTH 0% (window off)', GREY, 1.6, '5 4']], L, Hd - 8, 6.4);
    b += text(R, Hd - 8, 'x: phase inside one cycle', { anchor: 'end', size: 11 });
    out(IMG + `window-${E}.svg`, svgDoc(Wd, Hd, b, 'The position window over one cycle for three DEPTH settings'));
  }
  // ---------------------------------------------------------------- 4. computer keyboard map
  {
    const k = 46, g = 6, Wd = 12 * (k + g) + 40, Hd = 4 * (k + g) + 122;
    let b = '';
    const notes = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const key = (x, y, cap, note, kind, sub) => {
      const fill = kind === 'white' ? '#ffffff' : kind === 'black' ? '#2a313b' : kind === 'oct' ? T.tint : '#f4f6f8';
      const stroke = kind === 'none' ? '#e1e5ea' : kind === 'black' ? '#2a313b' : T.ink;
      let s = rect(x, y, k, k, fill, { rx: 7, stroke, sw: kind === 'none' ? 1 : 1.6 });
      s += text(x + 7, y + 15, cap, { size: 11.5, fill: kind === 'black' ? '#c9d1db' : kind === 'none' ? '#b9c0c9' : MUT, weight: 600 });
      if (note) s += text(x + k / 2, y + k - 9, note, { anchor: 'middle', size: note.length > 2 ? 11.5 : 14, weight: 700, fill: kind === 'black' ? '#ffffff' : kind === 'oct' ? T.deep : TXT });
      if (sub) s += text(x + k - 5, y + 15, sub, { anchor: 'end', size: 9.5, fill: kind === 'black' ? '#9aa6b4' : T.ink, weight: 700 });
      return s;
    };
    const x0 = 20, y0 = 30;
    const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], dn = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E'];
    b += text(x0, y0 - 12, 'DIGIT ROW (and numeric keypad 1–9, 0) · white keys only', { size: 11, weight: 700, fill: MUT, ls: '0.05em' });
    b += key(x0, y0, '`', '', 'none');
    digits.forEach((d, i) => { b += key(x0 + (i + 1) * (k + g), y0, d, dn[i], 'white', i >= 7 ? '+1' : ''); });
    const qy = y0 + (k + g) + 24, q = 'QWERTYUIOP['.split(''), qn = { W: 1, E: 3, T: 6, Y: 8, U: 10, O: 13, P: 15 };
    b += text(x0, qy - 10, 'LETTER ROWS · chromatic, C to F one octave higher', { size: 11, weight: 700, fill: MUT, ls: '0.05em' });
    q.forEach((c, i) => { const n = qn[c]; b += key(x0 + k / 2 + i * (k + g), qy, c, n != null ? notes[n % 12] : '', n != null ? 'black' : 'none', n != null && n >= 12 ? '+1' : ''); });
    const ay = qy + k + g, a = 'ASDFGHJKL;\''.split(''), an = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];
    a.forEach((c, i) => { b += key(x0 + k * 0.75 + i * (k + g), ay, c, notes[an[i] % 12], 'white', an[i] >= 12 ? '+1' : ''); });
    const zy = ay + k + g, z = 'ZXCVBNM'.split('');
    z.forEach((c, i) => { const isO = c === 'Z' || c === 'X'; b += key(x0 + k * 1.25 + i * (k + g), zy, c, isO ? (c === 'Z' ? 'oct −' : 'oct +') : '', isO ? 'oct' : 'none'); });
    b += text(x0, zy + k + 24, 'Key caps show a US/UK QWERTY layout. Physical key positions are used: on AZERTY press', { size: 11.5, fill: MUT });
    b += text(x0, zy + k + 41, 'A Z E R T Y U I O P · Q S D F G H J K L M Ù · W X instead (digits work without Shift).', { size: 11.5, fill: MUT });
    b += text(x0, zy + k + 58, '“+1” = one octave above the base note (C4 by default; Z / X move it down / up).', { size: 11.5, fill: MUT });
    out(IMG + `keys-${E}.svg`, svgDoc(Wd, Hd, b, 'Computer keyboard map: digit row plays white keys, letter rows play chromatically, Z and X shift the octave'));
  }
}

// ---------------------------------------------------------------- A-only figures
{
  const T = TH.a;
  {
    const cuts = [1.5, 2.5, 3.5, 4.5, 12], pw = 160, ph = 92, gap = 12, Wd = cuts.length * pw + (cuts.length - 1) * gap, Hd = ph + 46;
    let b = '';
    const p = params({ osc_view: 0, a_wave: 0, wavelet: 0 }), tb = C.buildTables(p, false);
    cuts.forEach((c, i) => {
      const g = C.filterGains(0, c, 96, 0, new Float64Array(11));
      const y = C.displayCycle(tb, g, 0, 1, 0, new Float64Array(N));
      const x0 = i * (pw + gap);
      b += panelFrame(x0, 0, pw, ph);
      b += poly(cyclePts(tb.layers[C.DRY], x0 + 6, 6, pw - 12, ph - 12, 0.92), GREY, 1.2);
      b += poly(cyclePts(y, x0 + 6, 6, pw - 12, ph - 12, 0.92), T.ink, 2);
      b += text(x0 + pw / 2, ph + 17, c === 12 ? 'CUTOFF 12 · full saw' : `CUTOFF ${c} · ${1 << Math.floor(c)} steps`, { anchor: 'middle', fill: TXT, weight: 600, size: 13.5 });
      b += text(x0 + pw / 2, ph + 33, c === 12 ? 'all 11 bands' : c < 2 ? 'band 1 only' : `bands 1–${Math.floor(c)}`, { anchor: 'middle', size: 12.5 });
    });
    out(IMG + 'staircase-a.svg', svgDoc(Wd, Hd, b, 'Haar sawtooth through a steep low-pass: each band removed halves the number of steps'));
  }
  {
    const ss = [0, 0.3, 0.5, 0.7, 0.9], pw = 160, ph = 92, gap = 12, Wd = ss.length * pw + (ss.length - 1) * gap, Hd = ph + 46;
    let b = '';
    ss.forEach((s, i) => {
      const p = params({ osc_view: 0, a_wave: 0, wavelet: 3, a_sparsity: s }), tb = C.buildTables(p, false);
      const raw = C.sourceCycle(0, 0.5), x0 = i * (pw + gap), sc = 0.92 / Math.max(1, peak(tb.layers[C.DRY]));
      b += panelFrame(x0, 0, pw, ph);
      b += poly(cyclePts(raw, x0 + 6, 6, pw - 12, ph - 12, sc), GREY, 1.2);
      b += poly(cyclePts(tb.layers[C.DRY], x0 + 6, 6, pw - 12, ph - 12, sc), T.ink, 2);
      b += text(x0 + pw / 2, ph + 17, `SPARSITY ${Math.round(s * 100)}%`, { anchor: 'middle', fill: TXT, weight: 600, size: 13.5 });
      b += text(x0 + pw / 2, ph + 33, `${tb.kept} / ${tb.nonzero} atoms kept`, { anchor: 'middle', size: 12.5 });
    });
    out(IMG + 'sparsity-a.svg', svgDoc(Wd, Hd, b, 'A Daubechies 8 sawtooth reduced to its K largest atoms'));
  }
  {
    const Wd = 860, Hd = 214, L = 20, R = Wd - 20, Tp = 14, B = 172;
    const p = params({ osc_view: 0, a_wave: 1, wavelet: 4 }), tb = C.buildTables(p, false), g = C.filterGains(0, 2.5, 24, 0, new Float64Array(11));
    const filt = C.displayCycle(tb, g, 0, 1, 0, new Float64Array(N));
    const win = C.displayCycle(tb, g, 0.5, 0.4, 1, new Float64Array(N));
    let b = rect(L + 0.3 * (R - L), Tp, 0.4 * (R - L), B - Tp, T.tint, { op: 0.8 });
    b += line(L, (Tp + B) / 2, R, (Tp + B) / 2, '#d5dbe2', 1, '3 3');
    const sc = 0.85 / peak(filt);
    b += poly(cyclePts(tb.layers[C.DRY], L, Tp, R - L, B - Tp, sc), GREY, 1.4);
    b += poly(cyclePts(filt, L, Tp, R - L, B - Tp, sc), SLATE, 1.4, { dash: '5 4' });
    b += poly(cyclePts(win, L, Tp, R - L, B - Tp, sc), T.ink, 2.6);
    b += text(L + 0.5 * (R - L), Tp + 16, 'window: POSITION 180°, WIDTH 40%', { anchor: 'middle', size: 11.5, fill: T.deep, weight: 600 });
    b += legend([['raw square (dry)', GREY, 1.4], ['filtered everywhere (DEPTH 0%)', SLATE, 1.4, '5 4'], ['DEPTH 100%: only the falling edge is filtered', T.ink, 2.6]], L, Hd - 10, 6.3);
    out(IMG + 'edge-a.svg', svgDoc(Wd, Hd, b, 'Edge Pluck: a Symlet 8 low-pass applied only around the falling edge of a square wave'));
  }
}

// ---------------------------------------------------------------- B-only figures
{
  const T = TH.b;
  {
    const ns = [1, 2, 3, 4, 11], pw = 160, ph = 92, gap = 12, Wd = ns.length * pw + (ns.length - 1) * gap, Hd = ph + 46;
    let b = '';
    const saw = C.sourceCycle(0, 0.5);
    ns.forEach((n, i) => {
      const o = { osc_view: 2, b1_wavelet: 0, b_pattern: 0, b_tilt: -6 }; for (let k = 1; k <= 11; k++) o['b_bar' + k] = k <= n ? 1 : 0;
      const { y } = cycleFor(o);
      const x0 = i * (pw + gap), sc = 0.92 / peak(y);
      b += panelFrame(x0, 0, pw, ph);
      if (n === 11) b += poly(cyclePts(saw, x0 + 6, 6, pw - 12, ph - 12, 0.92), GREY, 1.2);
      b += poly(cyclePts(y, x0 + 6, 6, pw - 12, ph - 12, sc), T.ink, 2);
      b += text(x0 + pw / 2, ph + 17, n === 1 ? 'drawbar 1 only' : n === 11 ? 'all 11 drawbars' : `drawbars 1–${n}`, { anchor: 'middle', fill: TXT, weight: 600, size: 13.5 });
      b += text(x0 + pw / 2, ph + 33, n === 1 ? 'a square wave' : n === 11 ? '≈ sawtooth (grey)' : `${1 << n} steps`, { anchor: 'middle', size: 12.5 });
    });
    out(IMG + 'staircase-b.svg', svgDoc(Wd, Hd, b, 'Haar, RAMP and Tilt −6 dB/band: adding bands turns a square into a sawtooth'));
  }
  {
    const pats = SPEC.PARAMS[P.b_pattern].choices;
    const cw = 425, chh = 112, gx = 10, gy = 14, Wd = 2 * cw + gx, Hd = 3 * (chh + gy) + 26;
    let b = '';
    pats.forEach((nm, pi) => {
      const ox = (pi % 2) * (cw + gx), oy = Math.floor(pi / 2) * (chh + gy);
      b += rect(ox, oy, cw, chh, '#ffffff', { rx: 8, stroke: GRID });
      b += text(ox + 12, oy + 20, nm.toUpperCase(), { size: 12.5, weight: 700, fill: TXT, ls: '0.06em' });
      const c = C.patternCoeffs(pi, 1), mx = ox + 12, my = oy + 30, mw = 128, rh = 11;
      for (let bnd = 1; bnd <= 6; bnd++) {
        const n = 1 << (bnd - 1), yy = my + (6 - bnd) * rh;
        for (let k = 0; k < n; k++) {
          const v = c[n + k], cx = mx + k * mw / n, w = mw / n - (n <= 16 ? 1 : 0.4);
          const fill = v === 0 ? '#eef1f4' : v > 0 ? T.acc : SLATE;
          const op = pi === 5 ? (0.25 + 0.75 * Math.abs(v)) : 1;
          b += rect(cx, yy, Math.max(0.6, w), rh - 2, fill, { op });
        }
        b += text(mx + mw + 5, yy + rh - 2, 'B' + bnd, { size: 10, fill: GREY });
      }
      const ly = my + 6 * rh + 10;
      b += text(mx, ly + 1, 'bands 1–6', { size: 10.5, fill: GREY }) + rect(mx + 58, ly - 7, 8, 8, T.acc) + text(mx + 69, ly + 1, '+', { size: 11, fill: GREY }) + rect(mx + 82, ly - 7, 8, 8, SLATE) + text(mx + 93, ly + 1, '−', { size: 11, fill: GREY });
      const wx = ox + 172, ww = cw - 184, wy = oy + 10, wh = chh - 20;
      b += panelFrame(wx, wy, ww, wh);
      const yh = cycleFor({ osc_view: 2, b1_wavelet: 0, b_pattern: pi, b_tilt: -6 }).y;
      const yd = cycleFor({ osc_view: 2, b1_wavelet: 3, b_pattern: pi, b_tilt: -6 }).y;
      b += poly(cyclePts(yd, wx + 5, wy + 4, ww - 10, wh - 8, 0.9 / peak(yd)), SLATE, 1.3, { op: 0.7 });
      b += poly(cyclePts(yh, wx + 5, wy + 4, ww - 10, wh - 8, 0.9 / peak(yh)), T.ink, 2);
    });
    b += legend([['one cycle with Haar', T.ink, 2], ['with Daubechies 8', SLATE, 1.3]], 0, Hd - 6, 6.3);
    b += text(Wd, Hd - 6, 'TILT −6 dB/band, all drawbars 100% · RANDOM shown with SEED 1', { anchor: 'end', size: 11 });
    out(IMG + 'patterns-b.svg', svgDoc(Wd, Hd, b, 'The six atom patterns: signs of the atoms in bands 1 to 6 and the resulting cycle'));
  }
  {
    const sim = (o, secs, sr = 48000) => {
      const n = 32, LN = Math.log(1000);
      const lv = new Float64Array(11), at = new Uint8Array(11).fill(1), res = []; for (let b = 0; b < 11; b++) res.push([[0, 0]]);
      const steps = Math.round(secs * sr / n);
      for (let s = 0; s <= steps; s++) {
        for (let b = 0; b < 11; b++) {
          const t = b / 10; let l = lv[b];
          if (at[b]) { l += n / (o.atk * Math.pow(16, o.spread * (t - 0.5)) * sr); if (l >= 1) { l = 1; at[b] = 0; } }
          else { const dt = o.body * Math.pow(o.bright / o.body, t); l = o.sus + (l - o.sus) * Math.exp(-n * LN / (dt * sr)); }
          lv[b] = l; if (s % 15 === 0 || s * n / sr < 0.03) res[b].push([s * n / sr, l]);
        }
      }
      return res;
    };
    const Wd = 860, Hd = 250, pw = 410, gx = 40;
    let b = '';
    const panels = [
      { title: 'ATTACK 1.5 s · SPREAD +100%   (as in Mirror Pad)', o: { atk: 1.5, spread: 1, body: 20, bright: 20, sus: 1 }, secs: 6.5, step: 1 },
      { title: 'BODY 3 s · BRIGHT 0.4 s · SUSTAIN 0%   (as in Walsh Bells)', o: { atk: 0.002, spread: 0, body: 3, bright: 0.4, sus: 0 }, secs: 3.5, step: 0.5 },
    ];
    const show = [0, 2, 5, 8, 10], cols = ['#f3c47f', '#eda13a', T.ink, '#9c5c08', '#5a3604'];
    panels.forEach((pn, i) => {
      const ox = i * (pw + gx), L = ox + 30, R = ox + pw - 6, Tp = 28, B = Hd - 60;
      const X = t => L + t / pn.secs * (R - L), Y = v => B - v * (B - Tp);
      b += text(ox, 12, pn.title, { size: 12, weight: 700, fill: TXT });
      for (const v of [0, 0.5, 1]) { b += line(L, Y(v), R, Y(v), v === 0 ? '#c3cad3' : GRID); b += text(L - 6, Y(v) + 4, v === 0 ? '0' : v === 1 ? '1' : '.5', { anchor: 'end', size: 10.5 }); }
      for (let t = 0; t <= pn.secs + 1e-9; t += pn.step) { b += line(X(t), B, X(t), B + 4, '#c3cad3'); b += text(X(t), B + 16, (Math.round(t * 10) / 10) + ' s', { anchor: 'middle', size: 10.5 }); }
      const r = sim(pn.o, pn.secs);
      show.forEach((bi, j) => { b += poly(r[bi].map(([t, v]) => [X(t), Y(v)]), cols[j], 2.2); });
    });
    let lx = 30; const ly = Hd - 12;
    show.forEach((bi, j) => { b += line(lx, ly - 4, lx + 22, ly - 4, cols[j], 2.6) + text(lx + 28, ly, 'band ' + (bi + 1), { size: 11.5, fill: TXT }); lx += 90; });
    b += text(Wd, ly, 'level of each band over time (before the AMP ENVELOPE)', { anchor: 'end', size: 11 });
    out(IMG + 'scaleenv-b.svg', svgDoc(Wd, Hd, b, 'Scale envelope: per-band attack spread and per-band decay times'));
  }
}

// ---------------------------------------------------------------- inline: tiling
// [name, theme, shaded by the atoms of a sawtooth (Daubechies 4) | the grid of atoms with the first atom of every band highlighted (the IMPULSE pattern)]
// intro-tiling-*: Figure 1 of the introduction (both manuals); tiling-b: the additive oscillator's chapter.
for (const [tname, E, saw] of [['intro-tiling-a', 'a', true], ['intro-tiling-b', 'b', true], ['tiling-b', 'b', false]]) {
  const T = TH[E];
  const Wd = 860, L = 262, R = Wd - 104, Tp = 52, rowH = 22, B = Tp + 11 * rowH;
  let b = '';
  const fx = 0, fw = 196;
  b += text(fx, 16, 'FOURIER VIEW', { size: 12.5, weight: 700, fill: TXT, ls: '0.06em' });
  b += text(fx, 34, 'each partial lasts the whole cycle', { size: 12, fill: MUT });
  for (let h = 1; h <= 11; h++) { const yy = B - h * rowH; b += rect(fx + 28, yy + 1, fw - 28, rowH - 2, h % 2 ? '#e9edf2' : '#dde3ea', { rx: 2 }); b += text(fx + 22, yy + rowH - 6, 'h' + h, { size: 11, fill: GREY, anchor: 'end' }); }
  b += text(fx + 28, B + 17, 'start', { size: 11.5 }) + text(fx + fw, B + 17, 'end of cycle', { size: 11.5, anchor: 'end' });
  b += text(fx + 28, B + 36, 'h = harmonic number', { size: 12, fill: MUT });
  b += text(L, 16, saw ? 'WAVELET VIEW · one Saw cycle, Daubechies 4' : 'WAVELET VIEW · the grid of atoms', { size: 12.5, weight: 700, fill: TXT, ls: '0.06em' });
  b += text(L, 34, 'each band ≈ one octave; finer bands: more, shorter atoms', { size: 12, fill: MUT });
  const coef = saw ? C.dwt(C.sourceCycle(0, 0.5), C.FILTERS[2]) : null;
  const lerp = (a, c, t) => Math.round(a + (c - a) * t);
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ramp = t => {
    const w = [240, 243, 246], a = hex(T.acc), d = hex(T.deep);
    const c = t < 0.6 ? w.map((v, i) => lerp(v, a[i], t / 0.6)) : a.map((v, i) => lerp(v, d[i], (t - 0.6) / 0.4));
    return `rgb(${c.join(',')})`;
  };
  const pw = R - L;
  for (let bnd = 1; bnd <= 11; bnd++) {
    const n = 1 << (bnd - 1), yy = B - bnd * rowH;
    b += text(L - 8, yy + rowH - 6, 'B' + bnd, { size: 11.5, fill: MUT, anchor: 'end', weight: 600 });
    b += text(R + 8, yy + rowH - 6, n === 1 ? '1 atom' : n + ' atoms', { size: 11.5, fill: MUT });
    const cols = Math.min(n, 128), gap = n <= 64 ? 1 : 0;
    for (let k = 0; k < cols; k++) {
      let t;
      if (saw) { let m = 0; const k0 = Math.floor(k * n / cols), k1 = Math.floor((k + 1) * n / cols); for (let q = k0; q < k1; q++) m = Math.max(m, Math.abs(coef[n + q])); const v = m * Math.pow(2, (bnd - 1) / 2) / Math.sqrt(N); t = v > 0 ? Math.max(0, Math.min(1, (20 * Math.log10(v) + 60) / 60)) : 0; }
      else t = (k === 0) ? 0.8 : 0.2;
      b += rect(L + k * pw / cols, yy + 1, pw / cols - gap, rowH - 2, ramp(t));
    }
    if (n > 128) b += text(L + pw / 2, yy + rowH - 6, n + ' atoms · too small to draw one by one', { size: 9.5, fill: '#56606c', anchor: 'middle' });
  }
  b += line(L, B + 3, R, B + 3, '#c3cad3');
  b += text(L, B + 17, '0°', { size: 11.5 }) + text(L + pw / 2, B + 17, '180°', { size: 11.5, anchor: 'middle' }) + text(R, B + 17, '360°', { size: 11.5, anchor: 'end' });
  b += `<path d="M${Wd - 10},${B - 4} V${Tp + 8}" stroke="${T.ink}" stroke-width="1.6" fill="none"/><path d="M${Wd - 10},${Tp} l-5,9 h10 z" fill="${T.ink}"/>`;
  b += `<text transform="translate(${Wd - 19},${f1((Tp + B) / 2)}) rotate(-90)" font-size="11.5" fill="${T.ink}" text-anchor="middle" font-weight="600">finer atoms · higher harmonics</text>`;
  if (saw) b += text(L, B + 37, 'Darker = bigger atom. The ramp is smooth, so its fine atoms are tiny;', { size: 12, fill: MUT }) + text(L, B + 53, 'only the jump at 0°/360° needs them.', { size: 12, fill: MUT });
  else b += text(L, B + 37, 'Highlighted: the first atom of every band — the only atoms', { size: 12, fill: MUT }) + text(L, B + 53, 'that the IMPULSE pattern switches on.', { size: 12, fill: MUT });
  const Hd = B + 60;
  SNIPS[tname] = svgDoc(Wd, Hd, b, saw ? 'Fourier view versus wavelet view: 11 bands with 1 to 1024 atoms, shaded by the atoms of a sawtooth' : 'Fourier view versus wavelet view: 11 bands with 1 to 1024 atoms', true);
}

// ---------------------------------------------------------------- inline: the introduction's figures (both manuals, in the theme of the manual)
// Figure 2: one cycle (a sawtooth, Daubechies 4), the 11 bands each put back as a waveform (the inverse transform of that band's atoms alone), and their sum.
for (const E of ['a', 'b']) {
  const T = TH[E];
  const Wd = 860, rowH = 24, Tp = 50, B = Tp + 11 * rowH, L = 262, R = 556;
  const f = C.FILTERS[2];   // Daubechies 4
  const x = C.sourceCycle(0, 0.5, 0), c = C.dwt(x, f);
  const layer = bnd => { const o = new Float64Array(N); for (let i = 1 << (bnd - 1); i < (1 << bnd); i++) o[i] = c[i]; return C.idwt(o, f); };
  const sum = new Float64Array(N), layers = [];
  for (let bnd = 1; bnd <= 11; bnd++) { const l = layer(bnd); layers.push(l); for (let i = 0; i < N; i++) sum[i] += l[i]; }
  const id = `ard${E}`;
  let b = `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${SLATE}"/></marker></defs>`;
  const arrow = (x1, y1, x2, y2) => `<path d="M${f1(x1)},${f1(y1)} L${f1(x2 - 1)},${f1(y2)}" stroke="${SLATE}" stroke-width="1.5" fill="none" marker-end="url(#${id})"/>`;
  // left: the source cycle
  const pw = 150, ph = 112, py = (Tp + B) / 2 - ph / 2 + 6;
  b += text(0, 16, 'ONE CYCLE', { size: 12.5, weight: 700, fill: TXT, ls: '0.06em' });
  b += text(0, 34, 'a sawtooth, 2048 samples', { size: 12, fill: MUT });
  b += panelFrame(0, py, pw, ph);
  b += poly(cyclePts(x, 6, py + 6, pw - 12, ph - 12, 0.92), T.ink, 2);
  b += arrow(pw + 10, (Tp + B) / 2, L - 34, (Tp + B) / 2);
  b += text((pw + L - 24) / 2 + 3, (Tp + B) / 2 - 8, 'wavelet', { anchor: 'middle', size: 11.5, fill: T.deep, weight: 700 });
  b += text((pw + L - 24) / 2 + 3, (Tp + B) / 2 + 20, 'transform', { anchor: 'middle', size: 11.5, fill: T.deep, weight: 700 });
  // middle: the bands
  b += text(L, 16, 'THE 11 BANDS, EACH PUT BACK AS A WAVEFORM', { size: 12.5, weight: 700, fill: TXT, ls: '0.06em' });
  b += text(L, 34, 'each row drawn at its own scale', { size: 12, fill: MUT });
  for (let bnd = 1; bnd <= 11; bnd++) {
    const n = 1 << (bnd - 1), yy = B - bnd * rowH, l = layers[bnd - 1];
    b += rect(L, yy + 1, R - L, rowH - 2, FAINT, { rx: 3 });
    b += line(L, yy + rowH / 2, R, yy + rowH / 2, '#dde3ea', 1);
    b += poly(cyclePts(l, L + 2, yy + 3, R - L - 4, rowH - 6, 0.96 / peak(l)), T.ink, 1.4);
    b += text(L - 8, yy + rowH - 8, 'B' + bnd, { size: 11.5, fill: MUT, anchor: 'end', weight: 600 });
    b += text(R + 8, yy + rowH - 8, n === 1 ? '1 atom' : n + ' atoms', { size: 11.5, fill: MUT });
  }
  b += text(L, B + 17, '0°', { size: 11.5 }) + text((L + R) / 2, B + 17, '180°', { size: 11.5, anchor: 'middle' }) + text(R, B + 17, '360°', { size: 11.5, anchor: 'end' });
  // right: the sum
  const rx = Wd - pw;
  b += arrow(R + 78, (Tp + B) / 2, rx - 8, (Tp + B) / 2);
  b += text((R + 78 + rx - 8) / 2, (Tp + B) / 2 - 8, 'inverse', { anchor: 'middle', size: 11.5, fill: T.deep, weight: 700 });
  b += text((R + 78 + rx - 8) / 2, (Tp + B) / 2 + 20, 'transform', { anchor: 'middle', size: 11.5, fill: T.deep, weight: 700 });
  b += text(rx, 16, 'THEIR SUM', { size: 12.5, weight: 700, fill: TXT, ls: '0.06em' });
  b += text(rx, 34, 'the same cycle, exactly', { size: 12, fill: MUT });
  b += panelFrame(rx, py, pw, ph);
  b += poly(cyclePts(x, rx + 6, py + 6, pw - 12, ph - 12, 0.92), GREY, 1.2);
  b += poly(cyclePts(sum, rx + 6, py + 6, pw - 12, ph - 12, 0.92), T.ink, 2);
  b += text(L, B + 38, 'Coarse bands carry the slow shape; each finer band adds smaller atoms,', { size: 12, fill: MUT }) + text(L, B + 54, 'and the sawtooth needs them only around its jump.', { size: 12, fill: MUT });
  SNIPS[`decomp-${E}`] = svgDoc(Wd, B + 62, b, 'One sawtooth cycle split by a Daubechies 4 wavelet transform into 11 bands of 1 to 1024 atoms, and rebuilt by their sum', true);
}

// Figure 3: the signal path (the same in both manuals; the colour is the manual's)
for (const E of ['a', 'b']) {
  const T = TH[E], Wd = 860, id = `arp${E}`;
  let b = `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${SLATE}"/></marker></defs>`;
  const box = (x, y, w, h, title, sub, kind) => {
    const fill = kind === 'acc' ? T.tint : kind === 'fx' ? '#f1f3f6' : '#ffffff', st = kind === 'acc' ? T.ink : '#c3cad3';
    let s = rect(x, y, w, h, fill, { rx: 8, stroke: st, sw: kind === 'acc' ? 1.5 : 1.2 });
    s += text(x + w / 2, y + (sub ? 20 : h / 2 + 5), title, { anchor: 'middle', size: 12.5, weight: 700, fill: kind === 'acc' ? T.deep : TXT, ls: '0.02em' });
    if (sub) sub.split('\n').forEach((ln, i) => { s += text(x + w / 2, y + 37 + i * 14.5, ln, { anchor: 'middle', size: 11.2, fill: MUT }); });
    return s;
  };
  const arrow = (x1, y1, x2, y2) => `<path d="M${f1(x1)},${f1(y1)} L${f1(x2 - 1)},${f1(y2)}" stroke="${SLATE}" stroke-width="1.5" fill="none" marker-end="url(#${id})"/>`;
  const down = (x, y1, y2) => `<path d="M${f1(x)},${f1(y1)} V${f1(y2 - 1)}" stroke="${SLATE}" stroke-width="1.5" fill="none" marker-end="url(#${id})"/>`;
  const plain = (x1, y1, x2, y2) => line(x1, y1, x2, y2, SLATE, 1.5);
  const tag = (x, y, s, anchor) => text(x, y, s, { size: 11, weight: 700, fill: GREY, ls: '0.08em', anchor: anchor || 'start' });
  const CW = 676, y1 = 36, h1 = 92;
  // the voice: a dashed frame
  b += tag(0, 13, 'FOR EVERY NOTE PLAYED: ONE VOICE (UP TO 16)');
  b += `<rect x="0" y="22" width="${CW}" height="216" rx="10" fill="none" stroke="#c3cad3" stroke-width="1.2" stroke-dasharray="5 4"/>`;
  const osc = [
    [12, 'A1 · SUBTRACTIVE', 'WAVE → wavelet transform\nSPARSITY · SOURCE PHASE\nWAVELET · WAVELET MORPH\nSCALE FILTER · POSITION'],
    [194, 'A2 · SUBTRACTIVE', 'WAVE → wavelet transform\nSPARSITY · SOURCE PHASE\nWAVELET · WAVELET MORPH\nSCALE FILTER · POSITION'],
    [376, 'B1 · ADDITIVE', 'PATTERN → inverse transform\nDRAWBARS · TILT · WAVELET\nband envelopes\nSCALE FILTER · POSITION'],
  ];
  osc.forEach(([x, t, s]) => { b += box(x, y1, 176, h1, t, s, 'acc'); });
  b += box(558, y1, 106, h1, 'SUB OSC', 'sine · tri · square\n−1 or −2 octaves\nno scale filter');
  // the bus into OSC MIX
  const cx = [100, 282, 464, 611], by = y1 + h1, busY = by + 14;
  cx.forEach(x => { b += plain(x, by, x, busY); });
  b += plain(cx[0], busY, cx[3], busY);
  b += down(cx[0], busY, 158);
  // row 2: the mix, the voice filter, the amp
  const y2 = 158, h2 = 56;
  b += box(12, y2, 176, h2, 'OSC MIX', 'levels of A1 · A2 · B1\nand the SUB OSC');
  b += arrow(188, y2 + h2 / 2, 216, y2 + h2 / 2);
  b += box(216, y2, 230, h2, 'FILTER (LADDER | OTA)', 'four-pole low-pass on frequencies\nFILTER ENVELOPE · open by default');
  b += arrow(446, y2 + h2 / 2, 474, y2 + h2 / 2);
  b += box(474, y2, 190, h2, 'AMP ENVELOPE', 'ADSR × velocity');
  b += text(12, 229, 'UNISON: up to four detuned, spread copies of every oscillator, inside the voice', { size: 11, fill: MUT });
  // the modulation box
  const mx = 692, mw = Wd - mx;
  b += rect(mx, 22, mw, 216, FAINT, { rx: 10, stroke: '#c3cad3', sw: 1.2 });
  b += text(mx + mw / 2, 44, 'MODULATION', { anchor: 'middle', size: 12.5, weight: 700, fill: TXT, ls: '0.02em' });
  ['AMP · MOD · FILTER', 'envelopes', '', 'own and pitch envelope', 'of each oscillator', '', 'LFO 1 · LFO 2 · LFO 3', '', 'velocity · mod wheel', 'pitch bend · keyboard'].forEach((ln, i) => { if (ln) b += text(mx + mw / 2, 66 + i * 15.5, ln, { anchor: 'middle', size: 11.2, fill: i === 0 || i === 6 ? TXT : MUT, weight: i === 0 || i === 6 ? 600 : 400 }); });
  b += `<path d="M${mx},130 L${CW + 1},130" stroke="${SLATE}" stroke-width="1.5" stroke-dasharray="4 3" fill="none" marker-end="url(#${id})"/>`;
  b += tag(Wd, 258, 'ALL VOICES TOGETHER', 'end');
  // row 3: the voices added, the effects, the output
  const y3 = 280, h3 = 40;
  const w3 = [124, 100, 78, 136, 76, 150, 48], t3 = ['SUM OF VOICES', 'SATURATION', 'CHORUS', 'PING-PONG DELAY', 'REVERB', 'VOLUME · LIMITER', 'OUT'];
  const x3 = [0]; for (let i = 1; i < w3.length; i++) x3.push(x3[i - 1] + w3[i - 1] + 20);
  b += `<path d="M569,${y2 + h2} V262 H${f1(x3[0] + w3[0] / 2)} V${y3 - 1}" stroke="${SLATE}" stroke-width="1.5" fill="none" marker-end="url(#${id})"/>`;
  t3.forEach((t, i) => { b += box(x3[i], y3, w3[i], h3, t, '', 'fx'); if (i) b += arrow(x3[i - 1] + w3[i - 1], y3 + h3 / 2, x3[i], y3 + h3 / 2); });
  SNIPS[`path-${E}`] = svgDoc(Wd, y3 + h3 + 4, b, 'Signal path: three wavelet oscillators and a sub oscillator, the voice filter and amp envelope, then the effects, volume and limiter', true);
}

module.exports = { SNIPS };
