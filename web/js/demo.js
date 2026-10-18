// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre). Release beta 0.1.
// Demo player: plays public-domain pieces (MIDI from the Mutopia Project) or your own MIDI file
// while animating the important parameters. A small window explains, in English, what is changing.
function WSDemo(api) {
  'use strict';
  const SONGS = WS_DEMO_SONGS;
  const C = api.C, P = api.P, PARAMS = api.PARAMS;
  const LEAD_IN = 0.25;   // seconds between the click and the first note
  const MAX_FILE_SECONDS = 360;

  // constants for the whole demo: enough voices for chords, no delay, a bit of hall
  const BASE = { v_voices: 16, v_unison: 1, v_glide: 0, v_oct: 0, fx_dmix: 0, fx_drive: 0, fx_rmix: 0.28, fx_rsize: 0.78,
    lfo_pitch: 0, lfo_cut: 0, lfo_pos: 0, p_depth: 0, f_env: 0, f_vel: 0, master: -3, sub_level: 0 };
  const ORGAN = { amp_a: 0.006, amp_d: 0.25, amp_s: 0.92, amp_r: 0.22, amp_vel: 0.2 };
  const KEYS = { amp_a: 0.002, amp_d: 1.1, amp_s: 0.35, amp_r: 0.3, amp_vel: 0.5 };
  const PLUCK = { amp_a: 0.002, amp_d: 0.45, amp_s: 0.25, amp_r: 0.15, amp_vel: 0.4 };
  const A_SOUND = { a_wave: 0, wavelet: 2, f_cutoff: 6, f_res: 4, f_slope: 24, a_sparsity: 0, p_depth: 0 };
  const B_SOUND = { wavelet: 6, b_pattern: 0, b_tilt: -3, f_cutoff: 12 };

  // ---------------------------------------------------------------- Toccata: hand-written scenes
  // ramp: [t0, t1, from, to]   steps: [[t, value], ...]   wave: [t0, t1] (drawbars)
  const TOCCATA = [
    { t: 0, section: 'Opening motif', preset: 'B · Octave Organ', set: { ...BASE, ...ORGAN, wavelet: 6 },
      param: 'wavelet', steps: [[0, 6], [2, 4], [4, 0]],
      text: 'Engine B builds every note from wavelet atoms. Same drawbars, three atom shapes: smooth (Daubechies 20), wavy (Symlet 8), square steps (Haar).' },
    { t: 6, section: 'The D minor chord', set: { wavelet: 3 }, param: 'b_tilt', ramp: [6, 9.4, -12, 1],
      text: 'Tilt lifts the fine bands relative to the fundamental band: the organ opens up as the chord builds.' },
    { t: 11.5, section: 'First run', preset: 'A · Init', set: { ...BASE, ...ORGAN, a_wave: 0, wavelet: 2, f_res: 6, f_slope: 24, f_cutoff: 1.5 },
      param: 'f_cutoff', ramp: [11.75, 17.5, 1.5, 10],
      text: 'Engine A filters a sawtooth in the wavelet domain. Raising the cutoff lets finer bands (higher octaves of harmonics) through.' },
    { t: 19.5, section: 'Echo of the run', set: { f_cutoff: 4.5, f_res: 0 }, param: 'f_res', ramp: [19.75, 25.5, 0, 18],
      text: 'Resonance boosts the bands around the cutoff: the ringing takes the shape of the wavelet itself.' },
    { t: 27.5, section: 'Diminished passage', set: { f_res: 5, f_cutoff: 4, f_slope: 6 }, param: 'f_slope', ramp: [27.75, 38, 6, 72],
      text: 'Slope is the attenuation per band above the cutoff (about dB per octave): from gentle to brick-wall.' },
    { t: 38.6, section: 'Chords', set: { f_slope: 30, f_cutoff: 7, f_res: 4, a_width: 0.25 }, param: 'a_wave', steps: [[38.6, 1], [41.1, 2], [43.6, 3]],
      text: 'The source cycle changes (square, pulse, skewed triangle) and its wavelet bands are recomputed on the fly.' },
    { t: 45.5, section: 'Fast arpeggios', set: { a_wave: 0, wavelet: 3, f_cutoff: 2.5, f_res: 8, p_center: 0, p_width: 0.3, lfo_shape: 0, lfo_rate: 0.5, lfo_pos: 0.5, p_depth: 0 },
      param: 'p_depth', ramp: [45.75, 51, 0, 1],
      text: 'The position window applies the filter only inside part of each cycle, and the LFO moves that window around the cycle. A classic filter cannot do this.' },
    { t: 59.8, section: 'Sequence', set: { p_depth: 0, lfo_pos: 0, f_cutoff: 9, f_res: 0, wavelet: 1, a_sparsity: 0 }, param: 'a_sparsity', ramp: [60, 68, 0, 0.92],
      text: 'Sparsity keeps only the strongest atoms, like a lossy codec: the tone becomes more and more skeletal.' },
    { t: 68.8, section: 'Atom patterns', preset: 'B · Init', set: { ...BASE, ...ORGAN, wavelet: 4, b_tilt: -4, f_cutoff: 12 },
      param: 'b_pattern', steps: [[68.8, 0], [73.3, 1], [76.9, 3], [80.6, 5]],
      text: 'Engine B writes the atom coefficients directly. Ramp, Mirror, Walsh and Random patterns give different harmonic families.' },
    { t: 85.5, section: 'Recitative', set: { b_pattern: 0, wavelet: 6, b_tilt: 0 }, param: 'drawbars', wave: [86, 105.5],
      text: 'The 11 drawbars are the band levels, one per octave of harmonics. A wave travels across them, from the fundamental to the finest band.' },
    { t: 105.6, section: 'Final cadence', preset: 'B · Octave Organ', set: { ...BASE, ...ORGAN, wavelet: 6, fx_rmix: 0.25 },
      param: 'fx_rmix', ramp: [106, 117.5, 0.25, 0.6],
      text: 'Back to the full wavelet organ; the reverb grows for the final chord.' },
  ];

  // ---------------------------------------------------------------- scene templates for the other songs
  // eng: engine needed ('A', 'B' or '*'); make(a, b, env) returns a scene for the time span [a, b]
  const steps = (a, b, vals) => vals.map((v, k) => [a + (b - a) * k / vals.length, v]);
  const T = {
    wavelets: { eng: 'B', make: (a, b, env) => ({ section: 'Wavelet atom shape', preset: 'B · Octave Organ', set: { ...BASE, ...env, wavelet: 6 },
      param: 'wavelet', steps: steps(a, b, [6, 4, 0]),
      text: 'Engine B builds each note from wavelet atoms. Same drawbars, three atom shapes: smooth (Daubechies 20), wavy (Symlet 8), square steps (Haar).' }) },
    tilt: { eng: 'B', make: (a, b) => ({ section: 'Band tilt', set: { wavelet: 3 }, param: 'b_tilt', ramp: [a, b, -12, 1],
      text: 'Tilt lifts the fine bands relative to the fundamental band: the sound opens up.' }) },
    patterns: { eng: 'B', make: (a, b, env) => ({ section: 'Atom patterns', preset: 'B · Init', set: { ...BASE, ...env, wavelet: 0, b_tilt: -4, f_cutoff: 12 },
      param: 'b_pattern', steps: steps(a, b, [0, 1, 3, 5]),
      text: 'Engine B writes the atom coefficients directly. With Haar atoms, Ramp, Mirror, Walsh and Random patterns sound like four different chip-tune voices.' }) },
    drawbars: { eng: 'B', make: (a, b) => ({ section: 'Drawbars', set: { b_pattern: 0, wavelet: 6, b_tilt: 0 }, param: 'drawbars', wave: [a, b],
      text: 'The 11 drawbars are the band levels, one per octave of harmonics. A wave travels across them, from the fundamental to the finest band.' }) },
    cutoff: { eng: 'A', make: (a, b, env) => ({ section: 'Filter sweep', preset: 'A · Init', set: { ...BASE, ...env, ...A_SOUND, f_res: 6, f_cutoff: 1.5 },
      param: 'f_cutoff', ramp: [a, b, 1.5, 10],
      text: 'Engine A filters a sawtooth in the wavelet domain. Raising the cutoff lets finer bands (higher octaves of harmonics) through.' }) },
    reso: { eng: 'A', make: (a, b) => ({ section: 'Resonance', set: { f_cutoff: 4.5, f_res: 0 }, param: 'f_res', ramp: [a, b, 0, 18],
      text: 'Resonance boosts the bands around the cutoff: the ringing takes the shape of the wavelet itself.' }) },
    slope: { eng: 'A', make: (a, b) => ({ section: 'Filter slope', set: { f_res: 5, f_cutoff: 4, f_slope: 6 }, param: 'f_slope', ramp: [a, b, 6, 72],
      text: 'Slope is the attenuation per band above the cutoff (about dB per octave): from gentle to brick-wall.' }) },
    wave: { eng: 'A', make: (a, b) => ({ section: 'Source wave', set: { f_slope: 30, f_cutoff: 7, f_res: 4, a_width: 0.25 }, param: 'a_wave', steps: steps(a, b, [1, 2, 3]),
      text: 'The source cycle changes (square, pulse, skewed triangle) and its wavelet bands are recomputed on the fly.' }) },
    position: { eng: 'A', make: (a, b) => ({ section: 'Position window', set: { a_wave: 0, wavelet: 3, f_cutoff: 2.5, f_res: 8, p_center: 0, p_width: 0.3, lfo_shape: 0, lfo_rate: 0.5, lfo_pos: 0.5, p_depth: 0 },
      param: 'p_depth', ramp: [a, a + (b - a) * 0.5, 0, 1],
      text: 'The position window applies the filter only inside part of each cycle, and the LFO moves that window around the cycle. A classic filter cannot do this.' }) },
    sparsity: { eng: 'A', make: (a, b) => ({ section: 'Sparsity', set: { p_depth: 0, lfo_pos: 0, f_cutoff: 9, f_res: 0, wavelet: 1, a_sparsity: 0 }, param: 'a_sparsity', ramp: [a, b, 0, 0.92],
      text: 'Sparsity keeps only the strongest atoms, like a lossy codec: the tone becomes more and more skeletal.' }) },
    sub: { eng: 'A', make: (a, b) => ({ section: 'Sub oscillator', set: { sub_oct: 0, sub_shape: 0, a_sparsity: 0, f_cutoff: 6 }, param: 'sub_level', ramp: [a, a + (b - a) * 0.6, 0, 0.8],
      text: 'The sub oscillator adds a pure sine one octave below each note: more low end, untouched by the wavelet filter.' }) },
    delay: { eng: '*', make: (a, b) => ({ section: 'Ping-pong delay', set: { fx_dtime: 0.3, fx_dfb: 0.45 }, param: 'fx_dmix', ramp: [a, b, 0, 0.45],
      text: 'The ping-pong delay throws echoes from left to right; its level grows through this phrase.' }) },
    unison: { eng: '*', make: (a, b) => ({ section: 'Unison', set: { v_unison: 3, v_width: 1, v_detune: 0 }, param: 'v_detune', ramp: [a, b, 0, 35],
      text: 'Three detuned copies of each voice, spread in stereo: detuning them makes the sound wider and richer.' }) },
    final: { eng: '*', make: (a, b) => ({ section: 'Finale', set: { fx_rmix: 0.25 }, param: 'fx_rmix', ramp: [a, b, 0.25, 0.6],
      text: 'The reverb grows for the final bars.' }) },
  };

  // The preset sequence of the default demo, on the whole piece (one preset about every 4 s). It is written out so that new
  // factory presets or a new menu order do not change the demo. The demo starts at song.origin (7.8 s: its opening
  // chords are cut), so it begins with "B · Clarinet", the preset playing there; the first two are not heard.
  const TOUR_APPASSIONATA = ['A · Warm Pad', 'A · Wavelet Lead',
    // beta 0.7: OktoPierre's 16 sounds of the earlier tour (in their order, from "B · Clarinet") mixed one by one with his
    // TOP Sounds (presets file V7, the best first, those already in the tour left out); the piece has room for 30 presets
    // after the cut
    'B · Clarinet', 'A · Noise Wash Pad', 'B · Mirror Sub Bass', 'A · Siren Sweep', 'B · Theatre Organ',
    'B · Space Choir', 'A · Wave Riser Shift', 'A · Wavelet Lead', 'A · Wave Atom Choir Shift', 'B · Focus Sweep',
    'A · String Machine', 'B · Flute Lead', 'AB · Analog Strings', 'B · Choir Pad', 'AB · Dream Pad', 'A · Wave Brass',
    'B · Ensemble Organ', 'A · Wave Riser', 'A · Solina Cellos', 'A · Warm Pad', 'AB · Wavelet Choir',
    'A · Wave Attack Lead', 'A · Poly Chorus Pad', 'A · Dub Echo Lead', 'AB · Organ Lead', 'A · Wave Pulse Lead',
    'B · Glass Ensemble', 'AB · Glass Choir', 'AB · Silk Strings', 'A · Chorus Square Lead'];

  // beta 0.7: the demo window explains the idea in plain words during the first presets of the tour (one sentence each,
  // about 4 s), then describes each preset
  const TOUR_INTRO = [
    'Welcome to OKTOWAVE. Every sound you hear is built from wavelets: tiny waves, like bricks of sound.',
    'The synth splits each note into eleven layers, from the deep body of the sound up to its brightest shimmer.',
    'Engine A takes a classic waveform and shapes these layers: a filter that works with wavelets instead of frequencies.',
    'Engine B builds the sound brick by brick: its drawbars mix the layers, like an organ made of wavelets.',
    'Wavelets also know where things happen inside the wave, so the sound can be reshaped in ways a classic filter cannot.',
    'Glassy pads, hollow organs, deep basses: each one is a preset you can play. Enjoy the tour!',
  ];

  const STYLE = {
    toccata: { scenes: TOCCATA },
    // default demo: a tour of the factory presets, about one every 4 seconds, on a change of chord
    appassionata: { tour: 4, order: TOUR_APPASSIONATA },
    moonlight: { env: KEYS, palette: ['wavelets', 'tilt', 'cutoff', 'reso', 'slope', 'position', 'sub', 'delay', 'drawbars', 'unison', 'final'] },
    rondo: { env: PLUCK, palette: ['patterns', 'drawbars', 'cutoff', 'wave', 'reso', 'sparsity', 'delay', 'final'] },
    symphony5: { env: ORGAN, palette: ['cutoff', 'slope', 'reso', 'sub', 'wavelets', 'tilt', 'unison', 'final'] },
    pathetique: { env: KEYS, palette: ['wavelets', 'cutoff', 'reso', 'position', 'sparsity', 'patterns', 'drawbars', 'final'] },
    tempest: { env: KEYS, palette: ['cutoff', 'position', 'slope', 'sub', 'wavelets', 'patterns', 'delay', 'final'] },
    op111: { env: PLUCK, palette: ['cutoff', 'reso', 'wave', 'sparsity', 'sub', 'wavelets', 'tilt', 'drawbars', 'unison', 'final'] },
    user: { env: KEYS, palette: ['cutoff', 'reso', 'wavelets', 'patterns', 'position', 'sparsity', 'sub', 'delay', 'drawbars', 'unison', 'final'] },
  };

  // Splits the song at its natural phrase gaps and assigns one template per part.
  function autoScenes(notes, duration, style) {
    let palette = style.palette.slice();
    const n = Math.max(3, Math.min(palette.length, Math.round(duration / 9)));
    if (n < palette.length) palette = palette.slice(0, n - 1).concat('final');
    const on = [];
    for (let i = 0; i < notes.length; i += 4) if (!on.length || notes[i] > on[on.length - 1] + 1e-4) on.push(notes[i]);
    const bounds = [0];
    for (let k = 1; k < palette.length; k++) {
      const target = duration * k / palette.length, win = duration / palette.length / 3;
      let best = target, gap = -1;
      for (let i = 1; i < on.length; i++) {
        if (on[i] < target - win || on[i] > target + win) continue;
        const g = on[i] - on[i - 1];
        if (g > gap) { gap = g; best = on[i]; }
      }
      bounds.push(Math.max(best, bounds[bounds.length - 1] + 1));
    }
    bounds.push(duration);
    const scenes = [];
    let eng = null;
    palette.forEach((key, k) => {
      const tpl = T[key], a = bounds[k], b = bounds[k + 1];
      const sc = tpl.make(a + 0.05, Math.max(a + 0.5, b - 0.1), style.env);
      sc.t = k === 0 ? 0 : Math.max(0, a - 0.15);
      const need = tpl.eng === '*' ? (eng || 'A') : tpl.eng;
      if (!sc.preset && need !== eng) {   // switch engine with a neutral starting sound
        sc.preset = need === 'A' ? 'A · Init' : 'B · Octave Organ';
        sc.set = { ...BASE, ...style.env, ...(need === 'A' ? A_SOUND : B_SOUND), ...sc.set };
      }
      eng = need;
      scenes.push(sc);
    });
    return scenes;
  }

  // Preset tour: about every `step` seconds the next preset of `style.order` (default: the factory order; wraps around).
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
  function tourScenes(notes, duration, step, style, origin) {
    const names = style.order || WS_SPEC.PRESETS.map(p => p.name), ev = chordOnsets(notes);
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
  function engineLabel() {   // what the sound uses (A/B MIX), not the panel shown
    const m = api.values()[P.ab_mix];
    return m <= 0 ? 'Engine A · Wavelet Subtractive' : m >= 1 ? 'Engine B · Wavelet Additive' : 'Engines A + B mixed';
  }
  function presetSummary() {
    const v = api.values(), f = (k) => C.format(PARAMS[P[k]], v[P[k]]);
    const parts = [], mix = v[P.ab_mix];
    const aTxt = `${f('a_wave')} wave through the scale filter (${f('f_type').toLowerCase()}, ${f('f_cutoff')}, reso ${f('f_res')})`;
    const bTxt = `${f('b_pattern')} atom pattern, tilt ${f('b_tilt')}`;
    parts.push(mix <= 0 ? aTxt : mix >= 1 ? bTxt : `engines mixed ${f('ab_mix')}: ${aTxt} + ${bTxt}`);
    parts.push(`${f('wavelet')} atoms`);
    if (v[P.sub_level] > 0) parts.push(`sub ${f('sub_shape').toLowerCase()} ${f('sub_oct')}`);
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
      w.style.top = Math.max(0, Math.min(720 - w.offsetHeight, drag.t + (e.clientY - drag.y) / s)) + 'px';
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
      if (sc.ramp) set(sc.param, sc.ramp[2]);
      st.scene = k;
      api.setPresetLabel(sc.preset, !!sc.ramp);   // a moving control modifies the preset
      api.ui.setHot(sc.ramp ? [P[sc.param]] : []);
      const engine = engineLabel();
      win.sec.textContent = `Preset tour · ${sc.pos + 1}/${sc.of} · ${engine}`;
      win.param.textContent = 'Now playing: ' + sc.preset;
      win.text.textContent = sc.pos < TOUR_INTRO.length ? TOUR_INTRO[sc.pos] : sc.ramp
        ? `${PARAMS[P[sc.param]].name} moves from ${C.format(PARAMS[P[sc.param]], sc.ramp[2])} to ${C.format(PARAMS[P[sc.param]], sc.ramp[3])} on the opening chords. ` + presetSummary()
        : presetSummary();
      return;
    }
    if (sc.preset) { api.applyPreset(sc.preset); api.setPresetLabel(sc.preset, true); }
    if (sc.set) for (const key in sc.set) set(key, sc.set[key]);
    st.scene = k;
    const hot = sc.param === 'drawbars' ? Array.from({ length: 11 }, (_, i) => P['b_bar' + (i + 1)]) : [P[sc.param]];
    api.ui.setHot(hot);
    const name = sc.param === 'drawbars' ? 'Drawbars 1–11 (band levels)' : PARAMS[P[sc.param]].name;
    const engine = engineLabel();
    win.sec.textContent = `Scene ${k + 1}/${st.scenes.length} · ${sc.section} · ${engine}`;
    win.param.textContent = 'Now varying: ' + name;
    win.text.textContent = sc.text;
  }

  function describeRange(sc) {
    const p = PARAMS[P[sc.param]];
    if (sc.ramp) return `${C.format(p, sc.ramp[2])} → ${C.format(p, sc.ramp[3])}`;
    if (sc.steps) return sc.steps.map(s => C.format(p, s[1])).join(' → ');
    return '';
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
      let moving = '';
      if (sc.ramp) {
        const [t0, t1, a, b] = sc.ramp, x = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
        set(sc.param, a + (b - a) * x);
        moving = `${PARAMS[P[sc.param]].name} ${C.format(PARAMS[P[sc.param]], api.values()[P[sc.param]])} · `;
      }
      win.val.textContent = moving + (next ? `next preset in ${Math.max(0, next.t - t).toFixed(1)} s: ${next.preset}` : 'last preset of this demo');
    } else if (sc && t >= 0) {
      let shown = '';
      if (sc.ramp) {
        const [t0, t1, a, b] = sc.ramp, x = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
        set(sc.param, a + (b - a) * x);
      } else if (sc.steps) {
        let v = sc.steps[0][1];
        for (const s of sc.steps) if (t >= s[0]) v = s[1];
        set(sc.param, v);
      } else if (sc.wave) {
        const ph = Math.max(0, t - sc.wave[0]) / 4;
        for (let b = 1; b <= 11; b++) set('b_bar' + b, 0.15 + 0.85 * (0.5 + 0.5 * Math.cos(2 * Math.PI * ((b - 1) / 11 - ph))));
        shown = 'wave crest at band ' + (Math.round((ph % 1) * 11) % 11 + 1);
      }
      if (!shown) shown = C.format(PARAMS[P[sc.param]], api.values()[P[sc.param]]);
      const range = sc.param === 'drawbars' ? '' : `   (${describeRange(sc)})`;
      win.val.textContent = shown + range;
    }
    const total = st.song.duration;
    win.prog.style.width = (100 * Math.min(1, Math.max(0, t / total))) + '%';
    win.time.textContent = `${mmss(Math.max(0, Math.min(total, t)))} / ${mmss(Math.round(total))}`;   // total rounded like the menu
    if (t > total + 2.5) { stop(); return; }
    st.raf = requestAnimationFrame(tick);
  }

  async function play(song, style) {
    if (st) stop();
    await api.startAudio();
    if (!win) buildWindow();
    const scenes = style.tour ? tourScenes(song.notes, song.duration, style.tour, style, song.origin || 0) : style.scenes || autoScenes(song.notes, song.duration, style);
    st = { song, scenes, saved: api.snapshot(), scene: -1, t0: api.ctxTime() + LEAD_IN, raf: 0, sync: null };
    api.post({ t: 'alloff' });
    api.post({ t: 'seq', notes: song.notes, delay: LEAD_IN });
    win.title.textContent = 'DEMO · ' + (song.composer ? song.composer + ' — ' : '') + (song.short || song.title);
    win.title.title = song.title;
    win.src.textContent = 'MIDI: ' + (song.license ? song.source.replace(/ \(mutopiaproject\.org\)/, '') + ' · ' + (song.license === 'Public Domain' ? 'public domain' : song.license) : song.source);
    win.el.style.display = 'block';
    api.ui.setDemoRunning(true);
    enterScene(0);
    st.raf = requestAnimationFrame(tick);
  }

  // Plays factory song number i (default: the Toccata).
  function start(i) {
    const song = SONGS[Math.max(0, Math.min(SONGS.length - 1, i | 0))];
    return play(song, STYLE[song.id] || STYLE.user);
  }

  // Plays a MIDI file chosen by the user (ArrayBuffer or Uint8Array).
  function startFile(bytes, fileName) {
    const m = WSReadMIDI(new Uint8Array(bytes));
    const notes = m.notes.filter(n => n.ch !== 9 && n.t < MAX_FILE_SECONDS);   // channel 10 = drums
    if (!notes.length) throw new Error('this MIDI file contains no playable notes');
    const t0 = notes[0].t, flat = [];
    for (const n of notes) flat.push(n.t - t0, Math.max(0.03, n.d), n.note, n.vel / 127);
    let duration = 0;
    for (const n of notes) duration = Math.max(duration, n.t - t0 + n.d);
    const name = String(fileName || 'MIDI file').replace(/\.(mid|midi)$/i, '');
    return play({ title: m.title || name, composer: '', source: 'your file ' + (fileName || ''), license: '', duration, notes: flat }, STYLE.user);
  }

  function stop() {
    if (!st) return;
    cancelAnimationFrame(st.raf);
    api.post({ t: 'seqstop' });
    const saved = st.saved;
    st = null;
    api.ui.setHot([]);
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
    start, startFile, stop, onSeqTime,
    running: () => !!st,
    // the preset tour of factory song i ([{ t, preset }], null for a song without tour): for the tests and the manual
    tourPlan: (i) => {
      const s = SONGS[i], style = s && STYLE[s.id];
      return style && style.tour ? tourScenes(s.notes, s.duration, style.tour, style, s.origin || 0).map(x => ({ t: x.t, preset: x.preset })) : null;
    },
    songs: () => SONGS.map(s => ({ title: s.title, short: s.short || s.title, composer: s.composer, duration: s.duration, license: s.license,
      tour: !!(STYLE[s.id] && STYLE[s.id].tour) })),
    state: () => (st ? { running: true, song: st.song.title, scene: st.scene, section: st.scenes[Math.max(0, st.scene)].section,
      param: st.scenes[Math.max(0, st.scene)].param, preset: st.scenes[Math.max(0, st.scene)].tour ? st.scenes[Math.max(0, st.scene)].preset : undefined,
      scenes: st.scenes.length, time: now() } : { running: false }),
  };
}
