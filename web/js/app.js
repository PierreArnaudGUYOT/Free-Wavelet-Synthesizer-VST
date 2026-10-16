// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// Web application: audio, parameters, presets, MIDI, keyboard, manuals, demo.
(function () {
  'use strict';
  const SPEC = WS_SPEC, C = WSCoreFactory(SPEC), P = C.P;
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
  let userPresets = store.get('ws.user', []);
  if (!Array.isArray(userPresets)) userPresets = [];

  const toKeyed = () => { const o = {}; PARAMS.forEach((p, i) => { if (!p.hidden) o[p.key] = +values[i].toFixed(6); }); return o; };

  // ---------------------------------------------------------------- parameters
  function post(msg, transfer) { if (node) node.port.postMessage(msg, transfer || []); }

  function setParam(i, v, user) {
    const p = PARAMS[i];
    v = Math.min(p.max, Math.max(p.min, v));
    if (p.curve === 'int' || p.curve === 'choice') v = Math.round(v);
    if (values[i] === v) return;
    const needs = i === P.ab_mix ? C.tableNeeds(values) : 0;
    values[i] = v;
    post({ t: 'p', i, v });
    ui.refresh(i);
    // A/B MIX rebuilds the tables only when it reaches or leaves one end (engine A or B alone)
    if (p.structural || (i === P.ab_mix && C.tableNeeds(values) !== needs)) scheduleBuild();
    // the ENGINE tabs only choose the panel shown: switching them does not modify the sound
    if (user && !p.hidden && i !== P.engine) { if (!dirty) { dirty = true; ui.setPresetName(presetName, true); } }
    if (user && !p.hidden) saveStateSoon();
  }

  function scheduleBuild() {
    if (buildTimer) return;
    buildTimer = setTimeout(build, Math.max(0, 45 - (performance.now() - lastBuild)));
  }
  function build() {
    buildTimer = null;
    lastBuild = performance.now();
    const tb = C.buildTables(values, true);
    const alt = tb.alt ? { mode: tb.alt.mode, mips: tb.alt.mips, rms: tb.alt.rms } : null;
    const transfer = [tb.mips.buffer, tb.rms.buffer].concat(alt ? [alt.mips.buffer, alt.rms.buffer] : []);
    if (node) post({ t: 'tables', mode: tb.mode, mips: tb.mips, rms: tb.rms, alt }, transfer);
    // the displays show the engine of the panel; with A/B MIX at the other engine the sound uses other tables
    ui.setTables(tb.mode === Math.round(values[P.engine]) ? tb : C.buildTables(values, false));
  }

  let saveTimer = null;
  function saveStateSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set('ws.state', { id: presetId, name: presetName, dirty, values: toKeyed() }), 300);
  }

  function applyKeyed(obj) {
    // presets and states saved before beta 0.2 have no A/B MIX: they play the engine they were made for
    if (obj && obj.ab_mix === undefined && obj.engine !== undefined) obj = Object.assign({}, obj, { ab_mix: obj.engine });
    PARAMS.forEach((p, i) => {
      if (p.hidden) return;
      const v = obj && obj[p.key] !== undefined && isFinite(obj[p.key]) ? +obj[p.key] : p.def;
      setParam(i, v, false);
    });
    build();
  }

  // ---------------------------------------------------------------- presets
  function presetList() {
    const list = [];
    // ★ FAVOURITES (OktoPierre's sounds, first in the factory order), then one group per category.
    SPEC.PRESETS.forEach((pr, k) => list.push({
      id: 'f:' + k, name: pr.name, group: k < SPEC.FAVOURITES ? '★ FAVOURITES' : pr.cat.toUpperCase(),
      current: presetId === 'f:' + k, deletable: false,
    }));
    userPresets.forEach((pr, k) => list.push({ id: 'u:' + k, name: pr.name, group: 'USER PRESETS', current: presetId === 'u:' + k, deletable: true }));
    return list;
  }
  function loadPreset(id) {
    const [kind, ks] = String(id).split(':'), k = +ks;
    if (kind === 'f' && SPEC.PRESETS[k]) {
      const pr = SPEC.PRESETS[k], o = {};
      PARAMS.forEach((p, i) => { o[p.key] = pr.values[i]; });
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
    store.set('ws.user', userPresets);
    if (presetId === id) { presetId = 'x'; dirty = true; ui.setPresetName(presetName, true); }
  }
  function savePreset() {
    const name = prompt('Save current sound as user preset:', dirty ? presetName + ' (edit)' : presetName);
    if (!name) return;
    userPresets.push({ name: name.slice(0, 40), values: toKeyed() });
    store.set('ws.user', userPresets);
    presetId = 'u:' + (userPresets.length - 1); presetName = name.slice(0, 40); dirty = false;
    ui.setPresetName(presetName, false);
    saveStateSoon();
  }
  function exportPreset() {
    const data = { format: 'wavelet-synthesizer-preset', version: 1, name: presetName, values: toKeyed() };
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
        if (!data || typeof data.values !== 'object') throw new Error('not a Wavelet Synthesizer preset');
        const name = String(data.name || file.name.replace(/\.json$/i, '')).slice(0, 40);
        userPresets.push({ name, values: data.values });
        store.set('ws.user', userPresets);
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
  function allOff() { localKeys.clear(); heldCodes.clear(); post({ t: 'alloff' }); }

  // ---------------------------------------------------------------- audio
  function startAudio() {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx || !('audioWorklet' in Ctx.prototype)) throw new Error('This browser does not support AudioWorklet (use Chrome, Edge or Firefox).');
      actx = new Ctx({ latencyHint: 'interactive' });
      const src = 'const WSCoreFactory = ' + WSCoreFactory.toString() + ';\n(' + WSWorkletMain.toString() + ')();\n';
      // A data: URL (not blob:) so the worklet also loads when the page is opened from file://
      // (file pages have an opaque origin and blob:null module loads are rejected).
      const url = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(src);
      await actx.audioWorklet.addModule(url);
      node = new AudioWorkletNode(actx, 'wavelet-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { spec: SPEC } });
      const ready = new Promise(res => { node.port.onmessage = (e) => { if (e.data.t === 'ready') { sampleRate = e.data.sr; res(); } else onWorklet(e.data); }; });
      node.connect(actx.destination);
      await ready;
      node.port.onmessage = (e) => onWorklet(e.data);
      post({ t: 'all', v: Array.from(values) });
      build();
      for (const n of localKeys) post({ t: 'on', n, v: 0.8 });
      if (actx.state !== 'running') await actx.resume();
      $('st-audio').classList.add('on');
      $('st-audio').lastElementChild.textContent = `Audio on · ${(sampleRate / 1000).toFixed(1)} kHz`;
      $('start-overlay').classList.add('gone');
      claimAudio();
      initMIDI();
    })().catch(err => {
      startPromise = null; actx = null; node = null;
      $('st-audio').lastElementChild.textContent = 'Audio error: ' + err.message;
      throw err;
    });
    return startPromise;
  }

  function onWorklet(m) {
    if (m.t !== 'disp') return;
    live = m;
    lastLevel = { peakL: m.peakL, peakR: m.peakR };
    ui.setLive(m);
    if (demo) demo.onSeqTime(m.seqTime);
  }

  // ---------------------------------------------------------------- audio lifecycle
  // Only one window or tab plays at a time: when the app starts its audio here, the other open
  // copies (same browser) stop their demo and pause their audio. Closing or leaving the page
  // stops everything immediately.
  const INSTANCE = Math.random().toString(36).slice(2);
  function claimAudio() { store.set('ws.audioOwner', { id: INSTANCE, t: Date.now() }); }
  function showOverlay(msg) {
    const o = $('start-overlay');
    o.querySelector('p').textContent = msg;
    o.querySelector('#start-btn span').textContent = 'Click to play here';
    o.classList.remove('gone');
  }
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
      $('st-audio').lastElementChild.textContent = `Audio on · ${(sampleRate / 1000).toFixed(1)} kHz`;
      $('start-overlay').classList.add('gone');
      claimAudio();
    }).catch(() => {});
  }
  window.addEventListener('storage', (e) => {
    if (e.key !== 'ws.audioOwner' || !e.newValue || !actx) return;
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
  let midiCh = store.get('ws.midiCh', 0);                   // 0 = all channels, else 1..16
  if (!(Number.isInteger(midiCh) && midiCh >= 0 && midiCh <= 16)) midiCh = 0;
  let ccMap = store.get('ws.ccMap', {});                    // CC number -> parameter key
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
    store.set('ws.ccMap', ccMap);
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
  function openManual(which) {
    const w = String(which).toUpperCase() === 'B' ? 'b' : 'a';
    const url = 'manual/manual-' + w + '.html';
    $('manual-iframe').src = url;
    $('manual-newtab').href = url;
    $('manual-title').textContent = w === 'a' ? 'Manual A — Wavelet Subtractive engine' : 'Manual B — Wavelet Additive engine';
    $('manual-overlay').hidden = false;
  }
  // The manual pages announce themselves (postMessage works across file:// frames),
  // so the overlay title follows the A <-> B cross-links.
  window.addEventListener('message', (e) => {
    const w = e.data && e.data.wsManual;
    if ((w !== 'a' && w !== 'b') || $('manual-overlay').hidden) return;
    $('manual-newtab').href = 'manual/manual-' + w + '.html';
    $('manual-title').textContent = w === 'a' ? 'Manual A — Wavelet Subtractive engine' : 'Manual B — Wavelet Additive engine';
  });

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
    sel.onchange = () => { midiCh = +sel.value; store.set('ws.midiCh', midiCh); allOff(); sel.blur(); };
  }

  // ---------------------------------------------------------------- demo (Bach, Toccata in D minor)
  demo = WSDemo({
    C, P, PARAMS, ui, post,
    startAudio: () => startAudio(),
    setParam: (i, v) => setParam(i, v, false),
    values: () => values,
    ctxTime: () => (actx ? actx.currentTime : 0),
    applyPreset: (name) => {
      const k = SPEC.PRESETS.findIndex(p => p.name === name);
      if (k < 0) return;
      const o = {}; PARAMS.forEach((p, i) => { o[p.key] = SPEC.PRESETS[k].values[i]; });
      applyKeyed(o);
    },
    snapshot: () => ({ values: toKeyed(), presetId, presetName, dirty }),
    restore: (s) => { applyKeyed(s.values); presetId = s.presetId; presetName = s.presetName; dirty = s.dirty; ui.setPresetName(presetName, dirty); },
    setPresetLabel: (txt, modified) => ui.setPresetName(txt, !!modified),
  });
  ui.makeDemoButton({
    running: () => demo.running(),
    stop: () => demo.stop(),
    songs: () => demo.songs(),
    play: (i) => demo.start(i).catch(() => {}),
    loadFile: () => $('file-midi').click(),
  });
  $('file-midi').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    f.arrayBuffer().then(buf => demo.startFile(buf, f.name)).catch(err => alert('Could not play this MIDI file: ' + err.message));
  };

  // The app always opens on the default preset (A · Wavelet Lead); user presets stay in the preset list.
  loadPreset('f:' + SPEC.DEFAULT_PRESET);
  ui.refreshAll();
  ui.setPresetName(presetName, dirty);
  build();
  showOct();

  if (/noaudio/.test(location.hash)) $('start-overlay').classList.add('gone');   // screenshots / docs
  { const m = /preset=([0-9]+)/.exec(location.hash); if (m) loadPreset('f:' + m[1]); }
  $('start-btn').onclick = () => resumeAudio();
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
    demoStart: (i) => demo.start(i || 0),
    demoSongs: () => demo.songs(),
    demoTour: (i) => demo.tourPlan(i || 0),
    demoStop: () => demo.stop(),
    demoState: () => demo.state(),
    midi: (bytes) => onMIDI({ data: bytes }),
    midiLearn: (key) => midiLearn(P[key]),
    midiMap: () => Object.assign({}, ccMap),
    midiStatus: () => $('st-midi').textContent,
    setMidiChannel: (ch) => { $('midi-ch').value = String(ch); $('midi-ch').onchange(); },
  };
})();
