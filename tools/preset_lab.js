// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Preset laboratory: renders a preset with the JS engine, measures it (loudness, attack, decay, brightness, pitch clarity) and draws
// contact sheets (amplitude envelope + spectrogram of each preset) as PNG files, so that a sound can be judged without playing it.
//   const lab = require('./preset_lab.js');
//   const r = lab.render(values, { note: 60, vel: 0.8, hold: 1.5, tail: 1 });   // { L, R, sr, n, onset, offAt }
//   const m = lab.measure(r);                                                    // numbers
//   lab.sheet(files, [{ label: 12, r }, ...], 'sheet.png');                      // a PNG sheet
// Command line: node tools/preset_lab.js <number|name> ...  writes tools/out/lab-<n>.png and prints the measures.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const SPEC = require('../web/js/spec.js');
const C = require('../web/js/core.js')(SPEC);
const P = C.P;
const sr = 48000;

function render(values, o = {}) {
  const note = o.note === undefined ? 60 : o.note, vel = o.vel === undefined ? 0.8 : o.vel;
  const hold = o.hold === undefined ? 1.5 : o.hold, tail = o.tail === undefined ? 1.2 : o.tail;
  const chord = o.chord || null;                       // [notes] played together instead of one note
  const params = Float64Array.from(values);
  if (o.set) for (const [k, v] of Object.entries(o.set)) params[P[k]] = v;
  const eng = new C.Engine(sr);
  params.forEach((v, i) => eng.setParam(i, v));
  eng.setTables(C.buildTables(params, true));
  const n = Math.round((hold + tail) * sr), L = new Float32Array(n), R = new Float32Array(n), blk = 128;
  const offAt = Math.round(hold * sr / blk) * blk;
  for (let s = 0; s < n; s += blk) {
    if (s === 0) { if (chord) for (const c of chord) eng.noteOn(c, vel); else eng.noteOn(note, vel); }
    if (s === offAt) { if (chord) for (const c of chord) eng.noteOff(c); else eng.noteOff(note); }
    eng.process(L.subarray(s, s + blk), R.subarray(s, s + blk), Math.min(blk, n - s));
  }
  return { L, R, sr, n, offAt, note };
}

// RMS envelope in dB per window (ms)
function envelope(r, win = 5) {
  const W = Math.round(win * sr / 1000), out = [];
  for (let s = 0; s + W <= r.n; s += W) {
    let e = 0; for (let i = s; i < s + W; i++) e += 0.5 * (r.L[i] * r.L[i] + r.R[i] * r.R[i]);
    out.push(10 * Math.log10(e / W + 1e-20));
  }
  return out;
}
const re = new Float64Array(2048), im = new Float64Array(2048);
const hann = Float64Array.from({ length: 2048 }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / 2048));
// magnitude spectrum (dB, bins 0..1023) of the mono mix around sample s
function spectrum(r, s) {
  for (let i = 0; i < 2048; i++) { const k = s + i; re[i] = k < r.n ? 0.5 * (r.L[k] + r.R[k]) * hann[i] : 0; im[i] = 0; }
  C.fft(re, im, false);
  const out = new Float64Array(1024);
  for (let b = 0; b < 1024; b++) out[b] = 20 * Math.log10(Math.hypot(re[b], im[b]) / 1024 + 1e-9);
  return out;
}
function centroid(r, s) {   // Hz
  const sp = spectrum(r, s);
  let a = 0, b = 0;
  for (let k = 1; k < 1024; k++) { const m = Math.pow(10, sp[k] / 20); a += m * k * sr / 2048; b += m; }
  return b > 0 ? a / b : 0;
}
function flatness(r, s) {   // 0 = tonal ... 1 = noise (bins up to 8 kHz)
  const sp = spectrum(r, s), top = Math.round(8000 * 2048 / sr);
  let lg = 0, ar = 0;
  for (let k = 2; k < top; k++) { const m = Math.pow(10, sp[k] / 20) + 1e-12; lg += Math.log(m); ar += m; }
  const n = top - 2;
  return Math.exp(lg / n) / (ar / n);
}
function pitchClarity(r, s, f0) {   // normalised autocorrelation at one period of the note (mono mix, 40 ms)
  const N = Math.round(0.04 * sr), T = Math.round(sr / f0);
  let c = 0, e0 = 0, e1 = 0;
  for (let i = 0; i < N; i++) { const a = s + i < r.n ? r.L[s + i] + r.R[s + i] : 0, b = s + i + T < r.n ? r.L[s + i + T] + r.R[s + i + T] : 0; c += a * b; e0 += a * a; e1 += b * b; }
  return e0 > 1e-12 && e1 > 1e-12 ? c / Math.sqrt(e0 * e1) : 0;
}
function measure(r) {
  const env = envelope(r, 5), pk = Math.max(...env), f0 = 440 * Math.pow(2, (r.note - 69) / 12);
  const peakIdx = env.indexOf(pk), msPer = 5;
  let attack = 0; for (let i = 0; i < env.length; i++) if (env[i] >= pk - 3) { attack = i * msPer; break; }
  let t20 = -1; for (let i = peakIdx; i < env.length; i++) if (env[i] <= pk - 20) { t20 = (i - peakIdx) * msPer; break; }
  const at = (ms) => { const i = Math.min(env.length - 1, Math.round(ms / msPer)); return env[i] - pk; };
  const offMs = r.offAt / sr * 1000;
  let relT = -1; const offI = Math.round(offMs / msPer);
  for (let i = offI; i < env.length; i++) if (env[i] <= env[offI] - 30) { relT = (i - offI) * msPer; break; }
  let peak = 0; for (let i = 0; i < r.n; i++) peak = Math.max(peak, Math.abs(r.L[i]), Math.abs(r.R[i]));
  let bad = 0; for (let i = 0; i < r.n; i++) if (!isFinite(r.L[i]) || !isFinite(r.R[i])) bad++;
  let dc = 0; for (let i = 0; i < r.n; i++) dc += r.L[i] + r.R[i]; dc /= 2 * r.n;
  const s50 = Math.round(0.05 * sr), s400 = Math.round(0.4 * sr), sHold = Math.max(0, r.offAt - Math.round(0.3 * sr));
  return {
    peakDb: pk, peak, bad, dc,
    attackMs: attack, t20Ms: t20,                       // decay time to -20 dB (-1: never within the render)
    lvl100: at(100), lvl500: at(500), lvl1000: at(1000), relMs: relT,   // levels re the peak, release time to -30 dB
    cen50: centroid(r, s50), cen400: centroid(r, s400), cenHold: centroid(r, sHold),
    flat400: flatness(r, s400), clarity: pitchClarity(r, s400, f0), f0,
  };
}
// the loudness the TOP Sounds are matched to: the loudest 200 ms of a held C major chord, in dB; a short sound (its loudest 50 ms
// more than 2.5 dB above its loudest 200 ms) is measured over 50 ms and counted 3 dB lower, as the drums were. win: a window in
// seconds forces one (> 0.06: 200 ms rule, else the short rule). Returns { db, peak, short }.
function chordLoudness(values, win) {
  const r = render(values, { chord: [60, 64, 67], vel: 0.85, hold: 2.5, tail: 0.5 });
  const pw = new Float64Array(r.n);
  let pk = 0;
  for (let i = 0; i < r.n; i++) { pw[i] = 0.5 * (r.L[i] * r.L[i] + r.R[i] * r.R[i]); pk = Math.max(pk, Math.abs(r.L[i]), Math.abs(r.R[i])); }
  const best = (w) => {
    const W = Math.round(w * sr);
    let s = 0, b = 0;
    for (let i = 0; i < r.n; i++) { s += pw[i]; if (i >= W) s -= pw[i - W]; if (i >= W - 1) b = Math.max(b, s / W); }
    return 10 * Math.log10(b + 1e-20);
  };
  const d200 = best(0.2), d50 = best(0.05);
  const short = win === undefined ? d50 - d200 > 2.5 : win <= 0.06;
  return { db: short ? d50 - 3 : d200, peak: pk, short, d200, d50 };
}

// ---------------------------------------------------------------- PNG output
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngWrite(file, W, H, rgb) {   // rgb: Uint8Array W*H*3
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const FONT = {   // 3x5 digits
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111',
};
function text(img, W, x, y, s, col, scale = 2) {
  for (const ch of String(s)) {
    const g = FONT[ch];
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) {
      const px = x + (i % 3) * scale + a, py = y + Math.floor(i / 3) * scale + b, o = (py * W + px) * 3;
      img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2];
    }
    x += 4 * scale;
  }
}
// cells: [{ label, r, m? }]: envelope (top) and spectrogram (log frequency 60 Hz - 12 kHz, 0 - secs) per cell
function sheet(cells, file, o = {}) {
  const cols = o.cols || 4, cw = o.cw || 300, ch = o.ch || 130, secs = o.secs || 2.6, envH = 38;
  const rows = Math.ceil(cells.length / cols), W = cols * cw, H = rows * ch;
  const img = new Uint8Array(W * H * 3).fill(18);
  const hop = 512, frames = Math.floor(secs * sr / hop), specH = ch - envH - 4;
  const fLo = 60, fHi = 12000;
  cells.forEach((cell, k) => {
    const ox = (k % cols) * cw, oy = Math.floor(k / cols) * ch, r = cell.r;
    // spectrogram
    const cols2 = cw - 8;
    for (let x = 0; x < cols2; x++) {
      const t = x / cols2 * secs, s = Math.round(t * sr);
      const sp = spectrum(r, s);
      for (let y = 0; y < specH; y++) {
        const f = fLo * Math.pow(fHi / fLo, 1 - y / (specH - 1)), b = Math.min(1023, Math.max(1, Math.round(f * 2048 / sr)));
        const v = Math.max(0, Math.min(1, (sp[b] + 100) / 70));
        const R = Math.round(255 * Math.pow(v, 1.6)), G = Math.round(255 * Math.pow(v, 0.9) * 0.9), B = Math.round(255 * (0.25 + 0.75 * v) * (v > 0.02 ? 1 : 0));
        const o2 = ((oy + envH + 2 + y) * W + ox + 4 + x) * 3;
        img[o2] = Math.min(255, R + 20); img[o2 + 1] = G; img[o2 + 2] = Math.min(255, B);
      }
    }
    // envelope: dB from -60 to 0 (re the cell's peak), note off marked
    const env = envelope(r, 5), pk = Math.max(...env);
    let prevY = null;
    for (let x = 0; x < cols2; x++) {
      const i = Math.min(env.length - 1, Math.round(x / cols2 * secs * 1000 / 5)), v = Math.max(0, Math.min(1, (env[i] - pk + 60) / 60));
      const y = envH - 2 - Math.round(v * (envH - 6));
      for (let yy = y; yy < envH - 2; yy++) { const o2 = ((oy + yy) * W + ox + 4 + x) * 3; img[o2] = 20; img[o2 + 1] = 70; img[o2 + 2] = 90; }
      const o3 = ((oy + y) * W + ox + 4 + x) * 3; img[o3] = 47; img[o3 + 1] = 212; img[o3 + 2] = 198;
      prevY = y;
    }
    const xo = Math.round(r.offAt / sr / secs * cols2);
    for (let yy = 0; yy < envH; yy += 2) { const o2 = ((oy + yy) * W + ox + 4 + xo) * 3; img[o2] = 255; img[o2 + 1] = 174; img[o2 + 2] = 66; }
    text(img, W, ox + 6, oy + 3, cell.label, [255, 255, 255]);
    // cell border
    for (let x = 0; x < cw; x++) { const o2 = ((oy + ch - 1) * W + ox + x) * 3; img[o2] = img[o2 + 1] = img[o2 + 2] = 60; }
    for (let y = 0; y < ch; y++) { const o2 = ((oy + y) * W + ox + cw - 1) * 3; img[o2] = img[o2 + 1] = img[o2 + 2] = 60; }
  });
  pngWrite(file, W, H, img);
}

module.exports = { render, measure, envelope, spectrum, centroid, flatness, chordLoudness, sheet, sr, C, SPEC, P };

if (require.main === module) {
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const names = process.argv.slice(2);
  const cells = [];
  for (const a of names) {
    const idx = /^\d+$/.test(a) ? +a : SPEC.PRESETS.findIndex(p => p.name.includes(a)), pr = SPEC.PRESETS[idx];
    if (!pr) { console.log('no preset ' + a); continue; }
    const r = render(pr.values), m = measure(r);
    console.log(pr.name.padEnd(36), Object.entries(m).map(([k, v]) => `${k} ${typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : v}`).join('  '));
    cells.push({ label: idx, r });
  }
  if (cells.length) { sheet(cells, path.join(out, 'lab.png')); console.log('sheet: ' + path.join(out, 'lab.png')); }
}
