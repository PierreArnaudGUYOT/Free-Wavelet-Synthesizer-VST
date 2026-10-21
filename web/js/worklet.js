// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.7).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// AudioWorklet processor. This function is serialised with toString() and loaded
// from a data: URL together with WSCoreFactory, so the app also works from file://.
function WSWorkletMain() {
  'use strict';
  const MORPH_QUANTA = 24;   // the continuous parameters of a preset change take 24 render quanta of 128 samples (64 ms at 48 kHz)
  // the dip that hides what a change of structure does (a new unison count, octave, filter type, LFO target, the new tables ...): the output goes down in DUCK_DOWN quanta, the change is made
  // while it is silent (DUCK_HOLD quanta), the output comes back in DUCK_UP quanta. 2 + 3 + 8 quanta = 35 ms at 48 kHz.
  const DUCK_DOWN = 2, DUCK_HOLD = 3, DUCK_UP = 8;
  const duckGain = (t) => (t <= DUCK_DOWN ? 1 - t / DUCK_DOWN : t <= DUCK_DOWN + DUCK_HOLD ? 0 : Math.min(1, (t - DUCK_DOWN - DUCK_HOLD) / DUCK_UP));
  class WSProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.C = WSCoreFactory(options.processorOptions.spec);
      this.eng = new this.C.Engine(sampleRate);
      this.since = 0;
      this.dispEvery = Math.round(sampleRate / 30);
      this.seq = null;       // demo sequencer: sample-accurate note events
      this.seqDone = false;
      // version 1.0.6: a preset change (message 'bulk') is a morph, not a step. The engine takes a new value at once (a new filter cutoff, drive, scale filter, effects ... under notes that
      // sound is a click, and the filters and the reverb then ring with it: the "buzz" at every change of preset in the demo). The continuous parameters therefore travel from their old to
      // their new value in MORPH_QUANTA render quanta (64 ms at 48 kHz); the choices and integers (a filter type, the number of unison voices ...) and the tables, which have their own
      // 10 ms crossfade, change at the start. The engine itself is untouched (it is the same in the plug-in).
      this.morph = null;
      this.pending = null;   // a preset change waiting for the dip to reach silence: { v, tables }
      this.dk = -1;          // the dip's position in render quanta (-1: none)
      this.discrete = Uint8Array.from(options.processorOptions.spec.PARAMS, p => (p.curve === 'choice' || p.curve === 'int' ? 1 : 0));
      this.port.onmessage = (e) => {
        const m = e.data, eng = this.eng;
        switch (m.t) {
          case 'p': if (this.morph) this.morph.idx = this.morph.idx.filter(j => j !== m.i);   // the player's own move wins over the morph
            if (Number.isFinite(m.v)) eng.setParam(m.i, m.v); break;   // a NaN would stay in the engine's state
          case 'all': this.applyPending(); this.endMorph(); for (let i = 0; i < m.v.length; i++) if (Number.isFinite(m.v[i])) eng.setParam(i, m.v[i]); break;
          case 'bulk': this.presetChange(m.v, m.tables); break;   // version 1.0.6: a preset change, the parameters and the tables together
          case 'tables': eng.setTables(m.tables); break;   // { needs, slots: [A1, A2, B1] }: per oscillator { mode, mips, rms, ph?, w2? } or null
          case 'on': eng.keyOn(m.n, m.v); break;      // Okto MultiWave Synth: the player's keys go through the chord layer
          case 'off': eng.keyOff(m.n); break;
          case 'plateon': eng.plateOn(m.n, m.v); break;   // the strum plate
          case 'plateoff': eng.plateOff(m.n); break;
          case 'alloff': eng.allNotesOff(); break;
          case 'soundoff': eng.allSoundOff(); break;
          case 'seq': this.startSeq(m.notes, m.delay); break;
          case 'seqstop': if (this.seq) { this.seq = null; eng.allNotesOff(); } break;
        }
      };
      this.port.postMessage({ t: 'ready', sr: sampleRate });
    }

    // a preset change (message 'bulk'): under sounding notes the output dips, and the change is made at the bottom of the dip; with nothing sounding (a tail, or silence) it is made at once, and so
    // it is while a dip is already running (a fast succession of changes)
    presetChange(v, tables) {
      this.applyPending();
      if (this.dk >= 0 || !this.eng.anyVoice()) { this.startMorph(v, tables); return; }
      this.pending = { v, tables };
      this.dk = 0;
    }
    applyPending() {
      const pd = this.pending;
      if (!pd) return;
      this.pending = null;
      this.startMorph(pd.v, pd.tables);
    }
    // the discrete parameters and the tables now, the continuous ones step by step (see the constructor)
    startMorph(v, tables) {
      const eng = this.eng;
      this.endMorph();
      const from = Float64Array.from(eng.p), idx = [];
      for (let i = 0; i < v.length; i++) {
        if (!Number.isFinite(v[i])) continue;
        if (this.discrete[i]) eng.setParam(i, v[i]); else if (v[i] !== from[i]) idx.push(i);
      }
      eng.setTables(tables);
      if (idx.length) this.morph = { from, to: v, idx, k: 0 };
    }
    endMorph() {
      const mo = this.morph;
      if (!mo) return;
      for (const i of mo.idx) this.eng.setParam(i, mo.to[i]);
      this.morph = null;
    }
    stepMorph() {
      const mo = this.morph;
      if (!mo) return;
      if (++mo.k >= MORPH_QUANTA) { this.endMorph(); return; }
      const t = mo.k / MORPH_QUANTA, e = t * t * (3 - 2 * t);   // smoothstep
      for (const i of mo.idx) this.eng.setParam(i, mo.from[i] + (mo.to[i] - mo.from[i]) * e);
    }

    // notes: flat [time s, duration s, note, velocity] * n, played from now + delay seconds
    startSeq(notes, delay) {
      const start = currentFrame + Math.round((delay || 0) * sampleRate), ev = [];
      for (let i = 0; i < notes.length; i += 4) {
        const on = start + Math.round(notes[i] * sampleRate), off = start + Math.round((notes[i] + notes[i + 1]) * sampleRate);
        ev.push([on, 1, notes[i + 2], notes[i + 3]], [off, 0, notes[i + 2], 0]);
      }
      ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);   // note-offs before note-ons on the same frame
      this.seq = { ev, i: 0, start, count: new Uint8Array(128) };
      this.seqDone = false;
      this.eng.noMicro = true;   // the demo plays in equal temperament (whatever the oriental tuning says), tails included
    }

    process(inputs, outputs) {
      const out = outputs[0], eng = this.eng;
      let g0 = 1, g1 = 1;
      if (this.dk >= 0) {
        const k = this.dk++;
        g0 = duckGain(k); g1 = duckGain(k + 1);
        if (this.pending && g0 === 0) this.applyPending();   // the first silent quantum: the change is made now
        if (this.dk >= DUCK_DOWN + DUCK_HOLD + DUCK_UP) this.dk = -1;
      }
      this.stepMorph();
      const L = out[0], R = out[1] || (this.tmp || (this.tmp = new Float32Array(L.length)));
      const n = L.length;
      let pos = 0;
      const s = this.seq;
      if (s) {
        const f0 = currentFrame;
        while (s.i < s.ev.length && s.ev[s.i][0] < f0 + n) {
          const e = s.ev[s.i], off = Math.max(0, e[0] - f0);
          if (off > pos) { eng.process(L.subarray(pos, off), R.subarray(pos, off), off - pos); pos = off; }
          // the same pitch can be held by two voices of the score: count, release on the last note-off
          if (e[1]) { s.count[e[2]]++; eng.noteOn(e[2], e[3]); }
          else if (s.count[e[2]] > 0 && --s.count[e[2]] === 0) eng.noteOff(e[2]);
          s.i++;
        }
        if (s.i >= s.ev.length) { this.seq = null; this.seqDone = true; }
      }
      if (eng.noMicro && !this.seq && !eng.anyVoice()) eng.noMicro = false;   // the song and its tails are over
      if (pos === 0) eng.process(L, R, n);   // no sequencer: the buffers as they are (no view created per quantum)
      else if (pos < n) eng.process(L.subarray(pos), R.subarray(pos), n - pos);
      if (g0 !== 1 || g1 !== 1) {   // the dip
        const c0 = out[0], c1 = out[1], m = c0.length;
        for (let i = 0; i < m; i++) { const g = g0 + (g1 - g0) * (i + 1) / m; c0[i] *= g; if (c1) c1[i] *= g; }
      }
      this.since += n;
      if (this.since >= this.dispEvery) {
        this.since = 0;
        const d = eng.disp, keys = [];
        for (let k = 0; k < 128; k++) if (eng.keys[k] || eng.selHeld[k]) keys.push(k);   // (the selector keys of CHORD MODE make no sound: they are lit while held)
        // Okto MultiWave Synth: the chord sounding (root, its notes started so far), the last root, and the chord type (a selector key
        // may have changed it: the app then updates its panel)
        const notes = [];
        for (let k = 0; k < eng.chordN; k++) if (eng.chordOn[k]) notes.push(eng.chordNote[k]);
        const chord = { root: eng.chordRoot, last: eng.chordLastRoot, notes, type: eng.p[this.C.P.chord_type], changed: eng.chordTypeChanged };
        eng.chordTypeChanged = false;
        this.port.postMessage({ t: 'disp', gains: Array.from(d.gains), mode: d.mode, view: d.view, slotLive: d.slotLive, voices: d.voices, peakL: d.peakL, peakR: d.peakR,
          mask: d.mask, sg: Array.from(d.sg), swin: Array.from(d.swin),   // beta 0.3.1: the live gains and windows of every oscillator that plays (the scope and the scalogram)
          center: d.center, width: d.width, depth: d.depth, note: d.note, keys, chord,
          seqTime: this.seq ? (currentFrame - this.seq.start) / sampleRate : -1, seqDone: this.seqDone });
        d.peakL = 0; d.peakR = 0;
      }
      return true;
    }
  }
  registerProcessor('wavelet-synth', WSProcessor);
}
