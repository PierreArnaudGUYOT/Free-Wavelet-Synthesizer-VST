// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.7).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// AudioWorklet processor. This function is serialised with toString() and loaded
// from a data: URL together with WSCoreFactory, so the app also works from file://.
function WSWorkletMain() {
  'use strict';
  class WSProcessor extends AudioWorkletProcessor {
    constructor(options) {
      super();
      this.C = WSCoreFactory(options.processorOptions.spec);
      this.eng = new this.C.Engine(sampleRate);
      this.since = 0;
      this.dispEvery = Math.round(sampleRate / 30);
      this.seq = null;       // demo sequencer: sample-accurate note events
      this.seqDone = false;
      this.port.onmessage = (e) => {
        const m = e.data, eng = this.eng;
        switch (m.t) {
          case 'p': if (Number.isFinite(m.v)) eng.setParam(m.i, m.v); break;   // a NaN would stay in the engine's state
          case 'all': for (let i = 0; i < m.v.length; i++) if (Number.isFinite(m.v[i])) eng.setParam(i, m.v[i]); break;
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
