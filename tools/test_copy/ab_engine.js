// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Test copy only (tools/make_test_copy.js --module ab_engine): the owner's comparison of the two sound engines of the web app, the JavaScript one (web/js/core.js) and the
// C++ one compiled to WebAssembly (vst/src/dsp.h, wasm/build.sh). A button switches the engine (WS_TEST.setEngine: the sound restarts, the demo starts again from its
// beginning); the panel shows the engine that really plays and, where the browser counts them (AudioContext.playbackStats: Chrome, Edge), the dropouts since the last
// switch (render quanta the audio thread could not deliver in time: a crackle each). The released app has no such panel.
(function () {
  'use strict';
  const T = window.WS_TEST;
  if (!T || !T.setEngine) return;
  const box = document.createElement('div');
  box.id = 'ab-engine';
  box.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;background:#14161c;color:#e8e2d0;border:1px solid #c9a24a;border-radius:8px;' +
    'padding:10px 12px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5);min-width:250px';
  const title = document.createElement('div');
  title.textContent = 'TEST · moteur de son';
  title.style.cssText = 'font-weight:700;letter-spacing:.04em;margin-bottom:6px;color:#c9a24a';
  box.appendChild(title);
  const line = (label) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin:4px 0';
    const l = document.createElement('span'); l.textContent = label;
    const v = document.createElement('span'); v.style.cssText = 'font-weight:600;text-align:right';
    r.appendChild(l); r.appendChild(v); box.appendChild(r);
    return { r, v };
  };
  // the switch: Moteur : JS / WASM
  const sw = line('Moteur :');
  sw.v.textContent = '';
  const btn = (name, kind) => {
    const b = document.createElement('button');
    b.textContent = name; b.dataset.engine = kind;
    b.style.cssText = 'cursor:pointer;border:1px solid #c9a24a;padding:3px 10px;font:600 12px system-ui,sans-serif;min-width:58px';
    b.onclick = () => choose(kind);
    sw.v.appendChild(b);
    return b;
  };
  const bJs = btn('JS', 'js'), bWasm = btn('WASM', 'wasm');
  bJs.style.borderRadius = '5px 0 0 5px'; bWasm.style.borderRadius = '0 5px 5px 0'; bWasm.style.borderLeft = 'none';
  const run = line('En marche :');
  const drop = line('Décrochages :');
  drop.v.title = 'depuis le dernier changement de moteur (AudioContext.playbackStats)';
  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9a9484;font-size:11px;max-width:250px';
  note.textContent = 'Le changement relance le son (la démo repart du début). Comparez le son et les craquements.';
  box.appendChild(note);
  let base = null, busy = false;
  // the dropouts are counted from the switch (or from the first reading)
  const statsNow = () => (T.playbackStats ? T.playbackStats() : null);
  function show() {
    const e = T.engine();
    for (const b of [bJs, bWasm]) {
      const on = b.dataset.engine === e.wanted;
      b.style.background = on ? '#c9a24a' : '#2a2d36'; b.style.color = on ? '#14161c' : '#e8e2d0';
    }
    run.v.textContent = busy ? '…' : e.running === 'none' ? 'aucun (son arrêté)' : e.running === 'wasm' ? 'WASM' + (e.simd ? ' (SIMD)' : ' (scalaire)') : 'JS';
    run.v.style.color = e.err ? '#e07a5f' : '';
    run.v.title = e.err ? 'erreur : ' + e.err : '';
    if (e.running === 'none') { drop.v.textContent = '—'; drop.v.style.color = ''; base = null; return; }
    const s = statsNow();
    if (!s) { drop.v.textContent = 'non mesurés par ce navigateur'; return; }
    if (!base) base = s;
    const ev = s.underrunEvents - base.underrunEvents, ms = 1000 * (s.underrunDuration - base.underrunDuration);
    drop.v.textContent = `${ev} (${ms.toFixed(0)} ms)`;
    drop.v.style.color = ev > 0 ? '#e07a5f' : '#8fbf7f';
  }
  function choose(kind) {
    if (busy) return;
    busy = true; show();
    T.setEngine(kind).catch(() => {}).then(() => { busy = false; base = statsNow(); show(); });
  }
  setInterval(show, 500);
  const add = () => { document.body.appendChild(box); show(); };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
