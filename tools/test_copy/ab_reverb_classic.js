// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Test copy only (tools/make_test_copy.js --module ab_reverb_classic): the owner's listening test of the improved Classic reverb (version 1.0.16). A / B: ACTUELLE = the
// reverb of 1.0.15 (STEREO 0, PRE 0, DAMP 0.25, LOW CUT off: the same sound bit for bit), AMÉLIORÉE = the sliders' values. The settings are global hidden performance settings
// (fx_rstereo, fx_rpre, fx_rdamp, fx_rhp, fx_rwidth): every preset with reverb, the demo too, plays them. The released app has no such panel.
(function () {
  'use strict';
  const T = window.WS_TEST;
  if (!T) return;
  const DEF = { fx_rstereo: 0, fx_rpre: 0, fx_rdamp: 0.25, fx_rhp: 20, fx_rwidth: 1 };          // the reverb of 1.0.15
  const want = { fx_rstereo: 0.6, fx_rpre: 0.02, fx_rdamp: 0.4, fx_rhp: 150, fx_rwidth: 1 };     // the improved one (the defaults of 1.0.16)
  let improved = true;
  const apply = () => { for (const k of Object.keys(DEF)) T.setParam(k, improved ? want[k] : DEF[k]); };
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;background:#14161c;color:#e8e2d0;border:1px solid #c9a24a;border-radius:8px;' +
    'padding:10px 12px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5);width:270px';
  const title = document.createElement('div');
  title.textContent = 'TEST 1.0.16 · réverbe Classic améliorée';
  title.style.cssText = 'font-weight:700;letter-spacing:.03em;margin-bottom:6px;color:#c9a24a';
  box.appendChild(title);
  const line = () => { const r = document.createElement('div'); r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin:5px 0'; box.appendChild(r); return r; };
  // A / B
  const r0 = line(), l0 = document.createElement('span'), b = document.createElement('button');
  l0.textContent = 'Réverbe';
  b.style.cssText = 'cursor:pointer;border-radius:5px;border:1px solid #c9a24a;padding:3px 9px;font:600 12px system-ui,sans-serif;min-width:140px';
  const showAB = () => { b.textContent = improved ? 'AMÉLIORÉE' : 'ACTUELLE (1.0.15)'; b.style.background = improved ? '#c9a24a' : '#2a2d36'; b.style.color = improved ? '#14161c' : '#e8e2d0'; };
  b.onclick = () => { improved = !improved; apply(); showAB(); };
  r0.appendChild(l0); r0.appendChild(b);
  // the sliders (moving one plays the improved reverb)
  const slider = (label, key, min, max, step, fmt) => {
    const r = line(), l = document.createElement('span'), s = document.createElement('input'), v = document.createElement('span');
    l.textContent = label; l.style.minWidth = '92px';
    s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = want[key]; s.style.flex = '1';
    v.style.cssText = 'min-width:52px;text-align:right;font-variant-numeric:tabular-nums';
    const show = () => { v.textContent = fmt(+s.value); };
    s.oninput = () => { want[key] = +s.value; if (!improved) { improved = true; showAB(); } apply(); show(); };
    show();
    r.appendChild(l); r.appendChild(s); r.appendChild(v);
  };
  slider('Entrée stéréo', 'fx_rstereo', 0, 1, 0.01, x => Math.round(x * 100) + ' %');
  slider('Pré-délai', 'fx_rpre', 0, 0.1, 0.001, x => Math.round(x * 1000) + ' ms');
  slider('Amortissement', 'fx_rdamp', 0, 0.6, 0.01, x => x.toFixed(2));
  slider('Coupe-bas', 'fx_rhp', 20, 300, 1, x => (x <= 20 ? 'off' : Math.round(x) + ' Hz'));
  slider('Largeur', 'fx_rwidth', 0, 1, 0.01, x => Math.round(x * 100) + ' %');
  const note = document.createElement('div');
  note.textContent = 'Même algorithme que la réverbe actuelle. ACTUELLE = le son de la 1.0.15 au bit près. Tous les presets avec réverbe, et la démo, jouent ces réglages.';
  note.style.cssText = 'margin-top:6px;color:#9a9484;font-size:11px';
  box.appendChild(note);
  apply(); showAB();
  const add = () => document.body.appendChild(box);
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
