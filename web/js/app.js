// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.7).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// Web application: audio, parameters, presets, MIDI, keyboard, manuals, demo.
(function () {
  'use strict';
  const SPEC = WS_SPEC, C = WSCoreFactory(SPEC), P = C.P;
  // Version 1.0.7: the engine reads 11 entries of the spec (the whole of it is 300 KB: the presets, their descriptions, the demo's data); the worklet and the Workers get these, not a copy of everything
  const SPEC_CORE = {};
  for (const k of ['PARAMS', 'SLOTS', 'ROLES', 'LFO2_ROLE', 'LFO2_TARGETS', 'WAVELETS', 'CHORDS', 'CHORD_KEYS', 'MICRO', 'DELAY_BEATS', 'LFO_BEATS']) SPEC_CORE[k] = SPEC[k];
  const PARAMS = SPEC.PARAMS;
  const values = Float64Array.from(C.defaults());
  const $ = id => document.getElementById(id);

  let actx = null, node = null, sampleRate = 0, startPromise = null;
  let live = null, lastLevel = { peakL: 0, peakR: 0 };
  const localKeys = new Set();
  let kbBase = 60;
  let presetId = 'f:' + SPEC.DEFAULT_PRESET, presetName = SPEC.PRESETS[SPEC.DEFAULT_PRESET].name, dirty = false;
  let buildTimer = null, lastBuild = 0;
  let demo = null;

  // ---------------------------------------------------------------- storage (optional)
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* storage unavailable */ } },
  };
  let userPresets = store.get('mw.user', []);
  if (!Array.isArray(userPresets)) userPresets = [];
  // beta 0.6 (security review): stored data is untrusted (other pages of the same site share it): well-formed entries only
  userPresets = userPresets.filter(p => p && typeof p === 'object' && typeof p.name === 'string' && p.values && typeof p.values === 'object')
    .map(p => ({ name: p.name.slice(0, 40), values: p.values }));

  // Okto MultiWave Synth: the performance settings (perf: CHORD, its type, octave, voicing, bass, strum) are not part of a sound: a
  // preset or an export never holds them (withPerf = false); the state saved by this page keeps them
  const toKeyed = (withPerf) => { const o = {}; PARAMS.forEach((p, i) => { if (!p.hidden && (withPerf || !p.perf)) o[p.key] = +values[i].toFixed(6); }); return o; };

  // ---------------------------------------------------------------- parameters
  function post(msg, transfer) { if (node) node.port.postMessage(msg, transfer || []); }
  // a preset change (applyKeyed) holds the parameter messages and sends them with the tables in ONE message (see applyKeyed)
  let hold = null;

  function setParam(i, v, user) {
    const p = PARAMS[i];
    v = Math.min(p.max, Math.max(p.min, v));
    if (p.curve === 'int' || p.curve === 'choice') v = Math.round(v);
    if (values[i] === v) return;
    const needs = C.tableNeeds(values), morph = C.morphNeeded(values), vsig = C.variantSig(values);
    values[i] = v;
    if (hold) hold.n++; else post({ t: 'p', i, v });
    ui.refresh(i);
    // an oscillator's level rebuilds the tables only when it reaches or leaves 0 (it plays or not); the WAVELET MORPH when it
    // starts or stops needing the WAVELET 2 tables; an LFO when it starts or stops moving the SOURCE PHASE, SPARSITY or SOURCE WIDTH (the variants tables); the
    // OSC tabs only choose the oscillator shown (its display is built again, the sound does not change)
    if (p.structural || C.tableNeeds(values) !== needs) scheduleDisplay();   // beta 0.3: also when an oscillator starts or stops playing (the scope shows them all)
    if ((p.structural && i !== P.osc_view) || C.tableNeeds(values) !== needs || C.morphNeeded(values) !== morph ||
        C.variantSig(values) !== vsig) scheduleBuild();
    // the OSC tabs only choose the panel shown: switching them does not modify the sound
    if (user && !p.hidden && !p.perf && i !== P.osc_view) { if (!dirty) { dirty = true; ui.setPresetName(presetName, true); } }
    if (user && !p.hidden) saveStateSoon();
  }

  // Table building (the sound's tables, up to four oscillators each with its morph and phase sets): in a Worker when the browser
  // lets this page start one (the page stays free to move, 7 to 200 ms of work), else here. A build asked for by a preset
  // load (build()) is made at once on this thread, so that the notes that follow find their tables; a knob being moved asks for
  // a build in the Worker (scheduleBuild), which does at most one at a time and then the latest request. Every request
  // has a number: a result older than the last one delivered is dropped.
  let worker = null, workerReady = false, workerBusy = false, workerAgain = false, buildSeq = 0, deliveredSeq = 0, heldTables = null;
  const workerUrl = () => {
    const src = 'const WSCoreFactory = ' + WSCoreFactory.toString() + ';\n' +
      'let C = null;\n' +
      'onmessage = (e) => {\n' +
      '  const m = e.data;\n' +
      '  if (m.spec) { C = WSCoreFactory(m.spec); postMessage({ ready: 1 }); return; }\n' +
      '  const tb = C.buildTables(m.values, true), tr = [];\n' +
      '  const add = s => { if (!s) return; tr.push(s.mips.buffer, s.rms.buffer); if (s.ph) s.ph.forEach(add); if (s.w2) add(s.w2); };\n' +
      '  tb.slots.forEach(add);\n' +
      '  postMessage({ seq: m.seq, tb }, tr);\n' +
      '};\n';
    return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(src);
  };
  function startWorker() {
    try {
      worker = new Worker(workerUrl());
      worker.onmessage = (e) => {
        if (e.data.ready) { workerReady = true; return; }
        workerBusy = false;
        if (e.data.seq > deliveredSeq) { deliveredSeq = e.data.seq; deliver(e.data.tb); }
        if (workerAgain) { workerAgain = false; build(true); }
      };
      worker.onerror = () => { worker = null; workerReady = false; workerBusy = false; };   // not allowed here (file:// in some browsers): build on this thread
      worker.postMessage({ spec: SPEC_CORE });
    } catch (_) { worker = null; workerReady = false; }
  }
  startWorker();

  // Version 1.0.6: the demo asks for the tables of the next preset a few seconds ahead (prebuild), in a Worker of its own: at the change itself the main thread only sends them. Building them there
  // took 60 to 190 ms for the heavy presets, during which the page (and, on a slow machine, the audio) stood still. { key: the values they are for, tb }
  let prebuilt = null, pworker = null, pready = false, pwant = null, pwait = null;
  function startPreWorker() {
    try {
      pworker = new Worker(workerUrl());
      pworker.onmessage = (e) => {
        if (e.data.ready) { pready = true; if (pwant) { const w = pwant; pwant = null; prebuild(w); } return; }
        if (pwait) prebuilt = { key: pwait, tb: e.data.tb };
        pwait = null;
      };
      pworker.onerror = () => { pworker = null; pready = false; };
      pworker.postMessage({ spec: SPEC_CORE });
    } catch (_) { pworker = null; pready = false; }
  }
  function prebuild(vals) {
    if (!pworker) startPreWorker();
    if (!pworker) return;
    if (!pready) { pwant = vals; return; }
    const key = vals.join(',');
    if (prebuilt && prebuilt.key === key) return;
    prebuilt = null; pwait = key;
    pworker.postMessage({ seq: 0, values: Float64Array.from(vals) });
  }

  // the tables to the worklet (their arrays are transferred); held until the audio has started
  function deliver(tb, all, at) {   // all (a preset change): the values go with the tables, in one message; at (version 1.0.8): the song time the audio thread makes the change at
    if (!node) { heldTables = tb; return; }
    const transfer = [];
    const pack = s => {
      if (!s) return null;
      transfer.push(s.mips.buffer, s.rms.buffer);
      const o = { mode: s.mode, mips: s.mips, rms: s.rms };
      if (s.ph) { o.vk = s.vk; o.ph = s.ph.map(pack); }
      if (s.w2) o.w2 = pack(s.w2);
      return o;
    };
    post(all ? Object.assign({ t: 'bulk', v: Array.from(all), tables: { needs: tb.needs, slots: tb.slots.map(pack) } }, at !== undefined ? { at } : null) : { t: 'tables', tables: { needs: tb.needs, slots: tb.slots.map(pack) } }, transfer);
  }
  let buildTimer2 = null, displayKey = '';
  // the display is a function of the values: built again only when they changed since the last one (version 1.0.7)
  function buildDisplay() {
    const key = values.join(',');
    if (key === displayKey) return;
    displayKey = key;
    ui.setTables(C.buildTables(values, false));
  }
  function scheduleBuild() {
    if (buildTimer) return;
    buildTimer = setTimeout(() => { buildTimer = null; build(true); }, Math.max(0, 45 - (performance.now() - lastBuild)));
  }
  // the display of the oscillator shown (its source, its atoms, the scope and the scalogram)
  function scheduleDisplay() {
    if (buildTimer2) return;
    buildTimer2 = setTimeout(() => { buildTimer2 = null; buildDisplay(); }, 20);
  }
  // inWorker: a knob being moved (the Worker builds, if it can); else at once, here
  function build(inWorker, bulk, tables) {
    lastBuild = performance.now();
    const seq = ++buildSeq;
    if (inWorker === true && worker && workerReady) {
      if (workerBusy) workerAgain = true;
      else { workerBusy = true; worker.postMessage({ seq, values: Float64Array.from(values) }); }
    } else {
      deliveredSeq = seq;
      if (buildTimer) { clearTimeout(buildTimer); buildTimer = null; }   // (a build of the Worker asked for by a parameter of this very change: this one has it all)
      deliver(tables || C.buildTables(values, true), bulk ? values : null);
    }
    if (buildTimer2) { clearTimeout(buildTimer2); buildTimer2 = null; }
    buildDisplay();
  }

  let saveTimer = null;
  function saveStateSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set('mw.state', { id: presetId, name: presetName, dirty, values: toKeyed(true) }), 300);
  }

  // Version 1.0.6: a preset change reaches the audio thread in ONE message, all the parameters and the tables together ('bulk'). Sent one by one, the parameters were taken by the audio thread a few at a
  // time between two of its render quanta, and the sound played for a moment with half of the new preset on the tables of the old one: a burst of noise ("buzz") at every change of preset, worst
  // when the notes held were loud. `modify` (the demo) adjusts the new values before they are sent: modify(set(key, value), get(key)).
  // the values a preset change leads to: the preset's (`obj`: key -> value; the others at their defaults; a performance setting stays as it is), then `modify` (the demo's rules): modify(set(key, value), get(key)).
  // Every value as setParam takes it (limits, rounding). Nothing is applied here: applyKeyed does, prebuild() builds the tables ahead.
  function finalValues(obj, modify) {
    const v = Float64Array.from(values);
    const fit = (i, x) => { const p = PARAMS[i]; x = Math.min(p.max, Math.max(p.min, x)); return p.curve === 'int' || p.curve === 'choice' ? Math.round(x) : x; };
    PARAMS.forEach((p, i) => {
      if (p.hidden) return;
      if (p.perf && !(obj && obj[p.key] !== undefined)) return;   // Okto MultiWave Synth: a preset leaves the chord keyboard as it is
      v[i] = fit(i, obj && obj[p.key] !== undefined && isFinite(obj[p.key]) ? +obj[p.key] : p.def);
    });
    if (modify) modify((key, x) => { if (key in P) v[P[key]] = fit(P[key], x); }, key => v[P[key]]);
    return v;
  }
  // Version 1.0.8: the audio side of a preset change of the demo, sent ahead of the chord it goes with: the values and the tables (built ahead by prebuild, else here) with the song time `at`;
  // nothing is changed on the page (applyKeyed with { audio: false } does that, at the chord)
  function sendKeyed(obj, modify, at) {
    const v = finalValues(obj, modify);
    const tb = prebuilt && prebuilt.key === v.join(',') ? prebuilt.tb : C.buildTables(v, true);
    prebuilt = null;
    deliver(tb, v, at);
  }
  function applyKeyed(obj, modify, o) {
    const v = finalValues(obj, modify);
    hold = { n: 0 };
    try { for (let i = 0; i < v.length; i++) setParam(i, v[i], false); } finally { hold = null; }
    if (o && o.audio === false) {   // the audio thread has this change already (sendKeyed): the panel follows, nothing is sent
      if (buildTimer) { clearTimeout(buildTimer); buildTimer = null; }
      if (buildTimer2) { clearTimeout(buildTimer2); buildTimer2 = null; }
      buildDisplay();
      return;
    }
    const tb = prebuilt && prebuilt.key === v.join(',') ? prebuilt.tb : null;   // built ahead by the demo (prebuild)
    prebuilt = null;
    build(false, true, tb);
  }

  // ---------------------------------------------------------------- presets
  function presetList() {
    const list = [], P = SPEC.PRESETS;
    // ★ TOP SOUNDS (OktoPierre's selection, first in the factory order; beta 0.5), then one group per category, in the order of the
    // categories and of the presets' ranks (beta 0.2: the numbering is not the order of the lists any more: the 300 new presets 201-500
    // come before the 200 of beta 0.1 in the array, but each category lists its presets together). The arrows step through this list.
    const add = (k, group) => list.push({ id: 'f:' + k, name: P[k].name, group, current: presetId === 'f:' + k, deletable: false });
    SPEC.TOP_LIST.forEach(k => add(k, '★ TOP SOUNDS'));   // (version 1.0.3: the TOP Sounds list of the plug-in, the best first)
    const inTop = new Set(SPEC.TOP_LIST);
    for (const c of SPEC.CATEGORIES) {
      const ks = [];
      for (let k = 0; k < P.length; k++) if (P[k].cat === c && !inTop.has(k)) ks.push(k);
      ks.sort((a, b) => P[a].rank - P[b].rank);
      for (const k of ks) add(k, c.toUpperCase());
    }
    userPresets.forEach((pr, k) => list.push({ id: 'u:' + k, name: pr.name, group: 'USER PRESETS', current: presetId === 'u:' + k, deletable: true }));
    return list;
  }
  function loadPreset(id) {
    const [kind, ks] = String(id).split(':'), k = +ks;
    if (kind === 'f' && SPEC.PRESETS[k]) {
      const pr = SPEC.PRESETS[k], o = {};
      PARAMS.forEach((p, i) => { if (!p.perf) o[p.key] = pr.values[i]; });   // Okto MultiWave Synth: a preset leaves the chord keyboard as it is
      applyKeyed(o); presetName = pr.name;
    } else if (kind === 'u' && userPresets[k]) {
      applyKeyed(userPresets[k].values); presetName = userPresets[k].name;
    } else return;
    presetId = id; dirty = false;
    ui.setPresetName(presetName, false);
    saveStateSoon();
  }
  function presetStep(d) {
    const list = presetList();
    let i = list.findIndex(x => x.id === presetId);
    i = ((i < 0 ? 0 : i + d) % list.length + list.length) % list.length;
    loadPreset(list[i].id);
  }
  function deletePreset(id) {
    const k = +String(id).split(':')[1];
    if (!userPresets[k]) return;
    if (!confirm(`Delete user preset "${userPresets[k].name}"?`)) return;
    userPresets.splice(k, 1);
    store.set('mw.user', userPresets);
    if (presetId === id) { presetId = 'x'; dirty = true; ui.setPresetName(presetName, true); }
  }
  function savePreset() {
    const name = prompt('Save current sound as user preset:', dirty ? presetName + ' (edit)' : presetName);
    if (!name) return;
    userPresets.push({ name: name.slice(0, 40), values: toKeyed() });
    store.set('mw.user', userPresets);
    presetId = 'u:' + (userPresets.length - 1); presetName = name.slice(0, 40); dirty = false;
    ui.setPresetName(presetName, false);
    saveStateSoon();
  }
  function exportPreset() {
    const data = { format: 'okto-multiwave-synth-preset', version: 1, name: presetName, values: toKeyed() };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = presetName.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '_') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importPreset(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || !data.values || typeof data.values !== 'object') throw new Error('not a Okto MultiWave Synth preset');
        const name = String(data.name || file.name.replace(/\.json$/i, '')).slice(0, 40);
        userPresets.push({ name, values: data.values });
        store.set('mw.user', userPresets);
        loadPreset('u:' + (userPresets.length - 1));
      } catch (e) { alert('Could not import preset: ' + e.message); }
    };
    r.readAsText(file);
  }

  // ---------------------------------------------------------------- notes
  function noteOn(n, v) {
    if (n < 0 || n > 127) return;
    if (!actx) startAudio();
    localKeys.add(n);
    post({ t: 'on', n, v });
  }
  function noteOff(n) { localKeys.delete(n); post({ t: 'off', n }); }
  // Okto MultiWave Synth: the strum plate's notes (played as themselves, whatever CHORD says)
  function plateOn(n, v) { if (n < 0 || n > 127) return; if (!actx) startAudio(); post({ t: 'plateon', n, v }); }
  function plateOff(n) { post({ t: 'plateoff', n }); }
  function allOff() { localKeys.clear(); heldCodes.clear(); post({ t: 'alloff' }); }

  // ---------------------------------------------------------------- audio
  // The engine the worklet runs: 'wasm' (the C++ engine of the plug-in, vst/src/dsp.h, compiled to WebAssembly by wasm/build.sh: the default since the web update of 2026-10-23,
  // about twice as light on the processor) or 'js' (core.js, the reference). #engine=js in the address forces the JavaScript engine; a browser that cannot run the module falls
  // back to it by itself (wasmBytes fails, or the worklet reports wasmErr). No choice is remembered: the test pages of the same site used to store one (localStorage 'mw.engine'),
  // which must not decide the official page's engine. WS_TEST.setEngine switches it while the audio runs (a new worklet node in the same AudioContext: the sound restarts, the
  // demo starts again from its beginning).
  let engineWanted = /engine=js/.test(location.hash) ? 'js' : 'wasm';
  const engineInfo = { running: 'none', simd: false, err: '', switches: 0 };
  let wasmCache = null;
  // the module's bytes: web/js/engine_wasm_data.js (base64, loaded on first use: a fetch of a .wasm file is refused from file://), the SIMD build when this browser validates it
  function wasmBytes() {
    if (wasmCache) return wasmCache;
    wasmCache = new Promise((res, rej) => {
      if (window.WS_WASM) { res(window.WS_WASM); return; }
      const s = document.createElement('script');
      s.src = 'js/engine_wasm_data.js';
      s.onload = () => (window.WS_WASM ? res(window.WS_WASM) : rej(new Error('engine_wasm_data.js: no WS_WASM')));
      s.onerror = () => rej(new Error('engine_wasm_data.js could not be loaded'));
      document.head.appendChild(s);
    }).then((W) => {
      const dec = (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
      const simd = dec(W.simd);
      if (typeof WebAssembly === 'object' && WebAssembly.validate(simd)) return { bytes: simd, simd: true };
      return { bytes: dec(W.scalar), simd: false };
    });
    wasmCache.catch(() => { wasmCache = null; });
    return wasmCache;
  }
  // a worklet node with the engine wanted, connected; then the parameters and the tables (also when the engine is switched)
  async function makeNode() {
    let wasm = null;
    engineInfo.err = '';
    if (engineWanted === 'wasm') {
      try { wasm = await wasmBytes(); } catch (e) { engineInfo.err = String(e.message || e); }
    }
    const nd = new AudioWorkletNode(actx, 'wavelet-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
      processorOptions: { spec: SPEC_CORE, wasm: wasm ? wasm.bytes : null } });
    // the processor threw (a bug, or a broken state): the audio stops for good; say so rather than stay silent
    nd.onprocessorerror = () => {
      $('st-audio').classList.remove('on');
      $('st-audio').lastElementChild.textContent = 'Audio engine stopped by an error: reload the page';
      try { nd.disconnect(); } catch (e) { /* already gone */ }
    };
    const ready = new Promise(res => {
      nd.port.onmessage = (e) => {
        if (e.data.t === 'ready') {
          sampleRate = e.data.sr;
          engineInfo.running = e.data.engine || 'js'; engineInfo.simd = !!(wasm && wasm.simd && e.data.engine === 'wasm');
          if (e.data.wasmErr) engineInfo.err = e.data.wasmErr;
          res();
        } else onWorklet(e.data);
      };
    });
    nd.connect(actx.destination);
    await ready;
    node = nd;
    node.port.onmessage = (e) => onWorklet(e.data);
    post({ t: 'all', v: Array.from(values) });
    if (heldTables) { const tb = heldTables; heldTables = null; deliver(tb); } else build();
  }
  // switch the engine: stored; while the audio runs, the old node goes and a new one comes (the demo, if it played, starts again)
  let switching = null;
  function setEngine(kind) {
    engineWanted = kind === 'wasm' ? 'wasm' : 'js';
    if (!actx || !node) return Promise.resolve(engineInfo);
    if (switching) return switching.then(() => setEngine(kind));
    switching = (async () => {
      const wasDemo = demo && demo.running();
      if (wasDemo) demo.stop();
      allOff();
      const old = node; node = null;
      try { old.port.onmessage = null; old.disconnect(); old.port.postMessage({ t: 'kill' }); } catch (_) { /* gone */ }
      await makeNode();
      engineInfo.switches++;
      $('st-audio').lastElementChild.textContent = audioLabel();
      if (wasDemo) playDemo();
      return engineInfo;
    })().finally(() => { switching = null; });
    return switching;
  }
  // the status bar's text ('· WASM' only while the WebAssembly engine plays: the default app's text is unchanged)
  const audioLabel = () => `Audio on · ${(sampleRate / 1000).toFixed(1)} kHz` + (engineInfo.running === 'wasm' ? ' · WASM' : '');
  function startAudio() {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || !('audioWorklet' in Ctx.prototype)) throw new Error('This browser does not support AudioWorklet (use Chrome, Edge or Firefox).');
      actx = new Ctx({ latencyHint: 'interactive' });
      const src = 'const WSCoreFactory = ' + WSCoreFactory.toString() + ';\n' +
        (typeof WSWasmEngine === 'function' ? 'const WSWasmEngine = ' + WSWasmEngine.toString() + ';\n' : '') +
        '(' + WSWorkletMain.toString() + ')();\n';
      // A data: URL (not blob:) so the worklet also loads when the page is opened from file://
      // (file pages have an opaque origin and blob:null module loads are rejected).
      const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(src);
      await actx.audioWorklet.addModule(url);
      await makeNode();
      for (const n of localKeys) post({ t: 'on', n, v: 0.8 });
      if (actx.state !== 'running') await actx.resume();
      $('st-audio').classList.add('on');
      $('st-audio').lastElementChild.textContent = audioLabel();
      hideOverlay();
      claimAudio();
      initMIDI();
    })().catch(err => {
      startPromise = null; actx = null; node = null;
      $('st-audio').lastElementChild.textContent = 'Audio error: ' + err.message;
      throw err;
    });
    return startPromise;
  }

  const changeLog = [];   // the changes the audio thread made at a chord of the demo: { at: the chord, seq: when it made them } (song times in seconds), for the tests
  function onWorklet(m) {
    if (m.t === 'changed') { if (changeLog.length < 200) changeLog.push({ at: m.at, seq: m.seq }); return; }
    if (m.t !== 'disp') return;
    live = m;
    lastLevel = { peakL: m.peakL, peakR: m.peakR };
    // Okto MultiWave Synth: a key of the selector octave chose a chord type in the engine: the panel follows (not a sound change)
    // (only on that event: a pad clicked here reaches the engine a little later, the engine's older value must not undo it)
    if (m.chord && m.chord.changed && m.chord.type !== values[P.chord_type]) { values[P.chord_type] = m.chord.type; ui.refresh(P.chord_type); saveStateSoon(); }
    ui.setLive(m);
    if (demo) demo.onSeqTime(m.seqTime);
  }

  // ---------------------------------------------------------------- audio lifecycle
  // Only one window or tab plays at a time: when the app starts its audio here, the other open
  // copies (same browser) stop their demo and pause their audio. Closing or leaving the page
  // stops everything immediately.
  const INSTANCE = Math.random().toString(36).slice(2);
  function claimAudio() { store.set('mw.audioOwner', { id: INSTANCE, t: Date.now() }); }
  // The welcome window (index.html) comes back with the reason in place of its sub-title; its choices take the audio back.
  // While it is shown, the panel behind it is inert, so the Tab key stays in the window.
  const WELCOME_SUB = $('w-sub').textContent;
  function setOverlay(on) {
    $('start-overlay').classList.toggle('gone', !on);
    $('stage').inert = on; $('statusbar').inert = on;
  }
  function showOverlay(msg) {
    const sub = $('w-sub');
    sub.textContent = msg || WELCOME_SUB;
    sub.classList.toggle('msg', !!msg);
    setOverlay(true);
  }
  function hideOverlay() { setOverlay(false); }
  function pauseAudio(msg) {
    if (demo && demo.running()) demo.stop();
    allOff();
    if (actx && actx.state === 'running') actx.suspend();
    $('st-audio').classList.remove('on');
    $('st-audio').lastElementChild.textContent = 'Audio paused';
    showOverlay(msg);
  }
  function resumeAudio() {
    return startAudio().then(() => {
      if (actx && actx.state !== 'running') actx.resume();
      $('st-audio').classList.add('on');
      $('st-audio').lastElementChild.textContent = audioLabel();
      hideOverlay();
      claimAudio();
    }).catch(() => {});
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== 'mw.audioOwner' || !e.newValue || !actx) return;
    try { if (JSON.parse(e.newValue).id !== INSTANCE) pauseAudio('The synthesizer is playing in another window or tab, so this one was paused.'); } catch (_) { /* ignore */ }
  });
  window.addEventListener('pagehide', () => {
    try { if (demo && demo.running()) demo.stop(); post({ t: 'soundoff' }); if (actx) actx.close(); } catch (_) { /* closing anyway */ }
    actx = null; node = null; startPromise = null;
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) showOverlay('Click to start the audio again.'); });

  // ---------------------------------------------------------------- MIDI
  // For hardware without a DAW (keyboards, sequencers, controllers): an input channel filter (all channels by
  // default), Program Change selects a preset, and MIDI learn links a control change to a panel control: right-click
  // the control, then move a knob or fader on the controller. The channel and the links are kept in this browser.
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  let midiCh = store.get('mw.midiCh', 0);                   // 0 = all channels, else 1..16
  if (!(Number.isInteger(midiCh) && midiCh >= 0 && midiCh <= 16)) midiCh = 0;
  let ccMap = store.get('mw.ccMap', {});                    // CC number -> parameter key
  if (!ccMap || typeof ccMap !== 'object' || Array.isArray(ccMap)) ccMap = {};
  for (const cc of Object.keys(ccMap)) if (!(/^\d+$/.test(cc) && +cc < 120 && typeof ccMap[cc] === 'string' && own(P, ccMap[cc]))) delete ccMap[cc];
  let learn = -1;                                           // parameter waiting for a control change
  let midiNames = '', flashTimer = null;
  function midiStatus(msg, ms) {   // a message in the status bar, then back to the device list after `ms`
    clearTimeout(flashTimer);
    const text = msg || 'MIDI: ' + (midiNames || '—');
    $('st-midi').textContent = text; $('st-midi').title = text;
    if (msg && ms) flashTimer = setTimeout(() => midiStatus(), ms);
  }
  function initMIDI() {
    if (!navigator.requestMIDIAccess) { midiStatus('MIDI: not supported by this browser'); return; }
    navigator.requestMIDIAccess().then((access) => {
      const hook = () => {
        const names = [];
        access.inputs.forEach((inp) => { inp.onmidimessage = onMIDI; names.push(inp.name); });
        midiNames = names.length ? names.join(', ') : 'no device';
        if (learn < 0) midiStatus();
      };
      access.onstatechange = hook;
      hook();
    }, () => { midiNames = 'access denied'; midiStatus(); });
  }
  function programChange(n) {
    const list = presetList();
    if (!list[n]) return;
    loadPreset(list[n].id);
    midiStatus(`MIDI: program ${n} → ${list[n].name}`, 3000);
  }
  function midiLearn(i) {
    if (learn === i) { stopLearn('MIDI learn cancelled'); return; }
    learn = i;
    ui.setHot([i]);
    midiStatus(`MIDI learn: move a knob or fader for ${PARAMS[i].name} · Esc cancels · Del unlinks`);
  }
  function stopLearn(msg) {
    if (learn < 0) return;
    learn = -1;
    ui.setHot([]);
    midiStatus(msg, 3000);
  }
  function linkCC(cc, i, unlink) {
    const key = PARAMS[i].key;
    for (const c of Object.keys(ccMap)) if (ccMap[c] === key) delete ccMap[c];
    if (!unlink) ccMap[cc] = key;
    store.set('mw.ccMap', ccMap);
    ui.setMidiMap(ccMap);
    stopLearn(unlink ? `MIDI: ${PARAMS[i].name} unlinked` : `MIDI: CC ${cc} → ${PARAMS[i].name}`);
  }
  function onMIDI(e) {
    const [st, d1, d2] = e.data, cmd = st & 0xf0;
    if (st >= 0xf0) return;                                    // clock, start / stop, SysEx: not used
    if (midiCh && (st & 0x0f) + 1 !== midiCh) return;
    if (cmd === 0x90 && d2 > 0) noteOn(d1, d2 / 127);
    else if (cmd === 0x80 || cmd === 0x90) noteOff(d1);
    else if (cmd === 0xe0) setParam(P.bend, (((d2 << 7) | d1) - 8192) / 8192, false);
    else if (cmd === 0xc0) programChange(d1);
    else if (cmd === 0xb0) {
      if (learn >= 0 && d1 < 120 && d1 !== 64) { linkCC(d1, learn); return; }
      if (own(ccMap, d1)) { const i = P[ccMap[d1]]; setParam(i, C.toPlain(PARAMS[i], d2 / 127), true); return; }
      if (d1 === 1) setParam(P.modwheel, d2 / 127, false);
      else if (d1 === 64) setParam(P.hold, d2 >= 64 ? 1 : 0, false);
      else if (d1 === 120) { localKeys.clear(); post({ t: 'soundoff' }); }
      else if (d1 === 123) allOff();
    }
  }

  // ---------------------------------------------------------------- computer keyboard
  const KEYMAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11,
    KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17 };
  // Digit row and numeric keypad: 1..9, 0 = white keys C D E F G A B C D E (physical keys, so AZERTY works without Shift)
  [0, 2, 4, 5, 7, 9, 11, 12, 14, 16].forEach((off, k) => { const d = (k + 1) % 10; KEYMAP['Digit' + d] = off; KEYMAP['Numpad' + d] = off; });
  const heldCodes = new Map();
  function showOct() { $('st-oct').textContent = 'C' + (kbBase / 12 - 1); }
  window.addEventListener('keydown', (e) => {
    if (learn >= 0 && e.key === 'Escape') { stopLearn('MIDI learn cancelled'); return; }
    if (learn >= 0 && (e.key === 'Delete' || e.key === 'Backspace')) { linkCC(0, learn, true); e.preventDefault(); return; }
    if (e.key === 'Escape') { if ($('manual-overlay').hidden && demo && demo.running()) demo.stop(); closeManual(); return; }
    // beta 0.5: the arrow keys choose presets (in the browser's list when it is open, else the previous / next preset); held,
    // they go on
    const arrow = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
    if (arrow && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) &&
        $('manual-overlay').hidden && !(demo && demo.running())) {
      if (!ui.browserKey(arrow)) presetStep(arrow === 'up' || arrow === 'left' ? -1 : 1);
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (!$('manual-overlay').hidden) return;
    if (e.code === 'KeyZ') { kbBase = Math.max(24, kbBase - 12); showOct(); return; }
    if (e.code === 'KeyX') { kbBase = Math.min(96, kbBase + 12); showOct(); return; }
    if (e.code in KEYMAP && !heldCodes.has(e.code)) {
      const n = kbBase + KEYMAP[e.code];
      heldCodes.set(e.code, n);
      noteOn(n, 0.8);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (heldCodes.has(e.code)) { noteOff(heldCodes.get(e.code)); heldCodes.delete(e.code); }
  });
  window.addEventListener('blur', () => { for (const n of heldCodes.values()) noteOff(n); heldCodes.clear(); });

  // ---------------------------------------------------------------- manuals
  // the manual has eight pages in manual/: the MANUAL button opens its contents (manual.html), the welcome window's "Learn more" box the introduction to
  // wavelets (wavelets.html); both are shown over the window and neither starts the audio. Only a plain page name of the folder is accepted.
  const MANUAL_PAGE = /^[a-z0-9-]+\.html$/;
  function openManual(page) {
    const url = 'manual/' + (typeof page === 'string' && MANUAL_PAGE.test(page) ? page : 'manual.html');
    $('manual-iframe').src = url;
    $('manual-newtab').href = url;
    $('manual-title').textContent = 'OktoWave — user manual';
    $('manual-overlay').hidden = false;
  }

  function closeManual() {
    if ($('manual-overlay').hidden) return;
    $('manual-overlay').hidden = true;
    $('manual-iframe').src = 'about:blank';
  }

  // ---------------------------------------------------------------- UI
  const host = {
    get: i => values[i],
    values: () => values,
    set: (i, v) => setParam(i, v, true),
    begin() {}, end() {},
    noteOn, noteOff,
    plateOn, plateOff,   // Okto MultiWave Synth: the strum plate
    presetStep, presetList, loadPreset, deletePreset,
    openManual,
    keysDown: () => {   // keys played here + notes playing in the engine (MIDI, demo)
      if (!live || !live.keys || !live.keys.length) return localKeys;
      const s = new Set(localKeys); for (const k of live.keys) s.add(k); return s;
    },
    computerBase: () => kbBase,
    midiLearn: (i) => midiLearn(i),
  };
  const ui = new SynthUI($('device'), SPEC, C, host);
  ui.setMidiMap(ccMap);
  {   // MIDI input channel selector in the status bar
    const sel = $('midi-ch');
    for (let k = 0; k <= 16; k++) {
      const o = document.createElement('option');
      o.value = String(k); o.textContent = k ? 'MIDI ch ' + k : 'MIDI ch: all';
      sel.appendChild(o);
    }
    sel.value = String(midiCh);
    sel.onchange = () => { midiCh = +sel.value; store.set('mw.midiCh', midiCh); allOff(); sel.blur(); };
  }

  // ---------------------------------------------------------------- demo (Beethoven, Appassionata: a tour of the presets)
  // version 1.0: the demo's tour has presets of its own (the ones of the Wavelet Synthesizer's web app), then the factory list
  function demoPreset(name) {
    const src = (SPEC.DEMO_PRESETS || []).find(p => p.name === name) || SPEC.PRESETS.find(p => p.name === name);
    if (!src) return null;
    const o = {}; PARAMS.forEach((p, i) => { if (!p.perf) o[p.key] = src.values[i]; });
    return o;
  }
  const demoApi = {
    C, P, PARAMS, ui, post,
    startAudio: () => startAudio(),
    setParam: (i, v) => setParam(i, v, false),
    values: () => values,
    ctxTime: () => (actx ? actx.currentTime : 0),
    applyPreset: (name, modify, o) => { const p = demoPreset(name); if (p) applyKeyed(p, modify, o); },
    sendPreset: (name, modify, at) => { const p = demoPreset(name); if (p) sendKeyed(p, modify, at); },   // version 1.0.8: the audio side, ahead of the chord
    prebuildPreset: (name, modify) => { const o = demoPreset(name); if (o) prebuild(finalValues(o, modify)); },   // the tables of a preset the demo will load in a few seconds
    snapshot: () => ({ values: toKeyed(), presetId, presetName, dirty }),
    restore: (s) => { applyKeyed(s.values); presetId = s.presetId; presetName = s.presetName; dirty = s.dirty; ui.setPresetName(presetName, dirty); },
    setPresetLabel: (txt, modified) => ui.setPresetName(txt, !!modified),
  };
  demo = WSDemo(demoApi);
  const playDemo = () => demo.start().catch(() => {});
  ui.makeDemoButton({
    running: () => demo.running(),
    stop: () => demo.stop(),
    play: playDemo,
  });
  // version 1.0.10: the vote build (tools/make_vote_build.js) loads tools/vote/vote.js, which rates the presets of the demo; the released app has no WSVote and nothing happens here
  if (typeof window.WSVote === 'function') window.WSVote(demoApi, demo, { resumeAudio });

  // The app always opens on the default preset (A · Wavelet Lead); user presets stay in the preset list.
  loadPreset('f:' + SPEC.DEFAULT_PRESET);
  ui.refreshAll();
  ui.setPresetName(presetName, dirty);
  build();
  showOct();

  if (/noaudio/.test(location.hash)) hideOverlay(); else showOverlay();   // #noaudio: screenshots / docs
  { const m = /preset=([0-9]+)/.exec(location.hash); if (m) loadPreset('f:' + m[1]); }
  // The welcome window's choices. resumeAudio, not startAudio: after a pause the context exists but is suspended.
  // "Run the demo" then plays the default demo as the header's ▶ DEMO does; "Download the VST" is a plain link (new tab).
  $('start-btn').onclick = () => resumeAudio();
  $('w-demo').onclick = () => resumeAudio().then(() => { if (actx) playDemo(); });
  // the manual viewer, over the window (Ctrl / Shift / Cmd + click: the browser's new tab or window)
  $('w-manual').onclick = (e) => { if (e.ctrlKey || e.shiftKey || e.metaKey) return; e.preventDefault(); openManual(); };
  $('w-learn').onclick = (e) => { if (e.ctrlKey || e.shiftKey || e.metaKey) return; e.preventDefault(); openManual('wavelets.html'); };
  $('start-overlay').addEventListener('pointerdown', (e) => { if (e.target === $('start-overlay')) resumeAudio(); });
  $('manual-close').onclick = closeManual;
  $('manual-overlay').addEventListener('pointerdown', (e) => { if (e.target === $('manual-overlay')) closeManual(); });
  $('btn-save').onclick = savePreset;
  $('btn-export').onclick = exportPreset;
  $('btn-import').onclick = () => $('file-import').click();
  $('file-import').onchange = (e) => { const f = e.target.files[0]; if (f) importPreset(f); e.target.value = ''; };

  // ---------------------------------------------------------------- test hooks (used by tests/web)
  window.WS_TEST = {
    start: () => startAudio(),
    noteOn: (n, v) => noteOn(n, v == null ? 0.8 : v),
    audioState: () => (actx ? actx.state : 'none'),
    noteOff: n => noteOff(n),
    setParam: (key, v) => { if (!(key in P)) throw new Error('unknown param ' + key); setParam(P[key], v, true); },
    getParam: key => values[P[key]],
    paramKeys: () => PARAMS.map(p => p.key),
    getLevel: () => ({ peakL: lastLevel.peakL, peakR: lastLevel.peakR }),
    presets: () => presetList().map(x => x.name),
    loadPreset: idx => { const l = presetList(); if (l[idx]) loadPreset(l[idx].id); },
    openManual, closeManual,
    allNotesOff: allOff,
    demoStart: () => demo.start(),
    demoSong: () => demo.song(),
    demoTour: () => demo.tourPlan(),
    demoStop: () => demo.stop(),
    demoState: () => demo.state(),
    changes: () => changeLog.slice(),   // version 1.0.8
    midi: (bytes) => onMIDI({ data: bytes }),
    chord: () => (live && live.chord ? Object.assign({}, live.chord) : null),   // Okto MultiWave Synth: the chord sounding
    plateOn: (n, v) => plateOn(n, v == null ? 0.8 : v),
    plateOff: n => plateOff(n),
    midiLearn: (key) => midiLearn(P[key]),
    midiMap: () => Object.assign({}, ccMap),
    midiStatus: () => $('st-midi').textContent,
    setMidiChannel: (ch) => { $('midi-ch').value = String(ch); $('midi-ch').onchange(); },
    // WebAssembly prototype: the engine wanted / running (js | wasm), SIMD or not, the last error; switch it (a promise); the browser's own count of the quanta it could not deliver
    engine: () => Object.assign({ wanted: engineWanted }, engineInfo),
    setEngine: (k) => setEngine(k),
    playbackStats: () => {
      const p = actx && actx.playbackStats;
      return p ? { underrunEvents: p.underrunEvents, underrunDuration: p.underrunDuration, totalDuration: p.totalDuration } : null;
    },
  };
})();
