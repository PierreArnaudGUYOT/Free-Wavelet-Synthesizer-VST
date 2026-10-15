// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre). Release beta 0.1.
// Minimal Standard MIDI File reader (format 0/1) for the browser and Node.
// Input: Uint8Array (a Node Buffer works too). Output: notes with times in seconds.
function WSReadMIDI(bytes) {
  'use strict';
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let p = 0;
  const u32 = () => { const v = ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]; p += 4; return v; };
  const u16 = () => { const v = (b[p] << 8) | b[p + 1]; p += 2; return v; };
  const str = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(b[p + i]); p += n; return s; };
  if (b.length < 14 || str(4) !== 'MThd') throw new Error('not a MIDI file');
  const hlen = u32(), format = u16(), ntrk = u16(), division = u16();
  p = 8 + hlen;
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  if (!division) throw new Error('bad MIDI header');
  // A file can be damaged or hostile: every length read from it is limited to the bytes really there.

  const tempos = [], raw = [], meta = [];
  for (let t = 0; t < ntrk && p + 8 <= b.length; t++) {
    if (str(4) !== 'MTrk') throw new Error('bad track header');
    const len = u32(), end = Math.min(b.length, p + len);
    let tick = 0, status = 0;
    const vlq = () => { let v = 0, c, k = 0; do { c = b[p++]; v = (v * 128) + (c & 0x7f); } while ((c & 0x80) && p < end && ++k < 4); return v; };   // at most 4 bytes
    while (p < end) {
      tick += vlq();
      if (b[p] & 0x80) status = b[p++];
      if (status === 0xff) {
        const type = b[p++], l = Math.max(0, Math.min(vlq(), end - p));
        if (type === 0x51 && l >= 3) { const us = (b[p] << 16) | (b[p + 1] << 8) | b[p + 2]; if (us > 0) tempos.push({ tick, us }); }
        else if (type >= 1 && type <= 7) { let s = ''; for (let i = 0; i < l; i++) s += String.fromCharCode(b[p + i]); meta.push({ tick, type, text: s, track: t }); }
        p += l;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq();
      } else {
        const hi = status & 0xf0, ch = status & 0x0f;
        const d1 = b[p++], d2 = (hi === 0xc0 || hi === 0xd0) ? 0 : b[p++];
        if (!(d1 < 128 && d2 < 128)) continue;   // truncated or invalid data bytes
        if (hi === 0x90 && d2 > 0) raw.push({ tick, on: true, ch, note: d1, vel: d2, track: t });
        else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) raw.push({ tick, on: false, ch, note: d1, vel: 0, track: t });
      }
    }
    p = end;
  }
  // tick -> seconds through the tempo map
  tempos.sort((x, y) => x.tick - y.tick);
  if (!tempos.length || tempos[0].tick > 0) tempos.unshift({ tick: 0, us: 500000 });
  const segs = []; let acc = 0;
  for (let i = 0; i < tempos.length; i++) {
    segs.push({ tick: tempos[i].tick, sec: acc, us: tempos[i].us });
    if (i + 1 < tempos.length) acc += (tempos[i + 1].tick - tempos[i].tick) * tempos[i].us / 1e6 / division;
  }
  const sec = (tick) => {   // last tempo segment starting at or before tick (binary search: files can hold many tempo changes)
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid].tick <= tick) lo = mid; else hi = mid - 1; }
    const s = segs[lo];
    return s.sec + (tick - s.tick) * s.us / 1e6 / division;
  };

  raw.sort((x, y) => x.tick - y.tick || (x.on === y.on ? 0 : x.on ? 1 : -1));
  const open = new Map(), notes = [];
  for (const e of raw) {
    const key = e.track * 4096 + e.ch * 128 + e.note;
    if (e.on) {
      if (open.has(key)) notes.push(Object.assign({}, open.get(key), { endTick: e.tick }));
      open.set(key, { tick: e.tick, note: e.note, vel: e.vel, track: e.track, ch: e.ch });
    } else if (open.has(key)) { notes.push(Object.assign({}, open.get(key), { endTick: e.tick })); open.delete(key); }
  }
  for (const n of notes) { n.t = sec(n.tick); n.d = sec(n.endTick) - n.t; }
  notes.sort((x, y) => x.t - y.t || x.note - y.note);
  const title = (meta.find(m => m.type === 3 && m.track === 0 && !/control track/i.test(m.text)) || {}).text || '';
  return { format, ntrk, division, tempos, meta, notes, title };
}
if (typeof module !== 'undefined') module.exports = WSReadMIDI;
