// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Test copy only (tools/make_test_copy.js --ab): a small A/B panel for the owner's listening test of version 1.0.15. It switches the two hidden performance settings of the
// output stage: OUTPUT (the look-ahead limiter of 1.0.15 / the Classic stage of 1.0.14) and CHORD COMP (the voice-count compensation of beta 0.3.2). The released app has no such panel.
(function () {
  'use strict';
  const T = window.WS_TEST;
  if (!T) return;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;background:#14161c;color:#e8e2d0;border:1px solid #c9a24a;border-radius:8px;' +
    'padding:10px 12px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5);min-width:230px';
  const title = document.createElement('div');
  title.textContent = 'TEST 1.0.15 · étage de sortie';
  title.style.cssText = 'font-weight:700;letter-spacing:.04em;margin-bottom:6px;color:#c9a24a';
  box.appendChild(title);
  const row = (label, key, names) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin:4px 0';
    const l = document.createElement('span'); l.textContent = label;
    const b = document.createElement('button');
    b.style.cssText = 'cursor:pointer;border-radius:5px;border:1px solid #c9a24a;padding:3px 9px;font:600 12px system-ui,sans-serif;min-width:118px';
    const show = () => {
      const on = T.getParam(key) >= 0.5;
      b.textContent = on ? names[1] : names[0];
      b.style.background = on ? '#c9a24a' : '#2a2d36'; b.style.color = on ? '#14161c' : '#e8e2d0';
    };
    b.onclick = () => { T.setParam(key, T.getParam(key) >= 0.5 ? 0 : 1); show(); };
    show();
    r.appendChild(l); r.appendChild(b); box.appendChild(r);
  };
  row('Sortie', 'out_mode', ['CLASSIC (1.0.14)', 'LIMITEUR (1.0.15)']);
  row('Compensation accords', 'poly_comp', ['OFF', 'ON (comme 1.0.14)']);
  const note = document.createElement('div');
  note.textContent = 'Jouez des accords forts et denses : comparez les deux sorties.';
  note.style.cssText = 'margin-top:6px;color:#9a9484;font-size:11px;max-width:230px';
  box.appendChild(note);
  const add = () => document.body.appendChild(box);
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
