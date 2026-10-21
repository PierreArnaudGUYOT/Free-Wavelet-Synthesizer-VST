// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.7). Release beta 0.2.
// Demo player: plays Beethoven's Appassionata (III) (public-domain MIDI from the Mutopia Project, web/js/demo_data.js) as a tour of the
// presets (a new preset every 8 beats, 3.6 s, at the start of the theme's phrase; before 1.0.10: about every 4 s, on a change of chord). A small window says which preset plays and what it is made of.
function WSDemo(api) {
  'use strict';
  const SONG = WS_DEMO_SONGS[0];
  const C = api.C, P = api.P, PARAMS = api.PARAMS, SPEC_SLOTS = WS_SPEC.SLOTS;
  const LEAD_IN = 0.25;   // seconds between the click and the first note

  // The preset sequence of the tour (tools/spec.js TOUR: the tour of the Wavelet Synthesizer's web app, same piece, same presets, same level; the presets are
  // WS_SPEC.DEMO_PRESETS, app.js applyPreset): written out so that a new menu order does not change the demo. The demo starts at song.origin (version 1.0.10: 17.0 s, the low F that starts the theme; its opening line and chords are cut).
  // version 1.0.6: the window presents the synth while the piece plays, one short sentence per preset of the tour (the wavelets, the idea of an oscillator made of them, how it differs from the
  // other synthesizers): WS_SPEC.DEMO_STORY ([chapter, sentence], tools/spec.js); the last one stays if the tour is longer
  const STORY = WS_SPEC.DEMO_STORY;

  // Preset tour: a new preset of the tour (WS_SPEC.TOUR, or the list given to start()) every PHRASE of the piece. Version 1.0.10: the owner's request, the change goes with the music: the theme
  // of the right hand repeats over 8 beats and starts with a low note, so the demo starts on that low F (song.origin, tools/make_demo.js) and a preset lasts 8 beats, song.phrase seconds
  // (the tempo is 134 beats a minute, fitted on the onsets): the preset k changes at k phrases, on the onset of the note that sits there (every note of the piece starts on a sixteenth of
  // that grid). Before, a change went to the chord with the most notes near every 4-second mark of the whole piece. The preset is loaded TOUR_LEAD before the note, so the new sound starts
  // with it. The last scene is at least TOUR_MIN_LAST seconds long (30 phrases for the 30 presets, the last one 6 s: the end of the piece).
  // Every preset is made playable on the piece: polyphonic, normal octave, no glide, short attack.
  const TOUR_SAFE = { v_voices: 16, v_oct: 0, v_glide: 0 };
  const TOUR_MAX_ATTACK = 0.08;
  const TOUR_MAX_DELAY_MIX = 0.1, TOUR_MAX_DELAY_FB = 0.3;   // long echoes on a fast piece sound like a canon
  const TOUR_LEAD = 0.08, TOUR_MIN_LAST = 3;
  // version 1.0.8: the change of preset is made by the audio thread, at the chord. The page sends it SEND_LEAD seconds ahead (the new sound's values and tables, with the song time of the chord:
  // worklet.js starts the dip so that it ends at the chord); the panel, the window and the label follow at TOUR_LEAD before the chord, as before. A page that was late (a busy main thread) made the
  // change late, 100 ms after the chord for a delay of 100 ms: the audio thread's clock does not wait for the page.
  const SEND_LEAD = 0.6;
  function chordOnsets(notes) {   // notes: flat [time, duration, note, velocity] * n, sorted by time
    const ev = [];
    for (let i = 0; i < notes.length; i += 4) {
      const last = ev[ev.length - 1];
      if (last && notes[i] - last.t < 0.03) last.n++; else ev.push({ t: notes[i], n: 1 });
    }
    return ev;
  }
  function tourScenes(song, names) {
    const P = song.phrase, ev = chordOnsets(song.notes), out = [];
    for (let k = 0; k * P <= song.duration - TOUR_MIN_LAST + 1e-9; k++) {
      const g = k * P, e = ev.find(x => x.t >= g - 0.03), chord = e ? e.t : g;   // chord: the song time of the note the change goes with (version 1.0.8)
      out.push({ t: k ? chord - TOUR_LEAD : 0, chord, tour: true, preset: names[k % names.length] });
    }
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
  let st = null;        // running state
  let win = null;       // window elements

  // ---------------------------------------------------------------- window
  function buildWindow() {
    const dev = document.getElementById('device');
    const w = document.createElement('div');
    w.className = 'demo-win';
    w.innerHTML =
      '<div class="dw-bar"><span class="dw-title"></span><button class="dw-stop" title="Stop the demo">■ STOP</button></div>' +
      '<div class="dw-body"><div class="dw-sec"></div><div class="dw-param"></div><div class="dw-val"></div><div class="dw-chap"></div><div class="dw-text"></div>' +
      '<div class="dw-prog"><i></i></div><div class="dw-foot"><span class="dw-time"></span><span class="dw-src"></span></div></div>';
    dev.appendChild(w);
    win = {
      el: w, title: w.querySelector('.dw-title'), sec: w.querySelector('.dw-sec'), param: w.querySelector('.dw-param'),
      val: w.querySelector('.dw-val'), chap: w.querySelector('.dw-chap'), text: w.querySelector('.dw-text'), prog: w.querySelector('.dw-prog i'),
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
      w.style.left = Math.max(0, Math.min(place().left, drag.l + (e.clientX - drag.x) / s)) + 'px';
      w.style.top = Math.max(0, Math.min(WS_SPEC.DEVICE.h - w.offsetHeight, drag.t + (e.clientY - drag.y) / s)) + 'px';
    });
    bar.addEventListener('pointerup', () => { drag = null; });
  }

  // Where the window sits (version 1.0.6, the owner's request: "more to the right"): as far right as the page allows, so that it hides as little of the panel as possible. In panel pixels (the panel is
  // scaled to the page): the content is the panel, and the preset list at its right while it is open (348 wide: the window is then as wide as the list and sits over it, off the panel); the
  // room the page leaves beyond the content is used as well.
  function place() {
    const dev = document.getElementById('device').getBoundingClientRect(), s = api.ui.scale || 1;
    const listOn = !!(api.ui.browser && api.ui.bOpen), contentW = 1100 + (listOn ? 360 : 0);
    const free = Math.max(0, (document.documentElement.clientWidth - (dev.left + contentW * s)) / s);
    const edge = contentW + free - 8, w = listOn ? Math.min(386, edge - 1104) : 386;
    return { w, left: edge - w };
  }

  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  // ---------------------------------------------------------------- control
  function set(key, v) { if (key in P) api.setParam(P[key], v); }

  // the demo's rules for a preset (modify(set, get) of app.js applyKeyed): polyphonic, normal octave, no glide, short attack, little delay, and from 1.0.4 the trim that keeps the piece
  // under the output stage (tools/demo_trim.js)
  const sceneRules = (sc) => (setk, get) => {
    for (const key in TOUR_SAFE) setk(key, TOUR_SAFE[key]);
    if (get('amp_a') > TOUR_MAX_ATTACK) setk('amp_a', TOUR_MAX_ATTACK);
    if (get('fx_dmix') > TOUR_MAX_DELAY_MIX) setk('fx_dmix', TOUR_MAX_DELAY_MIX);
    if (get('fx_dfb') > TOUR_MAX_DELAY_FB) setk('fx_dfb', TOUR_MAX_DELAY_FB);
    const trim = (WS_SPEC.DEMO_TRIM || {})[sc.preset];
    if (trim) setk('master', Math.max(PARAMS[P.master].min, get('master') - trim));
  };

  function enterScene(k) {
    const sc = st.scenes[k];
    if (sc.tour) {
      // version 1.0.6: the preset and the demo's rules (polyphonic, short attack, little delay, and from 1.0.4 the trim that keeps the piece under the output stage: tools/demo_trim.js) reach the
      // audio thread together, in one message (app.js applyKeyed): changing them one by one made a burst of noise at every change of preset
      // (1.0.8: when the message was sent ahead (sc.sent), the audio thread has made or will make the change by itself: the panel only follows)
      api.applyPreset(sc.preset, sceneRules(sc), { audio: !sc.sent });
      st.scene = k;
      // the next preset's tables are built ahead, in a Worker, a second after this one is in place
      clearTimeout(st.pre);
      const nx = st.scenes[k + 1];
      if (nx && nx.tour) st.pre = setTimeout(() => api.prebuildPreset(nx.preset, sceneRules(nx)), 1000);
      api.setPresetLabel(sc.preset, false);
      const engine = engineLabel();
      win.sec.textContent = `Preset tour · ${sc.pos + 1}/${sc.of} · ${engine}`;
      win.param.textContent = 'Now playing: ' + sc.preset;
      const line = STORY[Math.min(sc.pos, STORY.length - 1)];
      win.chap.textContent = line[0];
      win.text.textContent = line[1];
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
    const nx = st.scenes[st.scene + 1];
    if (nx && nx.tour && !nx.sent && t >= nx.chord - SEND_LEAD && t < nx.t) { nx.sent = true; api.sendPreset(nx.preset, sceneRules(nx), nx.chord); }   // (1.0.8: ahead of the chord, for the audio thread)
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
  async function start(opts) {
    if (st) stop();
    await api.startAudio();
    if (!win) buildWindow();
    const song = SONG;
    const scenes = tourScenes(song, (opts && opts.tour) || WS_SPEC.TOUR);   // (opts.tour: another list of presets, the vote build's)
    st = { song, scenes, saved: api.snapshot(), scene: -1, t0: 0, raf: 0, sync: null, pre: 0 };
    api.post({ t: 'alloff' });
    win.title.textContent = 'DEMO · ' + song.composer + ' — ' + (song.short || song.title);
    win.title.title = song.title;
    win.src.textContent = 'MIDI: ' + song.source.replace(/ \(mutopiaproject\.org\)/, '') + ' · public domain';
    win.el.style.display = 'block';
    { const p = place(); win.el.style.width = p.w + 'px'; win.el.style.left = p.left + 'px'; }   // as far to the right as the page allows
    api.ui.setDemoRunning(true);
    // version 1.0.6: the first preset is in place BEFORE the piece starts: building its tables takes 60 to 190 ms here (more on a slow machine), and the first notes, started by the audio thread
    // 0.25 s after the click, sounded with the sound that was loaded before the demo, then changed under the player's ears
    enterScene(0);
    st.t0 = api.ctxTime() + LEAD_IN;
    api.post({ t: 'seq', notes: song.notes, delay: LEAD_IN });
    st.raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (!st) return;
    cancelAnimationFrame(st.raf); clearTimeout(st.pre);
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
    tourPlan: (names) => tourScenes(SONG, names || WS_SPEC.TOUR).map(x => ({ t: x.t, chord: x.chord, preset: x.preset })),
    rules: (name) => sceneRules({ preset: name }),   // version 1.0.10: the demo's rules for a preset (polyphonic, short attack, trim...), for the vote build
    tourLead: TOUR_LEAD,
    song: () => ({ title: SONG.title, short: SONG.short || SONG.title, composer: SONG.composer, duration: SONG.duration, phrase: SONG.phrase, license: SONG.license }),
    state: () => (st ? { running: true, song: st.song.title, scene: st.scene, preset: st.scenes[Math.max(0, st.scene)].preset,
      scenes: st.scenes.length, time: now() } : { running: false }),
  };
}
