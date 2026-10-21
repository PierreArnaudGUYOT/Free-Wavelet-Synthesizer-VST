// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.7). Release beta 0.2.
// Demo player: plays Beethoven's Appassionata (III) (public-domain MIDI from the Mutopia Project, web/js/demo_data.js) as a tour of the
// presets (a new preset about every 4 s, on a change of chord). A small window says which preset plays and what it is made of.
function WSDemo(api) {
  'use strict';
  const SONG = WS_DEMO_SONGS[0];
  const C = api.C, P = api.P, PARAMS = api.PARAMS, SPEC_SLOTS = WS_SPEC.SLOTS;
  const LEAD_IN = 0.25;   // seconds between the click and the first note

  // The preset sequence of the tour (tools/spec.js TOUR: the tour of the Wavelet Synthesizer's web app, same piece, same presets, same level; the presets are
  // WS_SPEC.DEMO_PRESETS, app.js applyPreset): written out so that a new menu order does not change the demo. The demo starts at song.origin (7.8 s: its opening chords are cut).
  const TOUR_STEP = 4;
  // the demo window says the idea in plain words during the first presets of the tour (one sentence each, about 4 s), then
  // describes each preset
  const TOUR_INTRO = [
    'Welcome to OKTOMULTIWAVE. Every sound you hear is built from wavelets: tiny waves, like bricks of sound.',
    'This synth has three oscillators: two that shape a classic waveform (A1, A2) and one that builds the sound brick by brick (B1).',
    'Most presets use two of them: a body that sings, and a second oscillator that adds a colour, a shimmer or the attack.',
    'An oscillator can live for a few milliseconds only: a click, a pluck, a breath. It gives the sound its attack.',
    'CHORD MODE turns the keyboard into a chord harp: one key plays a whole chord. Try it under the keyboard.',
    'Pads, plucks, organs, basses: each one is a preset you can play. Enjoy the tour!',
  ];

  // Preset tour: about every `step` seconds the next preset of the spec's TOUR (wraps around).
  // Each change is moved to a change of chord of the piece: near every `step`-second mark (within TOUR_SNAP), the onset
  // where the most notes start together. The preset is loaded TOUR_LEAD before it, so the new sound starts with the chord.
  // `origin` = where the demo starts in the piece (song.origin, when its opening bars are cut): the grid and the sequence
  // are those of the whole piece, and the tour begins with the preset loaded at the cut or less than TOUR_CUT after it,
  // so cutting the opening changes nothing after the cut.
  // Every preset is made playable on the piece: polyphonic, normal octave, no glide, short attack.
  const TOUR_SAFE = { v_voices: 16, v_oct: 0, v_glide: 0 };
  const TOUR_MAX_ATTACK = 0.08;
  const TOUR_MAX_DELAY_MIX = 0.1, TOUR_MAX_DELAY_FB = 0.3;   // long echoes on a fast piece sound like a canon
  const TOUR_SNAP = 1.5, TOUR_LEAD = 0.08, TOUR_CUT = 0.25;
  function chordOnsets(notes) {   // notes: flat [time, duration, note, velocity] * n, sorted by time
    const ev = [];
    for (let i = 0; i < notes.length; i += 4) {
      const last = ev[ev.length - 1];
      if (last && notes[i] - last.t < 0.03) last.n++; else ev.push({ t: notes[i], n: 1 });
    }
    return ev;
  }
  function tourScenes(notes, duration, step, origin) {
    const names = WS_SPEC.TOUR, ev = chordOnsets(notes);
    let out = [], prev = -origin;
    for (let k = 0; k * step < origin + duration; k++) {
      let t = k * step - origin;
      if (k > 0) {
        let best = null, score = -Infinity;
        for (const e of ev) {
          if (e.t < t - TOUR_SNAP || e.t <= prev + step / 2) continue;
          if (e.t > t + TOUR_SNAP) break;
          const s = e.n - Math.abs(e.t - t);   // a full chord close to the mark wins
          if (s > score) { score = s; best = e; }
        }
        if (best) t = best.t - TOUR_LEAD;
      }
      out.push({ t, tour: true, preset: names[k % names.length] });
      prev = t;
    }
    let first = 0;
    out.forEach((sc, i) => { if (sc.t < TOUR_CUT) first = i; });
    out = out.slice(first);
    out[0].t = 0;
    out.forEach((sc, i) => { sc.pos = i; sc.of = out.length; });
    return out;
  }
  // what the sound uses (the oscillators that play), not the panel shown
  const SLOT_NAMES = ['A1', 'A2', 'B1'];
  function playing() { const v = api.values(); return SPEC_SLOTS.map((sl, s) => (v[sl.k.lvl] > 0 ? s : -1)).filter(s => s >= 0); }
  function engineLabel() {
    const on = playing();
    return on.length ? 'Oscillators ' + on.map(s => SLOT_NAMES[s]).join(' + ') : 'No oscillator';
  }
  function presetSummary() {
    const v = api.values(), f = (i) => C.format(PARAMS[i], v[i]);
    const parts = [];
    for (const s of playing()) {
      const k = SPEC_SLOTS[s].k, lvl = Math.round(v[k.lvl] * 100);
      const tone = SPEC_SLOTS[s].mode === 0 ? `${f(k.wave).toLowerCase()} wave, ${f(k.ftype).toLowerCase()} ${f(k.fcut)}` : `${f(k.pattern).toLowerCase()} atoms, tilt ${f(k.tilt)}`;
      const extra = [];
      if (v[k.oct] !== 0 || v[k.semi] !== 0) extra.push(`${(12 * v[k.oct] + v[k.semi]) > 0 ? '+' : '−'}${Math.abs(12 * v[k.oct] + v[k.semi])} st`);
      if (v[k.eon] >= 0.5) extra.push('own envelope');
      if (v[k.pamt] !== 0) extra.push('pitch envelope');
      parts.push(`${SLOT_NAMES[s]} ${lvl}% ${tone}${extra.length ? ' (' + extra.join(', ') + ')' : ''}`);
    }
    if (v[P.sub_level] > 0) parts.push(`sub ${f(P.sub_shape).toLowerCase()} ${f(P.sub_oct)}`);
    const fx = [];
    if (v[P.ch_mix] > 0.05) fx.push('chorus');
    if (v[P.fx_drive] > 0.02) fx.push('drive');
    if (v[P.fx_dmix] > 0.05) fx.push('delay');
    if (v[P.fx_rmix] > 0.05) fx.push('reverb');
    if (fx.length) parts.push(fx.join(' + '));
    return parts.join(' · ') + '. Played polyphonic at its normal octave, with short echoes.';
  }

  let st = null;        // running state
  let win = null;       // window elements

  // ---------------------------------------------------------------- window
  function buildWindow() {
    const dev = document.getElementById('device');
    const w = document.createElement('div');
    w.className = 'demo-win';
    w.innerHTML =
      '<div class="dw-bar"><span class="dw-title"></span><button class="dw-stop" title="Stop the demo">■ STOP</button></div>' +
      '<div class="dw-body"><div class="dw-sec"></div><div class="dw-param"></div><div class="dw-val"></div><div class="dw-text"></div>' +
      '<div class="dw-prog"><i></i></div><div class="dw-foot"><span class="dw-time"></span><span class="dw-src"></span></div></div>';
    dev.appendChild(w);
    win = {
      el: w, title: w.querySelector('.dw-title'), sec: w.querySelector('.dw-sec'), param: w.querySelector('.dw-param'),
      val: w.querySelector('.dw-val'), text: w.querySelector('.dw-text'), prog: w.querySelector('.dw-prog i'),
      time: w.querySelector('.dw-time'), src: w.querySelector('.dw-src'),
    };
    w.querySelector('.dw-stop').onclick = () => stop();
    const bar = w.querySelector('.dw-bar');
    let drag = null;
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      bar.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, l: w.offsetLeft, t: w.offsetTop };
    });
    bar.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const s = api.ui.scale;
      w.style.left = Math.max(0, Math.min(1100 - w.offsetWidth, drag.l + (e.clientX - drag.x) / s)) + 'px';
      w.style.top = Math.max(0, Math.min(WS_SPEC.DEVICE.h - w.offsetHeight, drag.t + (e.clientY - drag.y) / s)) + 'px';
    });
    bar.addEventListener('pointerup', () => { drag = null; });
  }

  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  // ---------------------------------------------------------------- control
  function set(key, v) { if (key in P) api.setParam(P[key], v); }

  function enterScene(k) {
    const sc = st.scenes[k];
    if (sc.tour) {
      api.applyPreset(sc.preset);
      for (const key in TOUR_SAFE) set(key, TOUR_SAFE[key]);
      if (api.values()[P.amp_a] > TOUR_MAX_ATTACK) set('amp_a', TOUR_MAX_ATTACK);
      if (api.values()[P.fx_dmix] > TOUR_MAX_DELAY_MIX) set('fx_dmix', TOUR_MAX_DELAY_MIX);
      if (api.values()[P.fx_dfb] > TOUR_MAX_DELAY_FB) set('fx_dfb', TOUR_MAX_DELAY_FB);
      // version 1.0.4: the piece (every note at velocity 1, 16 voices) must not reach the output stage: some presets of the tour play a few dB lower (tools/demo_trim.js)
      const trim = (WS_SPEC.DEMO_TRIM || {})[sc.preset];
      if (trim) set('master', Math.max(PARAMS[P.master].min, api.values()[P.master] - trim));
      st.scene = k;
      api.setPresetLabel(sc.preset, false);
      const engine = engineLabel();
      win.sec.textContent = `Preset tour · ${sc.pos + 1}/${sc.of} · ${engine}`;
      win.param.textContent = 'Now playing: ' + sc.preset;
      win.text.textContent = sc.pos < TOUR_INTRO.length ? TOUR_INTRO[sc.pos] : presetSummary();
      return;
    }
  }

  // Scene clock: the audio thread reports the sequencer position about 30 times per second;
  // between reports it is extrapolated (at most 120 ms). Before the first note and after the
  // last one, the AudioContext clock is used.
  function now() {
    if (st.sync) return st.sync.seq + Math.min(0.12, (performance.now() - st.sync.at) / 1000);
    return api.ctxTime() - st.t0;
  }

  function tick() {
    if (!st) return;
    const t = now();
    let k = 0;
    for (let i = 0; i < st.scenes.length; i++) if (t >= st.scenes[i].t) k = i;
    if (t >= 0 && k !== st.scene) enterScene(k);
    const sc = st.scenes[st.scene];
    if (sc && sc.tour && t >= 0) {
      const next = st.scenes[st.scene + 1];
      win.val.textContent = next ? `next preset in ${Math.max(0, next.t - t).toFixed(1)} s: ${next.preset}` : 'last preset of this demo';
    }
    const total = st.song.duration;
    win.prog.style.width = (100 * Math.min(1, Math.max(0, t / total))) + '%';
    win.time.textContent = `${mmss(Math.max(0, Math.min(total, t)))} / ${mmss(Math.round(total))}`;   // total rounded like the menu
    if (t > total + 2.5) { stop(); return; }
    st.raf = requestAnimationFrame(tick);
  }

  // Plays Beethoven's Appassionata (III) as a tour of the presets.
  async function start() {
    if (st) stop();
    await api.startAudio();
    if (!win) buildWindow();
    const song = SONG;
    const scenes = tourScenes(song.notes, song.duration, TOUR_STEP, song.origin || 0);
    st = { song, scenes, saved: api.snapshot(), scene: -1, t0: api.ctxTime() + LEAD_IN, raf: 0, sync: null };
    api.post({ t: 'alloff' });
    api.post({ t: 'seq', notes: song.notes, delay: LEAD_IN });
    win.title.textContent = 'DEMO · ' + song.composer + ' — ' + (song.short || song.title);
    win.title.title = song.title;
    win.src.textContent = 'MIDI: ' + song.source.replace(/ \(mutopiaproject\.org\)/, '') + ' · public domain';
    win.el.style.display = 'block';
    api.ui.setDemoRunning(true);
    enterScene(0);
    st.raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    api.post({ t: 'seqstop' });
    const saved = st.saved;
    st = null;
    api.ui.setDemoRunning(false);
    if (win) win.el.style.display = 'none';
    api.restore(saved);
  }

  function onSeqTime(seqTime) {
    if (!st) return;
    if (seqTime >= 0) st.sync = { seq: seqTime, at: performance.now() };
    else if (st.sync) {   // the sequence has ended: continue on the AudioContext clock
      st.t0 = api.ctxTime() - (st.sync.seq + Math.min(0.12, (performance.now() - st.sync.at) / 1000));
      st.sync = null;
    }
  }

  return {
    start, stop, onSeqTime,
    running: () => !!st,
    // the preset tour ([{ t, preset }]): for the tests and the manual
    tourPlan: () => tourScenes(SONG.notes, SONG.duration, TOUR_STEP, SONG.origin || 0).map(x => ({ t: x.t, preset: x.preset })),
    song: () => ({ title: SONG.title, short: SONG.short || SONG.title, composer: SONG.composer, duration: SONG.duration, license: SONG.license }),
    state: () => (st ? { running: true, song: st.song.title, scene: st.scene, preset: st.scenes[Math.max(0, st.scene)].preset,
      scenes: st.scenes.length, time: now() } : { running: false }),
  };
}
