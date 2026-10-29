// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: LicenseRef-OktoWave (all rights reserved, see LICENSE)
// WebAssembly prototype: the C++ engine (vst/src/dsp.h compiled by wasm/build.sh, web/js/engine_wasm_data.js) behind the interface of core.js's Engine that
// worklet.js uses (p, setParam, setTables, noteOn / noteOff, keyOn / keyOff, plateOn / plateOff, allNotesOff, allSoundOff, anyVoice, process, disp, keys, selHeld,
// the chord state, noMicro, chordTypeChanged). Like WSCoreFactory it is serialised with toString() into the worklet's data: URL; Node loads it with require().
//   const eng = WSWasmEngine(module, sampleRate)   (module: a WebAssembly.Module)
// The tables (core.js buildTables: Float32Arrays) are copied into the module's memory, one block per set; the engine frees a bundle it no longer plays.
function WSWasmEngine(module, sr) {
  'use strict';
  // the C library's few system calls (an abort message, a clock): never used by the engine; refused (ENOSYS)
  const nosys = () => 52;
  const inst = new WebAssembly.Instance(module, { wasi_snapshot_preview1: { clock_time_get: nosys, fd_close: nosys, fd_seek: nosys, fd_write: nosys } });
  const x = inst.exports;
  x._initialize();
  x.ws_create(sr);
  const NP = x.ws_num_params(), NB = 11, MAXV = 16, VK_PHASE = 0, VK_ANGLE = 4, VK_ROT = 5;
  const pP = x.ws_params() >> 3, pL = x.ws_out_l() >> 2, pR = x.ws_out_r() >> 2, pK = x.ws_keys(), pS = x.ws_sel_held(), MAXB = x.ws_max_block();
  const SN = x.ws_state_size();
  let buf = null, f32 = null, f64 = null, u8 = null, pV = null, keysV = null, selV = null, oL128 = null, oR128 = null;
  // the views follow the memory (it grows when the tables need more: the old ArrayBuffer is then detached); made once per buffer (no garbage on the audio thread)
  const views = () => {
    if (buf === x.memory.buffer) return;
    buf = x.memory.buffer; f32 = new Float32Array(buf); f64 = new Float64Array(buf); u8 = new Uint8Array(buf);
    pV = f64.subarray(pP, pP + NP); keysV = u8.subarray(pK, pK + 128); selV = u8.subarray(pS, pS + 128);
    oL128 = f32.subarray(pL, pL + 128); oR128 = f32.subarray(pR, pR + 128);   // the output of a whole render quantum
  };
  views();
  const NS = Math.round((SN - NB - 11 - 4 - 2 * MAXV) / (NB + 3));
  const disp = { gains: new Float32Array(NB), mode: 0, view: 0, voices: 0, center: 0, width: 1, depth: 0, note: -1, slotLive: false,
    sg: new Float32Array(NS * NB), swin: new Float32Array(NS * 3), mask: 0, pkL: 0, pkR: 0 };
  // the worklet resets the peaks it has sent (d.peakL = 0)
  Object.defineProperty(disp, 'peakL', { get() { return this.pkL; }, set(v) { this.pkL = v; if (v === 0) x.ws_clear_peaks(); } });
  Object.defineProperty(disp, 'peakR', { get() { return this.pkR; }, set(v) { this.pkR = v; if (v === 0) x.ws_clear_peaks(); } });
  const chord = { root: -1, last: 60, n: 0, changed: false, note: new Int16Array(MAXV), on: new Uint8Array(MAXV) };
  function refresh() {
    const o0 = x.ws_state() >> 2;
    views();
    let o = o0;
    for (let b = 0; b < NB; b++) disp.gains[b] = f32[o++];
    disp.mode = f32[o++]; disp.view = f32[o++]; disp.voices = f32[o++]; disp.pkL = f32[o++]; disp.pkR = f32[o++];
    disp.center = f32[o++]; disp.width = f32[o++]; disp.depth = f32[o++]; disp.note = f32[o++]; disp.slotLive = f32[o++] !== 0; disp.mask = f32[o++];
    for (let k = 0; k < NS * NB; k++) disp.sg[k] = f32[o++];
    for (let k = 0; k < NS * 3; k++) disp.swin[k] = f32[o++];
    chord.root = f32[o++]; chord.last = f32[o++]; chord.n = f32[o++]; chord.changed = f32[o++] !== 0;
    for (let k = 0; k < MAXV; k++) chord.note[k] = f32[o++];
    for (let k = 0; k < MAXV; k++) chord.on[k] = f32[o++];
  }
  // one set of tables into the module's memory: [mips pointer, rms pointer]
  function put(b, set) {
    const nm = set.mips.length, p = x.ws_bundle_alloc(b, nm + set.rms.length);
    if (!p) throw new Error('WebAssembly engine: out of memory for the tables');
    views();
    f32.set(set.mips, p >> 2); f32.set(set.rms, (p >> 2) + nm);
    return [p, p + 4 * nm];
  }
  // A copy of a table set (core.js's format: { needs, slots: [per oscillator { mode, mips, rms, vk?, ph?: [sets], w2?: { mode, mips, rms, vk?, ph? } } or null] }), as dsp.h
  // tableRef() maps it: the sets to copy, each with the places it takes (kind 0 own, 1 WAVELET 2, 2 variant k, 3 WAVELET 2 variant k; PHASE: variant 0 is the own set).
  // A heavy preset has up to 49 sets of 1 MB: the copy can be spread over several render quanta (pump), started when the tables arrive.
  function makeStage(tb) {
    const b = x.ws_bundle_new(), ops = [];
    tb.slots.forEach((t, s) => {
      if (!t) return;
      const main = { set: t, regs: [[s, 0, 0, -1]] };
      ops.push(main);
      let w2 = null;
      if (t.w2) { w2 = { set: t.w2, regs: [[s, 1, 0, -1]] }; ops.push(w2); }
      if (t.vk !== undefined && t.vk >= 0 && t.ph) {
        const first = (t.vk === VK_PHASE || t.vk === VK_ANGLE || t.vk === VK_ROT) ? 1 : 0;   // (TEST 1.2: the ANGLE sets go round like the PHASE ones: set 0 is the oscillator's own; 1.4: the ROTATE ones too)
        if (first) main.regs.push([s, 2, 0, t.vk]);
        t.ph.forEach((ps, j) => ops.push({ set: ps, regs: [[s, 2, j + first, t.vk]] }));
        if (w2 && t.w2.ph && t.w2.ph.length === t.ph.length) {
          if (first) w2.regs.push([s, 3, 0, t.vk]);
          t.w2.ph.forEach((ps, j) => ops.push({ set: ps, regs: [[s, 3, j + first, t.vk]] }));
        }
      }
    });
    return { tb, b, ops, i: 0, later: false };
  }
  // copy sets until `budget` floats are copied (or all of them): true when the stage is complete
  function step(st, budget) {
    while (st.i < st.ops.length && budget > 0) {
      const op = st.ops[st.i++], m = put(st.b, op.set);
      budget -= op.set.mips.length;
      for (const r of op.regs) x.ws_bundle_set(st.b, r[0], r[1], r[2], r[3], op.set.mode, m[0], m[1]);
    }
    return st.i >= st.ops.length;
  }
  const PUMP = 1 << 18;   // floats copied per render quantum: one set (1 MB) per quantum
  let stages = [];        // copies in progress or waiting for their setTables, oldest first
  const dropStage = (st) => { stages = stages.filter(z => z !== st); x.ws_bundle_free(st.b); };
  function commit(st) {
    const k = stages.indexOf(st);
    // a copy asked for before this one and still waiting to be played would come after these tables: it is out of date
    for (const z of stages.slice(0, Math.max(0, k))) if (z.later) dropStage(z);
    stages = stages.filter(z => z !== st);
    x.ws_bundle_commit(st.b);
  }
  const eng = {
    wasm: true,
    get p() { views(); return pV; },
    setParam(i, v) { x.ws_set_param(i, v); },
    setTempo(bpm) { x.ws_set_tempo(bpm); },
    noteOn(n, v) { x.ws_note_on(n, v); },
    noteOff(n) { x.ws_note_off(n); },
    keyOn(n, v) { x.ws_key_on(n, v); },
    keyOff(n) { x.ws_key_off(n); },
    plateOn(n, v) { x.ws_plate_on(n, v); },
    plateOff(n) { x.ws_plate_off(n); },
    allNotesOff() { x.ws_all_notes_off(); },
    allSoundOff() { x.ws_all_sound_off(); },
    anyVoice() { return x.ws_any_voice() !== 0; },
    latency() { return x.ws_latency(); },
    bundlesAlive() { return x.ws_bundles_alive(); },
    memoryBytes() { return x.memory.buffer.byteLength; },
    // the tables now (what is not copied yet is copied here)
    setTables(tb) {
      let st = stages.find(z => z.tb === tb);
      if (!st) { st = makeStage(tb); stages.push(st); }
      st.later = false;
      try { step(st, Infinity); } catch (e) { dropStage(st); throw e; }
      commit(st);
    },
    // the copy of tables that will be played soon (a preset change: worklet 'bulk'), spread over the next quanta
    stage(tb) {
      if (!tb || stages.some(z => z.tb === tb)) return;
      while (stages.length >= 3) dropStage(stages[0]);   // (changes that never came: the latest ones are kept)
      stages.push(makeStage(tb));
    },
    // the tables when their copy is over (worklet 'tables': a knob's rebuild; a few quanta later than with core.js)
    setTablesLater(tb) {
      this.stage(tb);
      const st = stages.find(z => z.tb === tb);
      if (st) st.later = true;
    },
    // at every render quantum: PUMP floats of the oldest copy; a copy asked for by setTablesLater is played when complete
    pump() {
      const st = stages.find(z => z.i < z.ops.length) || stages.find(z => z.later);
      if (!st) return;
      let done;
      try { done = step(st, PUMP); } catch (e) { dropStage(st); return; }
      if (done && st.later) commit(st);
    },
    pendingCopies() { return stages.length; },
    // the tables built by the C++ code from the parameters (measures)
    buildTables(params) { views(); f64.set(params, x.ws_scratch() >> 3); x.ws_build_commit(); },
    buildOnly(params) { views(); f64.set(params, x.ws_scratch() >> 3); x.ws_build_only(); },
    // n samples (any n) into L / R
    process(L, R, n) {
      let o = 0;
      while (o < n) {
        const m = Math.min(MAXB, n - o);
        x.ws_process(m);
        views();
        if (m === 128) { L.set(oL128, o); R.set(oR128, o); } else { L.set(f32.subarray(pL, pL + m), o); R.set(f32.subarray(pR, pR + m), o); }
        o += m;
      }
    },
    get disp() { refresh(); return disp; },
    get keys() { views(); return keysV; },
    get selHeld() { views(); return selV; },
    get chordN() { refresh(); return chord.n; },
    get chordOn() { return chord.on; },
    get chordNote() { return chord.note; },
    get chordRoot() { return chord.root; },
    get chordLastRoot() { return chord.last; },
    get chordTypeChanged() { return chord.changed; },
    set chordTypeChanged(v) { chord.changed = !!v; x.ws_set_chord_type_changed(v ? 1 : 0); },
    get noMicro() { return x.ws_no_micro() !== 0; },
    set noMicro(v) { x.ws_set_no_micro(v ? 1 : 0); },
  };
  return eng;
}
if (typeof module !== 'undefined') module.exports = WSWasmEngine;
