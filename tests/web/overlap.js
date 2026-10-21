// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// overlap.js - the owner's layout rule (2026-10-21, "for the future implementations"): NOTHING OVERLAPS. Every widget of the cards shown has an "ink" (what is really drawn: the
// ring of a knob with its stroke, the text of a knob's label and of a card's title, the box of every other widget); no two inks of one card may intersect, no ink may leave its card
// (the card's 1 px border is allowed: a tab bar or a strip is flush with it), and no two cards may intersect (the plate behind the oscillator cards is a frame, not a card).
// `expression` is evaluated in the page (tests/web/smoke.js, any state of the panel): it returns a JSON array of the problems, empty when the layout is clean.
// The same rule is checked on the spec's numbers by tests/quick.js (the plug-in has the same layout), without the text.
'use strict';
function probe() {
  const dev = document.getElementById('device');
  const z = dev.getBoundingClientRect().width / 1100 || 1;   // the zoom of the panel is divided out: the numbers are panel pixels
  const shown = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
  const rect = (r) => ({ x0: r.left / z, y0: r.top / z, x1: r.right / z, y1: r.bottom / z });
  const textRect = (e) => { const r = document.createRange(); r.selectNodeContents(e); return rect(r.getBoundingClientRect()); };
  const name = (w) => (w.title || w.className).split(' — ')[0];
  const cards = [];
  for (const sec of dev.querySelectorAll('.section')) {
    if (!shown(sec)) continue;
    const ink = [], t = sec.querySelector(':scope > .title');
    if (t && shown(t) && t.textContent.trim()) ink.push(Object.assign(textRect(t), { what: 'title' }));
    for (const w of sec.querySelectorAll(':scope > .w')) {
      if (!shown(w)) continue;
      if (w.classList.contains('knob')) {
        const arc = w.querySelector('svg path');
        if (arc) { const r = rect(arc.getBoundingClientRect()), s = (+arc.getAttribute('stroke-width') || 0) / 2; ink.push({ x0: r.x0 - s, y0: r.y0 - s, x1: r.x1 + s, y1: r.y1 + s, what: 'knob ' + name(w), w }); }
        const l = w.querySelector('.label');
        if (l && shown(l) && l.textContent.trim()) ink.push(Object.assign(textRect(l), { what: 'label of ' + name(w), w }));
      } else ink.push(Object.assign(rect(w.getBoundingClientRect()), { what: w.className.replace(/^w /, '') + ' ' + name(w), w }));
    }
    cards.push({ id: sec.dataset.sid, box: rect(sec.getBoundingClientRect()), ink });
  }
  const hit = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.5 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.5;
  const f = (n) => n.toFixed(1), out = [];
  for (const { id, box, ink } of cards) {
    for (let i = 0; i < ink.length; i++) {
      const a = ink[i];
      if (a.x0 < box.x0 - 1.5 || a.y0 < box.y0 - 1.5 || a.x1 > box.x1 + 1.5 || a.y1 > box.y1 + 1.5) out.push(id + ': ' + a.what + ' leaves the card by ' + f(Math.max(box.x0 - a.x0, box.y0 - a.y0, a.x1 - box.x1, a.y1 - box.y1)) + ' px');
      for (let j = i + 1; j < ink.length; j++) {
        const b = ink[j];
        if (a.w && a.w === b.w) continue;   // a knob's own ring and label
        if (hit(a, b)) out.push(id + ': ' + a.what + ' overlaps ' + b.what + ' (' + f(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) + ' x ' + f(Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) + ' px)');
      }
    }
  }
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    if (cards[i].id === 'oscframe' || cards[j].id === 'oscframe') continue;
    if (hit(cards[i].box, cards[j].box)) out.push('cards ' + cards[i].id + ' and ' + cards[j].id + ' overlap');
  }
  return JSON.stringify(out);
}
module.exports = '(' + probe.toString() + ')()';
