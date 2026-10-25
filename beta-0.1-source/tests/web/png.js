// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// png.js - minimal PNG decoder (8-bit, non-interlaced, gray/RGB/RGBA - what Chromium's
// Page.captureScreenshot produces) plus simple image statistics. No npm packages.
'use strict';
const zlib = require('zlib');

function decodePng(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('not a PNG');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG (depth ${depth}, interlace ${interlace})`);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error('unsupported PNG colour type ' + ctype);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const dst = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? dst[x - ch] : 0, b = prev ? prev[x] : 0, c = prev && x >= ch ? prev[x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      dst[x] = v & 255;
    }
  }
  return { width: w, height: h, channels: ch, data: px };
}

function rgbAt(img, x, y) {
  const i = (y * img.width + x) * img.channels;
  if (img.channels >= 3) return [img.data[i], img.data[i + 1], img.data[i + 2]];
  return [img.data[i], img.data[i], img.data[i]];
}

// distinct colours (sampled) and luminance standard deviation: detects blank/uniform screens
function imageStats(img, step = 3) {
  const colors = new Set();
  let s = 0, s2 = 0, n = 0;
  for (let y = 0; y < img.height; y += step)
    for (let x = 0; x < img.width; x += step) {
      const [r, g, b] = rgbAt(img, x, y);
      if (colors.size < 5000) colors.add((r << 16) | (g << 8) | b);
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      s += l; s2 += l * l; n++;
    }
  const mean = s / n;
  return { distinctColors: colors.size, lumaMean: mean, lumaStd: Math.sqrt(Math.max(0, s2 / n - mean * mean)) };
}

// mean absolute RGB difference (0..255) and fraction of changed pixels; null if sizes differ
function imageDiff(a, b, step = 2) {
  if (a.width !== b.width || a.height !== b.height) return null;
  let sum = 0, changed = 0, n = 0;
  for (let y = 0; y < a.height; y += step)
    for (let x = 0; x < a.width; x += step) {
      const p = rgbAt(a, x, y), q = rgbAt(b, x, y);
      const d = (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2])) / 3;
      sum += d; if (d > 8) changed++; n++;
    }
  return { meanAbs: sum / n, changedFraction: changed / n };
}

module.exports = { decodePng, imageStats, imageDiff };
