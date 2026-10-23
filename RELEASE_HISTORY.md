# Okto MultiWave Synth — Release history

Created by **Pierre Arnaud GUYOT** ("OktoPierre"). Okto MultiWave Synth is built on his Wavelet Synthesizer (beta 0.7) and on
the chord keyboard of his WaveChord work; their histories follow its own first release below.

## OktoWave web update — 2026-10-23: the preset list (web app only; the plug-in stays 1.0.16)

- **The author's new preset list**: 197 presets (11 removed); every section is ordered by his stars, the most starred first, TOP Sounds too (the sound the synth opens on stays first); **Bass is the third section**, after TOP Sounds and Pad, and holds the basses he gathered there; the sounds he rated that were in Other are back in their sections.
- **6 presets take his settings**: *A · Warm Pad*, *AB · Beam Lung Keys*, *AAB · Clang Tide Signal*, *AA · Knock Sweep LGT*, *AAB · Drift Pick LGT*, *AA · Salt Beam Strings LGT* (the last two play in the demo, which follows them).
- The sound engine does not change.

**Checked**: the quick suite with the C++/JS cross-check (300 cases, worst 4.2e-7) and the VST3 host checks (118); the web app loads without errors with its preset order and starts the demo; the 197 presets sound in the JavaScript engine (finite, under 0 dBFS); the demo's 30 scenes through the output stage (`tools/outstage_check.js`): no distortion, highest sample 0.84 (the two adjusted presets of the demo: peaks 0.51 and 0.25).

## Okto MultiWave Synth 1.0.16 — 2026-10-23 (shown as OktoWave 1.0)

- **A more professional reverb** (web app and plug-in). The Classic reverb (the Freeverb of every earlier version) keeps its algorithm and its character, with four improvements around it: a **stereo input** (60 %: the combs of each side hear more of their own side, so wide sounds keep part of their image in the reverb, without leaning to one side), a **20 ms pre-delay** (the direct sound stays clear, the reverb sits just behind it), **more damping** (0.40 instead of the fixed 0.25: the tail loses its highs sooner, less metallic) and a **150 Hz low cut** on its input (no low end in the reverb: the basses stay clean). Every sound with reverb plays it, the demo too.
- **The same reverb level**: measured over the whole demo (its 30 scenes through the real audio thread, BS.1770 loudness of the reverb alone, the piece without reverb subtracted): -22.35 LUFS against -22.22 for 1.0.15; the piece itself -0.1 LU. Per octave band the tail lasts as before in the lows and mids (1.24 s against 1.26 s at 500 Hz, SIZE 0.5) and less in the highs (0.47 s against 0.70 s at 8 kHz).
- **PUNCH, a new knob at the right of the effects** (web app and plug-in; EFFECTS is one knob wider, PLAY a little narrower, all its controls kept): every note starts with more impact, most on the low notes, so that the basses get their punch back; it never lowers the level (a transient shaper per note, not a compressor). **0** is off (the sound of before, bit for bit), **50 %** is the setting of every preset (a light punch: +4 dB at the start of the note, back to normal in 40 ms), **100 %** a strong punch (+8 dB in 50 ms). The author chose it by ear on the demo recorded three ways (without, light, strong). Over the whole demo the light punch makes the piece 0.4 LU louder, and the output limiter acts on 1 window of 10 ms in 11,317.
- The output stage and the latency do not change. Your presets file, stars, saved projects and user bank are kept; a preset or a project saved with an earlier version plays the new reverb and PUNCH at 50 %.

**Details**
- *PUNCH* (`fx_punch`, 0 to 1, default 0.5, a sound's own setting, appended after the reverb's settings): each voice's amplitude envelope is multiplied by (1 + g·p), where p is 1 at every start of the note (not on a legato change) and falls exponentially in 30 + 20 × PUNCH ms, and g = 10^(8 × PUNCH / 20) − 1, the whole of it up to C3, a quarter of it from C6 up (in between in proportion to the note). The same operations in the C++ engine (plug-in and WebAssembly) and the JavaScript one; at 0 the envelope loop of before is taken. Cost: two multiplications per sample and per voice.
- *Five hidden performance settings* (never in a preset, not shown to the host), appended after Chord Compensation: **Reverb Stereo Input** (`fx_rstereo`, 0.6), **Reverb Pre-delay** (`fx_rpre`, 0 to 0.1 s, 0.02), **Reverb Damping** (`fx_rdamp`, 0 to 0.6, 0.4; at other sample rates the same time constant as at 48 kHz), **Reverb Low Cut** (`fx_rhp`, a one-pole high-pass, 20 Hz = off to 300 Hz, 150) and **Reverb Width** (`fx_rwidth`, the Freeverb's own wet1 / wet2 mix, 1 = each comb bank to its own side, as before). With STEREO 0, PRE 0, LOW CUT off and DAMP 0.25 the code takes the exact path of 1.0.15 (a case of the C++/JS cross-check keeps it). The same operations in the C++ engine (plug-in and WebAssembly) and the JavaScript one. Cost: a few operations per sample.

**Checked**: the full validation (`tests/full.js`, run in two parts): build, the quick suite with the C++/JS cross-check (311 cases, worst 4.2e-7, including the reverb of 1.0.15 and PUNCH at 0, 25, 75 and 100 %) and the VST3 host checks (118), the TOP Sounds against beta 0.7 (with the reverb of beta 0.7 and PUNCH off: identical, 2.9e-9), the engine tests (idle skip, filter, SuperModulation, live display, preset change, demo sync), the presets file, the parallel table build, the VST2 entry point (51), the loud-chord crackle on every preset (three chords, PUNCH 50 %: none above 1 %), the web smoke test, the manual (PUNCH, the credits, one A4 sheet per page, a phone's width), the full web run on every preset (114 checks), the WebAssembly parity (311 cases). The demo test passed all its checks but the known one (the demo window's next preset at the very first instant, which fails the same way with 1.0.14 and 1.0.15 on the test computer, whose headless browser is Chrome for Testing, not Edge). Not run: the plug-in window in a host (it opens a visible window). The demo changes with this version on purpose (the reverb, PUNCH 50 %).

## OktoWave web update — 2026-10-23 (web app only; the plug-in stays 1.0.15)

- **The web app runs the plug-in's own engine.** The C++ sound engine (`vst/src/dsp.h`), compiled to WebAssembly (`wasm/build.sh`, wasi-sdk), replaces the JavaScript engine (`web/js/core.js`) in the browser's audio thread. The author tried it on his computer ("ça marche bien") and asked for it on the official page.
- **Same sound**: the two engines agree within 4.2e-7 of full scale on the 299 cases of the cross-check (`wasm/parity.js`: every preset, the LFOs, phase, morph, chords, filter, unison, loud chords, the limiter's hard case), the scalar and the SIMD builds alike.
- **About twice as light on the processor** (16-voice dense chord, per render quantum): 2.4x on the 30 presets of the demo, 1.8x on the 20 heaviest presets, the slowest quanta 2 to 4 times faster. The whole demo in real time, Windows' power-saving (Efficiency) mode, headless browser, two runs: 2362 and 926 audio dropouts with the JavaScript engine, 12 and 0 with WebAssembly (none for either in normal mode). Three very heavy presets played as 16-voice chords stay a little above the real-time budget even so.
- **Safe fallback**: a browser that cannot compile the module (an old Safari, a memory refusal) plays with the JavaScript engine by itself; `#engine=js` in the address forces it. The status bar shows "· WASM" while the WebAssembly engine plays. The module (188 KB, base64 in `web/js/engine_wasm_data.js`, loaded on demand) works from `file://` too.
- **Credits**: Jérémie Palmigiani (Soul Machine), the author's spelling (1.0.15 had "Paligrini").
- The plug-in, the presets, the reverb and the demo do not change. Two additions to `vst/src/dsp.h` leave the native build identical: a no-threads guard for WebAssembly and a WebAssembly SIMD branch of the `v2d` layer.

**Checked**: the quick suite with the C++/JS cross-check, the web smoke test, the manual, the demo test and the full web run on every preset, with the WebAssembly engine as the default (see the release notes of the commit); the native build and the VST3 host checks (unchanged engine).

## Okto MultiWave Synth 1.0.15 — 2026-10-23 (shown as OktoWave 1.0)

- **A cleaner output stage** (web app and plug-in): a **look-ahead limiter** replaces the peak guard and the tanh soft limiter of 1.0.14. The old stage bent every peak above -3 dBFS (the tanh starts at 0.7), which gave a slight buzz on loud, dense chords. The new one delays the sound by 1.5 ms, sees each peak coming and turns the volume down smoothly just before it: no sample goes above -1 dBFS (0.89) and nothing is bent. Below -3 dBFS, where the old stage did nothing (every scene of the demo), the sound is exactly the one of 1.0.14, only 1.5 ms later.
- **A fixed latency of 1.5 ms** (plug-in), reported to the DAW, which compensates it (Ableton Live does it by itself): the synth stays in time with the other tracks.
- **The author's own sounds**: the 9 factory presets he adjusted with SAVE PRESET and that the demo does not play take his values: *A · Shimmering Strings* (LFO 1 rate 0.71 Hz), *A · Warm Pad* (attack 5 ms), *AA · Chalk Edge Call*, *AB · Resonance Storm* (delay feedback and reverb off), *AAB · Static & Fibre* (percussive, no delay or reverb), *AA · Tide Horns* (percussive, three octaves down), *AAB · Stair & Tap* (an octave lower), *AA · Sweep of Pixel LGT* (attack 75 ms), *AB · Step Spiral LGT* (percussive). The 5 he adjusted that the demo plays keep their sound (his rule: the demo does not change): *AB · Step Sub*, *AB · Orbit Cloud*, *AA · Knock Sweep LGT*, *AB · Rust Aurora LGT*, *AA · Salt Beam Strings LGT*.
- **208 factory presets** (257 before): the 54 presets he deleted in his browser leave the factory list, except the 5 the demo plays (*A · Wavelet Lead*, *AAB · Sweep Call*, *AB · Swing of Odd*, *AA · Wood Rise Bows*, *AB · Open Mallets*): 49 fewer, 19 LGT versions and 14 HIGH_CPU originals now. The order of the lists does not change (his stars were not used to sort them again). A Live Set or a presets file that names a removed preset keeps its sound (the plug-in stores the values).
- **The credits spell the name right**: Jérémie Palmigiani (Soul Machine) (it was misspelt in the manual, the README and these notes).
- Your presets file, stars, saved projects and user bank are kept.

**Details**
- *The limiter* (`web/js/core.js` and `vst/src/dsp.h`, the same operations): the gain each sample needs to stay under 0.89, its minimum over the look-ahead plus 15 ms (no ripple at the pitch of a bass), a release of 0.15 s, and its average over the look-ahead, so that the gain reaches its target exactly when the peak leaves the delay. The delay is round(0.0015 x sample rate) samples (66 at 44.1 kHz, 72 at 48 kHz, 144 at 96 kHz). The plug-in reports it to the host: VST3 `getLatencySamples`, with a notice of the change (`kLatencyChanged`) when a new sample rate changes it; VST2 `initialDelay`.
- *Measured*: the whole web demo (its 30 scenes rendered offline, `tools/outstage_check.js`): the output stage acts in no scene (peaks under 0.70), 0.00 % distortion; a loud triad on every preset: 0.00 %; 8-note chords at velocity 1, presets above 2 % of distortion, Classic against Limiter: 12 against 3 with CHORD COMP off, 14 against 5 with the master +6 dB. The real-time demo in a headless browser (`tools/dropouts.js`, the browser's own count of audio dropouts, `AudioContext.playbackStats`): 0 dropouts with 1.0.15, 7 with 1.0.14 on the same machine (scene 7): neither overloads it, and the limiter costs almost nothing.
- *Two hidden performance settings* (never in a preset, not shown to VST2 hosts), appended after the MIDI triggers: **Output Stage** (`out_mode`: Classic, the stage of 1.0.14, or Limiter, the default) and **Chord Compensation** (`poly_comp`: the voice-count compensation of beta 0.3.2, On by default as before). They served the author's A/B listening test (a web test copy with an A/B panel). Classic goes through the same 1.5 ms delay, so the latency never changes.
- *An independent review of the limiter* found a real defect in the first test copy, fixed before the release: on a long falling peak above the ceiling (a loud low square through the DC blocker) the queue that keeps the running minimum could overflow by one entry; the plug-in then wrote past the end of its buffer (a possible host crash) and the web app clipped a few peaks. Now the oldest gain leaves the window before the new one comes in, and a case of the C++/JS cross-check plays that sound (`tools/dsp_cases.js`). Also from the review: the Classic guard follows the signal in both modes (no stale gain when switching); a performance setting changed while the demo has a preset change queued is no longer undone at the chord (`web/js/worklet.js`); the VST2 initial delay is set at `effSetSampleRate`, and the plug-in is marked active before `audioMasterIOChanged`; the tests know the latency (`tests/regress_v07.js` compares OUTPUT Classic with the 1.5 ms offset, the onset check of `tests/vst3host`, `vst/devtest/vst2_smoke.cpp`); `tools/crackle.js` has `--out classic|limiter`; `tools/make_test_copy.js` refuses unsafe folders.
- *New developer tools*: `tools/outstage_check.js` (the output stage on the demo's scenes, or a loud chord on every preset: distortion, gain, peaks, Classic against Limiter), `tools/dropouts.js` (the audio dropouts of the real-time demo, optionally in Windows' Efficiency mode: the measure of the 1.0.14 investigation, now committed), `tools/make_test_copy.js` + `tools/test_copy/ab_output.js` (web test copies, with an A/B panel of the output stage), `tools/owner_import.js` (reads the author's presets file: the presets he adjusted and the ones he deleted).

**Checked**: the full validation (`tests/full.js`, 18 of its 19 steps passed): build, the quick suite with the C++/JS cross-check (299 cases, worst 4.2e-7, including the limiter's overflow case and OUTPUT Classic) and the VST3 host checks (118, the latency reported), the TOP Sounds against beta 0.7 (OUTPUT Classic, 1.5 ms offset), the engine tests (idle skip, filter, SuperModulation, live display, preset change, demo sync), the web smoke test, the manual (the new credits), the full web run on every preset (114 checks), the presets file, the parallel table build, the VST2 entry point, the loud-chord crackle on every preset (three chords, OUTPUT Limiter: none above 1 %). The demo test passed 72 of its 73 checks: the one left (the demo window's next preset at the very first instant) fails the same way with 1.0.14 on the test computer, whose headless browser is Chrome for Testing instead of Edge, so it is that browser, not this version. Not run: the plug-in window in a host (it opens a visible window). Also: the demo is the same as 1.0.14 (`tools/demo_compare.js`: the tour, every preset's values, the trims and the song identical; the audio of the 30 scenes within -71 dB of the peak, the idle rule's 1.5 ms longer wait shifting the chorus at the start of a scene); the real-time demo dropouts measured in a headless browser (0 with 1.0.15).

## Okto MultiWave Synth 1.0.14 — 2026-10-22 (shown as OktoWave 1.0)

- **LGT presets, lighter on the computer** (web app and plug-in). On the author's laptop the web demo crackled on some presets and AAB · Rust Aurora went silent: measured in Edge with the browser's own count of audio dropouts, the audio thread had no time left on the heaviest sounds, worst in Windows' *Efficiency mode*. Every preset with more than two stars was measured on the densest phrase of the demo piece: 17 of the 27 asked too much. Each now has an **LGT** version (the modulation that moves the wavelet tables removed, one unison voice less, half the release, and for a few the wavelet morph or the position window off; Rust Aurora LGT also has A2 off) that takes its place: its section, its stars, its place in TOP Sounds. The full version stays, unchanged, in **Other** as **… HIGH_CPU**. Three presets of the demo without stars got an LGT version too (right after them). 257 presets in all (20 LGT). The sound the synthesizer opens on is **AA · Flint Ripple Haze LGT**.
- **The sections hold the favourites** (web app and plug-in): every preset without stars is in **Other**; Pad, SuperModulation, Bass, Lead, Strings and FX list the author's favourites and their LGT versions. The sections left empty (Keyboard, Organ, Brass & Wind, Bells & Mallets, Drums & Perc) are not listed; TOP Sounds does not change.
- **▲ UP / ▼ DOWN** (plug-in, preset browser): the buttons above the list that move the sound you play up or down in it (your order is kept in your presets file) are labelled and larger; they were a bare ▲ ▼.
- **The demo plays the LGT versions** of its heaviest presets: in the measure the dropouts of the whole piece went from 358 to a handful (from 1277 to under 100 in Efficiency mode, depending on what else the computer does).
- **A preset of the demo changes only at its place in the piece** (web app): while the page is hidden the demo does not follow (the sound in place goes on) and, back on the page, the next change comes with its phrase instead of at once. (A timer that kept the demo going in a hidden page, online for a few hours, made changes at wrong places: removed.)
- **Welcome window** (web app): **Run the demo** is the middle box, filled with the accent colour and a little larger, with *and play the Synth* under it; *Play the synth* has no yellow outline any more.
- **Demo**: *A · Spiccato Strings* plays its phrase in ARAB, maqam Rast on G; *AB · Orbit Cloud* with half its modulation; the levels of the tour measured again for its order.
- **PLAY card** (web app and plug-in): the VELOCITY knob is left of its menu, which has the caption TARGET above it and is wide enough for VOLUME.
- No change of the sound engine: your presets file, stars, saved projects and user bank are kept (a saved sound that used a favourite now made LGT plays the same values: only the factory list changed).

**Checked**: the full validation: build, the quick suite with the C++/JS cross-check (323 cases) and the *hang* section, the TOP Sounds against beta 0.7, the engine tests (idle skip, filter, SuperModulation, live display, preset change, demo sync), the parallel table build, the loud-chord crackle on every preset (three chords: none above 1 %), the presets file, the VST2 entry point, the plug-in window in a host (the owner allowed it: the tests run on his own computer), the web smoke test, the manual, the demo test (73 checks, with the page hidden while a chord goes by) and the full web run on every preset; and the demo's audio dropouts measured in Edge (normal and Efficiency mode).

## Okto MultiWave Synth 1.0.13 — 2026-10-22 (shown as OktoWave 1.0)

- **PLAY DEMO in the plug-in**: a button left of SAVE PRESET plays the demo of the web app (Beethoven's *Appassionata* as a tour of 30 presets); the preset box says which preset of the tour plays, a second click (STOP DEMO) ends it. Your own sound and the host's parameters are left as they were.
- **VELOCITY in the PLAY card** (web app and plug-in): the velocity of your MIDI keyboard now shapes the sound clearly. A knob sets how much (default 50 %: a note played at half velocity is about 8 dB softer), a menu where it goes: the volume (default), the cutoff of the FILTER card, or both. It is a playing setting, like the tuning: it stays when you change preset. At 0 % the sound is exactly the one of 1.0.12.
- **The demo starts with the best sounds**: the author rated the 30 presets while the demo played, and in its first half the ones he rated under 5 changed places with the best of the second half (web app and plug-in).
- **The titles of the effects** (SATURATION, CHORUS, PING-PONG DELAY, REVERB) are written in the accent colour and bigger: they were grey and hard to read.
- **The oscillator tabs are named OSC1, OSC2 and OSC3** (they were OSC1 A1, OSC2 A2, OSC3 B1), with SUBTRACTIVE / ADDITIVE written 20 % bigger under the name (web app and plug-in).
- Presets, stars, saved projects and the user bank are kept.

**Checked**: build, the quick suite with the C++/JS cross-check (323 cases) and the *hang* section, the plug-in window in a host with the demo (it plays, goes on through a change of preset, touches no parameter of the host, stops), the VST2 entry point, the TOP Sounds against beta 0.7, the presets file, the web smoke test, the manual and the demo test.

## Okto MultiWave Synth 1.0.12 — 2026-10-22 (shown as OktoWave 1.0)

- **The sound stops when the host stops** (Windows and Mac plug-in). In a DAW such as Ableton Live a sound could stay on after STOP: a sustain pedal still down in the MIDI sequence held the released notes, notes of a stopped sequence got no note off, a note released at the moment the pedal goes down was held. The plug-in now releases every note and lifts the pedal when the host stops, understands the MIDI messages *all notes off*, *all sound off* and *reset all controllers*, and puts the pedal at its exact place among the notes (VST3 and VST2).
- No change of the sound engine: presets, stars, saved projects and the user bank are kept.

**Checked** (simple tests): build, the quick suite with the C++/JS cross-check (323 cases) and its new *hang* section (77 checks: the 1.0.11 build fails 6 of them), the VST2 entry point with the transport, the pedal and the panic messages, the TOP Sounds against beta 0.7, the plug-in window in a host, the presets file, the web smoke test, the manual and the demo test.

## Okto MultiWave Synth 1.0.11 — 2026-10-22 (shown as OktoWave 1.0)

- **The synthesizer now says "1.0"**: OktoWave 1.0 is the first stable release (the number inside the files stays 1.0.11).
- **Web app**: a fractal pattern fills the dark margins of the page when the tuning is not oriental. **Web app and plug-in**: the PLAY card is a card like the others when the tuning is ARAB or TURK (no oriental background).
- **Demo**: the phrase of *AA · Hollow Bass* is played in the oriental tuning ARAB, maqam Saba, and the next preset brings WEST back.
- **TOP Sounds** (web app and plug-in): AA · Sweep of Pixel is the 2nd, A · Shimmering Strings the 3rd, AB · Kalimba Lung Machine the 5th and A · Noise Wash Pad the 6th; **A · Shimmering Strings** has its LFO 1 rate at 6.5 Hz.
- No change of the sound engine.

**Checked** (simple tests): build, the quick suite with the C++/JS cross-check (323 cases), the TOP Sounds against beta 0.7, the plug-in window in a host, the VST2 entry point, the presets file, the web smoke test, the manual, the demo test, the preset change and demo sync tests.

## Okto MultiWave Synth 1.0.10 — 2026-10-21 (the demo in phrases of 8 beats, the tour chosen by vote)

- **The demo changes preset with the music**: it starts on the low F that begins the theme of the right hand and a new preset comes every 8 beats (3.58 s), at the start of each phrase (30 phrases for the 30 presets), instead of on a chord near every 4 s. The levels of the presets were measured again on their own phrase.
- **The tour of the demo is the owner's choice**: he rated each preset of the tour with the vote test version, replaced the poor ones by presets of the factory list he picked, and the new demo plays his list (30 presets, A · Wavelet Lead first). The levels of the presets were measured again on their own phrase.
- **A test version to sort the presets**: the web app with a vote on the demo (rate each preset 1 to 10 stars at the end of its phrase; 10 can be moved to the start, under 5 five other presets are offered; the whole demo is played again to accept; the report goes to the feedback form). Built by `tools/make_vote_build.js`, published in the test repository only.
- The plug-in is the 1.0.9 one with its version number (its version resource now says 1.0.10 in its numbers too); no sound, no preset, no layout changed.

**Checked** (a short validation: the sound engine did not change)
- Build, the quick suite with the C++/JS cross-check (323 cases), the plug-in window in a host, the VST2 entry point, the preset change and demo sync tests (all 29 changes of the new tour on the real audio code: made 33 ms before the note, up when it starts, the longest non-silent quantum around a change 1.7 ms), the web smoke test, the manual's pages, the demo test (30 phrases, 8 beats each), the vote test.

## Okto MultiWave Synth 1.0.9 — 2026-10-21 (a way to send feedback, a clearer oriental look)

**In short**
- **A "Send feedback" button in the web app.** In the header, between **DOWNLOAD VST** and **USER MANUAL**, **SEND FEEDBACK** opens a short form (Google Forms: two optional questions, one for your feedback, one for a bug with your OS and setup) in a new tab; no Google account is needed. The welcome window has the same door: a fifth box, **Send your feedback**, under "Learn more about the sound engine". The web page itself sends nothing: the buttons are plain links, and no referrer is sent to Google.
- **A clearer oriental look (TUNING ARAB / TURK).** On the PLAY card the pattern stays, but the **TUNING switch, the MAQAM menu, the TONIC step and their captions now sit on an opaque dark plate**: their text was hard to read over the tiles (web app and plug-in). **The synthesizer takes the colours of the pattern**: the panel and the preset browser are bronze with ARAB and carmine with TURK (WEST keeps its violet and orange), in the web app and in the plug-in. **In the web app the pattern also fills the dark margins of the page** around the panel, with the status bar in the colour of its ground.
- **The credits are back in the manual**: its contents page has its "Credits and thanks" again (Jérémie Palmigiani / Soul Machine, Flo / Go Tiger, Arnaud Grignard; the demo music from the Mutopia Project; PyWavelets; the Steinberg headers), which the new manuals had dropped.
- No sound, no preset and no layout changed: the sound engine is the 1.0.8 one (the plug-in's editor draws the panel in new colours in ARAB and TURK).

**Checked** (a short validation: the sound engine did not change)
- Build, the quick suite with the C++/JS cross-check (323 cases), the plug-in window in a host (with new checks: the plates and the panel colours read from the pixels of the window), the VST2 entry point, the web smoke test (plates, panel colours, the pattern in the margins), the manual's pages (with the credits), the welcome window and the panel of the web test (65 checks), the demo test.

## Okto MultiWave Synth 1.0.8 — 2026-10-21 (the demo changes preset exactly on the chord)

**In short**
- **In the demo, the preset now changes WITH the chord of the music, every time.** Before, the page made the change when its own clock reached the scene's time, so the new sound arrived anywhere from 44 ms before the chord to 106 ms after it depending on how busy the page was (measured on the real audio code with a model of the page: a page 100 ms late put the change 27 ms after the chord and muffled the chord's attack). Now the page sends the next preset 0.6 s ahead with the time of its chord and **the audio thread makes the change by itself**: about 33 ms before the chord, the output comes up again as the chord starts (the dip is 37 ms: 2 down, 4 silent, 8 up). The panel, the label and the demo window still follow at the chord. Web app only (`web/js/demo.js`, `app.js`, `worklet.js`); the plug-in is the 1.0.7 one with its version number.
- **No more crackle than before, and not more CPU at the chord**: checked on the whole tour (29 changes) with the real worklet, the CPU of the audio thread within 60 ms of each chord: the longest quantum that is not silent is 1.8 ms at the median and 4.3 ms at worst with the change at the chord, against 2.1 ms and 5.5 ms for the page at its best (the 1.0.7 way) and 2.1 / 5.9 for a late page; the held-chord click of the change is the same as in 1.0.6 (median 0.5 of the old per-parameter way, worst 1.1). The change is made 12 quanta before the chord on purpose: the new tables are read for the first time (cold) in the silence, and the crossfade is over when the chord's notes start.
- **New tools**: `tools/demo_sim.js` (the demo's changes against the chords on the real worklet: offsets, the chord's level, the click, the CPU per quantum, several models of the page side by side), `tests/demo_sync.js` (a step of the full suite), checks in `tests/preset_change.js` and `tests/web/test_demo.js` (`WS_TEST.changes()`).

**Checked**
- `tests/preset_change.js` (the scheduled change: made at the right quantum, the dip ends at the chord, the cancellations), `tests/demo_sync.js`, the demo in Edge (57 checks in the smoke run, the 6 first changes made 32-35 ms before their chords by the audio thread). The full validation is in the release notes.

## Okto MultiWave Synth 1.0.7 — 2026-10-21 (a manual of seven pages, a door to it in the welcome window, 10 % less CPU)

**In short**
- **The manual explains the idea.** Eight short pages, each about one printed A4 sheet, in the dark look, with 17 figures computed from the engine itself: a contents page (start in a minute, the panel map, playing, install), **one page on the wavelet decomposition and the idea of an oscillator made of wavelets**, **three on subtractive synthesis with wavelets** (the oscillator A1 / A2: source waves, atoms, sparsity, morph; the scale filter and the position window; making it move, the voice filter, effects, three recipes) and **three on additive synthesis with wavelets** (B1: the 11 drawbars as bands, the six patterns, the band envelopes; atoms, scope and scalogram; playing it with the others, chords, quarter tones, three recipes). The menu and the previous / next buttons come from one list (`web/manual/manual.js`); `tools/manual_figs.js` writes the figures; `tests/web/test_manual.js` loads every page.
- **A door to it in the welcome window of the web app**: a fourth box, "Learn more about the sound engine - an innovative engine built on the wavelet transform", opens the introduction to wavelets (the manual viewer; no sound starts; Esc closes it and the welcome window is still there; the footer link and the MANUAL button open the contents page). The welcome text now says 237 presets (it said over a thousand).
- **Less CPU, the same sound, bit for bit** (the review of 1.0.6 in `GIT\Exchange Claude\CPU Load analysis`; the table, the measures and the commands are in `Revue_CPU_1.0.7.md`): the table sets of an oscillator are rendered together (-8.6 % on x86, -13 % on the heaviest third); the web engine takes the memoisations of the C++ engine (**-16.6 %**); **Apple silicon gets NEON kernels (about -19 %)**; the reverb runs two chains at a time; the builder threads of the plug-in no longer wake every 3 ms (16 instances: 1.84 % of a core -> 0.05 %) and a preset's tables are built on up to 4 threads (**3 times sooner**); a knob dragged no longer repaints the preset browser or the keyboard; smaller worklet message, one display build per change.
- No sound, no preset, no layout changed: your presets file, stars and user bank are kept.

**Checked**
- Every C++ change: 570 renders of `cpu_bench` and the 323 cases of `dsp_render` identical to those of 1.0.6 (0 samples differ), the C++ engine still within 1.79e-7 of the web engine; the web engine: 711 of 711 renders identical (all 237 presets, chords of 3, 6 and 8 notes); the parallel table build: 237 presets, 3 780 sets, the same bytes as one thread; NEON: the 323 cases rendered with and without it on GitHub's Apple-silicon Macs, the same bytes.
- The full validation (`node tests/full.js --parallel`), the macOS workflow (host test 53 checks on Apple silicon and Intel). Results are in the release notes.
- Not done from the review, and why: the web scalogram and glow (measured: 0.1-0.2 ms per redraw), preset loads through the Worker (the sound would start later), shared table cache, pruned inverse FFT, AVX2 (`Revue_CPU_1.0.7.md`).

## Okto MultiWave Synth 1.0.6 — 2026-10-21 (the Crépuscule look, a one-page manual, a demo that presents the synth, no more buzz, the Mac plug-in)

**In short**
- **A new look: Crépuscule** (the owner's choice among 50 mock-ups of the Aurora family). The panel is a warm diagonal gradient, violet to amber, under three soft colour blobs; the cards are frosted glass (translucent white, a white 20 % edge, a lit top edge); the controls are dark translucent insets; the text is pale blue-white; the accents are **gold `#ffd166` for the subtractive oscillators A1 A2 and cyan `#7ae7ff` for the additive B1**. The folder tab of the oscillator shown and its plate are **one flat outline** (the accent, solid, 2.5 px, no glow, a 10 % tint inside): the "trail of light" gradient of 1.0.5 is gone. The preset browser is its own glass panel in the same gradient; the menus, the demo window, the welcome window, the status bar and the tooltips follow. Web app: `css/synth.css` (the whole look as variables and rules), `js/ui.js` (the accents, the flat outline). The ARAB and TURK palettes keep their own colours.
- **The plug-in has the same look, Windows and Mac.** `vst/src/editor.cpp` (the one editor of both systems) draws the panel's gradient and blobs into an opaque image once per size (`makeBackdrop`, drawn with `Canvas::pixels`), the glass cards as translucent fills, the knobs as glass marbles; no platform code changed, so the Mac editor looks the same. The status line of the preset browser, drawn over the rows of the list since the panel was made smaller, now sits under the buttons.
- **The Mac plug-in is released with the Windows one**: `OktoMultiWaveSynth-1.0.6-mac.zip` (VST3, Apple silicon and Intel, built and tested on GitHub's Macs by `.github/workflows/mac.yml`: the sound is compared with the web engine on both architectures and a host test loads the plug-in; see `INSTALL-mac.txt` in the zip for the first start).
- **The manual is one page**, written by hand (`web/manual/manual.html`, about 25 KB, in the dark look, with one picture of the panel): start in a minute, the idea of wavelets, the panel card by card, playing (CHORD MODE, the oriental tunings, the demo), presets, install on Windows and Mac, help. The generator (`tools/manual/`, 1500 lines), the two manuals of 600 KB and their 26 pictures are gone; `tools/manual_shot.js` (30 lines) takes the one picture, and `tests/quick.js` checks that the manual names every card of the panel and that its picture is there, so a renamed card cannot be forgotten.
- **The demo window presents the synthesizer.** The old text (a welcome sentence, then the summary of each preset) is replaced by a presentation in 30 short, simple sentences, one per preset of the tour (about 13 words at the most, large type, a chapter in small capitals above): what a wavelet is, the idea of an oscillator made of wavelets, how it differs from subtractive and additive synthesis (a sine has no place in time, a wavelet does: the position window, the scale filter, sparsity, wavelet morph), then how to play. The text is `DEMO_STORY` in `tools/spec.js`; the window shows `Now playing`, the next preset, the chapter and the sentence.
- **No more buzz when the demo changes preset** (the owner's report: Flint Ripple Haze, Kalimba Lung Machine, Mirror Sub Bass, Drift Pick, Pearl Wash, Morph of Brass, Rust Aurora, Opal Rise Chords). Cause found by measuring the real audio worklet on a held chord: the engine takes a new value at once (filter cutoff, drive, scale filter, effects, unison count ...) under notes that sound, which is a click in the sound at every change (second difference 0.4 to 0.85 in the loudest cases), and the old way of loading a preset (one message per parameter, then the tables) made it worse. Now a preset change is ONE message (`bulk`: all the parameters and the tables), the output dips for 35 ms around it (down in 5 ms, the change at the bottom, back in 21 ms), the continuous parameters travel to their new values in 64 ms, the choices and the tables change at the bottom of the dip. The click falls ten times (0.4-0.85 to 0.01-0.07). With nothing sounding (a tail only) the change is made at once, with no dip. Web app only (`web/js/worklet.js`, `app.js`): the engine is the plug-in's, untouched (the plug-in loads a preset another way: the host sets its parameters between two blocks).
- **The demo's first preset is in place before the first note.** Building its tables takes 60 to 190 ms on a fast machine; the audio thread started the first notes 0.25 s after the click, so on a slower machine they sounded with the sound that was loaded before the demo, then changed under the player's ears (the buzz of 0:00). The demo now loads the first preset, then starts the piece. The tables of the next preset are built ahead, in a Worker of its own, a second after each change: at the change itself the main thread only sends them.
- **The demo opens on A · Wavelet Lead** (the owner's request), then **AA · Deep Ripple** (the owner's request, the same day, in the place of AA · Flint Ripple Haze, which is out of the demo altogether), then Kalimba Lung Machine. The seven other sounds of the old tour are spread over the rest, one new sound (AA · Analog Cloud) comes in at the end, and the level trims are measured again for the window of the piece each sound now plays (`tools/demo_trim.js`, 13 sounds).
- **The demo window opens as far to the right as the page allows** (the owner's request): over the preset list when it is open (the window is then as wide as the list, 348 px, and no longer hides any card of the panel), else in the room the page leaves right of the panel, else at the panel's right edge. It can still be dragged. The panel is above the list in the stacking order for that (`#device { z-index: 2 }`).
- **Nothing overlaps on the panel** (the owner's report: the AMP ENVELOPE picture overlapped the knobs; his rule "nothing overlaps, for every future implementation"). The envelope pictures of the FILTER, AMP and MOD cards go up 6 px and their knobs down 4 px; the wave selector of the wavelet card goes up 6 px and the three knobs of its right-hand column are 62 px apart; the type selector / window picture of the SCALE FILTER and POSITION cards go up 4 px and their knobs down 3; the TUNE card's OWN ENVELOPE toggle and picture go up 2 px. Two checks keep the rule: `tests/quick.js` (`layout`: the spec's numbers, web app and plug-in, a knob counts as its ring) and `tests/web/smoke.js` with `tests/web/overlap.js` (the page: rings, label and title texts, every oscillator, LFO 2 and 3, ARAB / TURK, CHORD MODE). They found five more overlaps of 0.5 to 2.5 px, now fixed. The plug-in has the same layout (it is generated from the same spec).
- **AA · Morph of Brass "crackles"** (the owner's bug report): looked for in the sound and not found. Played on 28 notes at two velocities, on a fast trill, in chords at four pitches and on its scene of the demo, it has no impulsive event, no NaN, and the output stage does not touch it (peak 0.5 to 0.65, the knee is at 0.7). What is true: it is the heaviest sound of the demo with Rust Aurora (the real worklet in Edge renders it at 0.33 and 0.37 times real time on the development machine, 16 voices, a long release), so a slow or busy machine can run out of time and crackle; the click at its change of preset, now gone, was heard with it. If it still crackles, the cause is the machine's load, not the sound. **Confirmed by the owner the same day: the sound froze his browser, so AA · Morph of Brass is out of the demo** and **A · Wave Brass plays at its place** (a brass too, 0.06 of real time instead of 0.31; the other sounds of the tour do not move; its level trim is measured again). AA · Rust Aurora (0.37) is as heavy as Morph of Brass was: if the demo stalls there, it is the next one to swap.

**Checked**
- The full validation (`node tests/full.js --parallel`) on the final sources. Plug-in and engine lane, 14 steps, all pass: the quick suite (the manual names every card of the panel, nothing overlaps, the VST3 checks), the C++ engine against the JavaScript reference (323 cases, worst difference 1.8e-7), the 18 TOP Sounds of beta 0.7, the engine tests (with the preset change), the presets file, the VST2 entry point, the plug-in window in a host (the tabs, CHORD MODE, the fit, the browser; the gold accent), the crackle of three chords (nothing above 2 %).
- Web lane: the smoke test passes, the full run on every preset (`test_web`, 104 checks) passes, the demo test (`test_demo`, 67 checks: the 30 sentences follow the 30 presets, the demo window at the far right) passes when it runs alone. Run at the same time as the plug-in lane, one of its timing checks (the audio of tab A suspended within a second of tab B starting) failed once under the load; the test now waits for it. The page runs at 60 frames per second with a chord held (46 with the glass blur on the cards, which is removed).
- macOS, on GitHub's Macs (macOS 14): the universal bundle builds; the sound is compared with the web engine on Apple silicon and on Intel (Rosetta), 323 cases, worst difference 1.79e-7; the host test loads the plug-in, draws the editor, plays notes, clicks tabs, knobs, the preset browser, the menus, the presets file, and checks that the vertical card titles are turned: 53 checks pass on both. Not tried by hand on a real Mac nor in a DAW.

## Okto MultiWave Synth 1.0.5 — 2026-10-20 (a trail of light around the oscillators, ARAB sand-gold and TURK carmine)

**In short**
- **A trail of light around the oscillator tab** (the owner's choice, number 9 of ten proposals). The folder tab of the oscillator shown and the plate under it are outlined as one shape: a soft 2 px line in the oscillator's colour, bright where it leaves the tab and fading along the plate (1, 0.45, 0.06 of the colour) with a faint glow; the plate's background fades the same way (0.14 to 0.01). It follows the tab (OSC1, OSC2, OSC3) and the colour of the oscillator (yellow, blue, or the tuning's palette). Web: two SVG gradients (`oscStroke`, `oscFill` in `web/js/ui.js`, `svg.oscframe` in `web/css/synth.css`); plug-in: `drawOscFrame` in `vst/src/editor.cpp` (a polygon with a gradient fill, the stroke in pieces of about 4 px, each with its own transparency).
- **PLAY: ARAB and TURK have their own colours**, with the same oriental pattern: **ARAB sand-gold, TURK carmine red** (the owner's choice, pair d of four). While a tuning is on, the panel's accent follows its palette: ARAB gold (subtractive oscillators) and coral (additive), TURK carmine and amber (`ORIENT.arab` / `ORIENT.turk` in `tools/spec.js`; C++ `kOrientPals[2]`).

**Checked**
- The plug-in and engine lane of `node tests/full.js` (13 steps): the quick suite, the C++ engine against the JavaScript reference (323 cases, worst difference 2.1e-7), the 18 TOP Sounds of beta 0.7, the engine tests, the presets file, the VST2 entry point, the plug-in window in a host (with the new checks: the accent of ARAB is sand-gold, the accent of TURK is carmine), the crackle of three chords.
- The web app: the smoke test (the accent and the pattern of WEST, ARAB and TURK) and the demo tour (67 checks) pass, the full web run on every preset (`test_web`, 104 checks) passes too.

## Okto MultiWave Synth 1.0.4 — 2026-10-20 (a new tour for the demo, Flint Ripple Haze first)

**In short**
- **The demo's tour is made again.** The 28 presets heard are **the best presets of the last list** (the third listening, the most starred first: the 10-star sounds, then the 9-, 8-, 7- and 6-star ones) and **eight sounds of the old tour that OktoPierre keeps**, spread over the piece: *B · Mirror Sub Bass*, *A · Wavelet Lead*, *A · Wave Atom Choir Shift*, *A · String Machine*, *B · Flute Lead*, *AB · Dream Pad*, *A · Warm Pad* and *AB · Organ Lead* (with the values of the Wavelet Synthesizer, as before), in the 3rd, 6th, 10th, 13th, 17th, 20th, 24th and 27th places. The first two heard are two of his 10-star favourites. `TOUR` in `tools/spec.js`.
- **The piece does not saturate.** With every note at velocity 1 on 16 voices, five presets of the new tour were touched by the output stage (*A · Wave Pulse Lead* the most: peak 2.14, a third of the sound changed). Thirteen presets of the tour now play 1 to 10 dB lower in the demo (`tools/demo_trim.js`, written by `node tools/demo_level.js --trims 0 --write-trim`, applied by `web/js/demo.js`): the loudest peak of the whole tour is 0.69 and no preset is touched. The presets of the plug-in are not changed.
- **AA · Flint Ripple Haze comes first**: first of TOP Sounds (so the sound the synth opens on), first of its section (Pad) and first heard in the demo (`PIN_FIRST` in `tools/spec.js`).

**Checked**
- The plug-in and engine lane of `node tests/full.js` (13 steps): the quick suite, the C++ engine against the JavaScript reference (323 cases, worst difference 2.1e-7), the 18 TOP Sounds of beta 0.7, the engine tests, the presets file, the VST2 entry point, the plug-in window in a host, the crackle of three chords.
- **The demo**: the tour of 28 presets rendered window by window with the engine, as the demo plays it (every note at velocity 1, 16 voices): before the trims, 5 presets were touched by the output stage (*A · Wave Pulse Lead*: a third of the sound changed, peak 2.14); with the trims, **the loudest peak is 0.69 and none is touched**. The demo test in the browser (67 checks) passes, the full web run on every preset (`test_web`, 104 checks) passes too.

## Okto MultiWave Synth 1.0.3 — 2026-10-20 (the best 20 % lead, stars on the web, the KeyAttac folder)

A release after three more requests of OktoPierre, using his third listening (the export of 2026-10-20, 20:51).

**In short**
- **The best 20 % of the rated presets lead the preset list, all sections together**: the seven he gave 10 stars to (with 36 rated, 20 % is seven; the cut falls after the 10-star group) are now the first seven of **TOP Sounds**, the most starred first, whatever their section (five of them were not in TOP Sounds). TOP Sounds has 59 sounds; the synth opens on the first, *A · Siren Sweep*. Inside each section the starred sounds were already first.
- **The web app shows his stars, from 1 to 10, read only**: five stars with half stars at the right of each sound in the preset browser, with the same order as the plug-in (the web's TOP Sounds list is now the plug-in's list). Nothing can be rated or changed on the web: the rating stays a feature of the plug-in, where every sound still starts with no stars.
- **KeyAttac, a new folder of the USER BANK of the plug-in**: the 36 factory presets that have stars, copied and retouched to be very percussive (every attack at its minimum: amp, own envelopes, additive scales, mod and filter envelopes; a decay of 0.2 s at most to a sustain of 0.08 at most; the release kept at 0.8 s or longer), set again for big chords (`tools/supermod/loud.js --keyattac`, `tools/keyattac_adjust.js`: three went down by 2 dB). They keep his stars and say which factory preset they come from. They are put in the user bank while the presets file is older than `LIST ORDER v7` (or there is none); after the first write the player's deletions stay.
- The presets file says `LIST ORDER v7`; the stars, the user bank and the adjusted / deleted presets of a 1.0 / 1.0.1 / 1.0.2 file are kept, the lists of a v5 file are rebuilt.
- The 1.0.2 full web run had one stale expectation in its test (the last section was still expected to be Drums & Perc; it is Other): the test is fixed, the product was right.

**Checked**
- The plug-in and engine lane of `node tests/full.js` (13 steps): the quick suite, the C++ engine against the JavaScript reference (323 cases, worst difference 2.1e-7), the 18 TOP Sounds of beta 0.7, the engine tests, the presets file (`library_test`, with a new part for the KeyAttac folder: it is in the user bank, its attacks are at the minimum, a favourite the player deletes stays deleted), the VST2 entry point, the plug-in window in a host, the crackle of three chords.
- **KeyAttac, measured** (a held C4, every favourite against its original): the peak comes within 30 ms for all 36, at 0 ms in the median (the originals: 760 ms in the median, they swell), the level 0.6 s into a held note is a quarter of the first 100 ms (the originals: more than twice), and the release rings (the tail 0.3 s after the key is up is 2.6 % of the peak in the median); the loud-chord volume check: none of the 36 reaches the output stage (three went down by 2 dB).
- The web app: the smoke test and the demo tour (67 checks) pass; the full web run (`test_web`) was running when this was published.

## Okto MultiWave Synth 1.0.2 — 2026-10-20 (the third listening: the best sounds first, SuperModulation sorted out, a new opening for the demo)

A release after OktoPierre's third evaluation of the presets (his export of 2026-10-20, 20:51, made with the plug-in 1.0: 36 presets with stars, one of them adjusted).

**In short**
- **The sounds he starred come first in their section** (TOP Sounds too), the most starred first, then the order of before (`tools/ratings_v3.js`, generated by `tools/review_export.js --write` from his file, against the values of 1.0). The stars of the browser stay at zero for everyone: they are the player's; here they only decide the order. The synth now opens on the first sound of TOP Sounds, *A · Siren Sweep* (10 stars; the tie with the other 10-star sound is decided by his earlier stars).
- **SuperModulation keeps only the presets that have stars** (15 of 105). The 90 others are in a new section, **Other** (last in the list): nothing is lost, they are only not selected.
- **The preset he adjusted takes his values**: *AA · Orbit Pad* (amp envelope: attack, sustain, release, velocity; mod release), at the volume calibrated for big chords.
- **The demo: its first two presets are two of his latest favourites**: *AA · Flint Ripple Haze* (a pad, 10 stars) then *AB · Kalimba Lung Machine* (10 stars); the rest of the tour is unchanged.
- **The presets file**: it says `LIST ORDER v6`; the lists of a 1.0 / 1.0.1 file (v5) are rebuilt (sorted, Other) but its stars, user bank and adjusted / deleted presets are kept.

**Checked**
- The plug-in and engine lane of `node tests/full.js` (13 steps): the quick suite, the C++ engine against the JavaScript reference (323 cases, worst difference 2.1e-7), the 18 TOP Sounds of beta 0.7, the engine tests, the presets file (`library_test`: the lists of a 1.0 file are rebuilt, its stars are kept, a file older than 1.0 loses its stars), the VST2 entry point, the plug-in window in a host, the crackle of three chords.
- The volumes: the eight loud chords at velocity 1 on all 237 presets (`tools/supermod/loud.js --spec --all --target 0.7`): none reaches the output stage (the preset that took the owner's values included).
- The web app: the smoke test and the demo tour (67 checks) pass; the full web run (`test_web`) was running when this was published.

## Okto MultiWave Synth 1.0.1 — 2026-10-20 (no more crackle on a big chord struck hard, the left-hand key lights up)

A fix release of the final version (plug-in and web app), after two remarks of OktoPierre: "there is heavy crackling in the VST and the web version" and "in CHORD MODE the left-hand note is not lit on the keyboard when I play".

**In short**
- **The volume of every preset is set again on big chords struck hard** (all 237, the TOP Sounds too). The loud-chord test of beta 0.3.2 (five chords at velocity 1) gets three more: eight notes over three octaves, ten notes (both hands) and nine notes in the middle of the keyboard, all at velocity 1, and the target is now **0.7, the knee of the soft limiter**, instead of 0.9 (the guard): a preset whose loudest chord goes above it has its master volume lowered by whole dB. 183 of the 237 went down (1 to 12 dB, 3 dB for the median: `tools/master_adjust.js`, by number, and by name for the TOP Sounds); before, the loudest peaks before the output stage reached 2.74, now **none of the 237 presets goes above 0.69 on any of the eight chords**, so neither the peak guard nor the soft limiter works on them. Only volumes changed: the sounds are the same.
- **CHORD MODE: the key of the left hand is lit while it is held.** The keys of the selector octave choose the chord type and make no sound, so the keyboard, which lights what sounds, never lit them. The engine now keeps them (`selHeld`, in `core.js` and `dsp.h`) and the panel (web and plug-in) lights them while they are held, as the root that plays the chord.
- The demo of the web app is unchanged (the presets of the Wavelet Synthesizer's tour at their own level).

**Checked**
- The plug-in and engine lane of `node tests/full.js` (13 steps): the quick suite, the C++ engine against the JavaScript reference (**323 cases, worst difference 2.1e-7**), the 18 TOP Sounds of beta 0.7 (compared at their lowered masters: worst 7.8e-8 of the peak), the engine tests (with the new one for the lit selector keys), the presets file, the VST2 entry point, the plug-in window in a host, the crackle of three chords.
- **The big chords, all 237 presets** (`tools/supermod/loud.js --spec --all --target 0.7`): before, 183 of them reached the output stage (peaks up to 2.74); now **none does** (the peak before the output stage is at most 0.69). `tools/crackle.js` on the 8-note and the 10-note chords at velocity 1: **0 of 237 above 0.2 %** (HF residual).
- The web app: the smoke test and the demo tour (67 checks) pass; the full web run on every preset (`test_web`) was still running when this was published.

## Okto MultiWave Synth 1.0 — 2026-10-20 (the final version: the 237 presets he kept, the interface he chose, the manual)

The **official release**. It keeps what OktoPierre kept after his listening, opens on his best sound, sorts every list from the best to the least rated, takes out what he does not need any more, and has the interface he chose among the mock-ups.

**In short**
- **237 presets, the ones he rated 3 or more out of 10** (his export of 2026-10-20, 17:03; the 1182 of beta 0.3.3 were 945 more: unrated, 0 to 2 stars). They are 21 of the 22 TOP Sounds of beta 0.7 (one was unrated) and 216 numbered ones; the 19 presets he had adjusted (SAVE PRESET) carry his values. **No new preset**: the 250 made after his listening (filter and favourites-inspired ones, `tools/presets_filter.js`, `presets_fav.js`) are not in the instrument, they have no rating.
- **Every list is sorted from the best to the least rated.** TOP Sounds (54 in the plug-in: the 21 of beta 0.7 and the 33 rated above 7; the web app shows the 21) and each section. **The synth opens on the first TOP Sound**, *A · Wave Brass*.
- **Sections of the preset browser**: **PAD comes second** (right after TOP Sounds), and **Keys and Pluck are one section, KEYBOARD** (13 sounds): TOP Sounds, Pad, SuperModulation, Bass, Lead, Keyboard, Organ, Strings, Brass & Wind, Bells & Mallets, FX, Drums & Perc. The presets' own category names in the data files and the user bank sections (My presets) are unchanged; `SECTION_OF` in `tools/spec.js` maps them.
- **Preset names by type, no numbers**: `A` (one subtractive oscillator), `AA` (two), `AB` (one subtractive + the additive one), `AAB` (two + the additive one), `B` (the additive one alone), then a title, with the A in yellow and the B in blue in the browsers, as in the Wavelet Synthesizer ("1129 A1A2B1 · Dive Texture" is now "AAB · Dive Texture"). `id` in the web spec keeps the old numbered name for the tools.
- **The stars start at zero**: the rating system stays (five stars with half stars in the plug-in's browser, click to rate, the presets file, EXPORT / IMPORT) but no sound has a built-in vote any more, and the stars of the presets file of an older version are not carried over (the lists are still sorted by his ratings at the time).
- **The header** at the top left reads **OKTOWAVE / FRACTAL WAVELET SYNTHESIZER**.
- **Removed**: EVALUATE SOUNDS (the button, the window, the plug-in's vote code: 520 lines; `vote_data.h` is no longer generated), the seven extra demo songs and the song menu next to DEMO (the demo is Beethoven's *Appassionata* alone; the arrow beside DEMO is gone) and the loading of a MIDI file in the web app.
- **The interface of the mock-ups he chose** (P6 + Q1 + R6): LFO 1's wave selector (SINE TRI SAW SQR S&H) underlined at the right of its title; LFO 2 and LFO 3 as two tabs of one card (a lit dot says an LFO is on), with a stepped **SHAPE knob** (the name of the wave in the accent colour under it, a click steps to the next shape), TARGET narrower (80 px), SYNC at the end of the tab bar (plug-in); the VOICE knobs on the same line as the knobs of the cards at the left; the big **WIDTH / SPARSITY knobs smaller and better centred** (disc 42 px) and the SOURCE CYCLE picture larger; with **TUNING ARAB or TURK**, the PLAY card changes colour code (terracotta for the subtractive oscillators, turquoise for the additive one, grey cards) and shows an oriental tiling pattern. The panel is 1100 x 944.
- **The manual** opens on a new chapter, "What this synthesizer is, and what wavelets are": what a wavelet is, the seven wavelets, how the synthesizer works (one cycle split into 11 bands, resynthesised), the modulation and how to play and choose sounds, with three figures; the presets chapter lists the 237 sounds with their stars (`tools/manual/mw.js`).
- **The engine**: the CPU optimisation of the `cpu-opt` branch (bit-identical output, **35 to 39 % less CPU**, the heaviest preset from 27 to 11 %; `Revue_CPU.md`) and the crackle fix of beta 0.3.2 (peak guard, chord compensation), and the per-preset master calibration redone for the final list (`tools/master_adjust.js`).
- **Web demo = the demo of the Wavelet Synthesizer's web app** (web only, the same day; OktoPierre: "most of the sounds are saturating" and "the same song, the same presets, the same sound level as the old web version"): the piece is the same (Beethoven's *Appassionata*, III: the same notes, the first and only song), and the tour is now exactly the one of the Wavelet Synthesizer beta 0.7.1 (30 presets in the same order, from *B · Clarinet*). 14 of them are not in the factory list (it keeps the 237 he rated), so the tour carries its own copies (`DEMO_PRESETS`, `tools/demo_presets.js`, written by `tools/demo_presets_extract.js` from that web app and converted as the TOP Sounds are), in no list of the browsers. The level is the old one: `tools/demo_level.js` and the comparison of the two engines on every window of the tour give the same RMS level (median 0.00 dB, never louder; the peak guard makes it a little lower where the old engine hit the limiter). The plug-in has no demo and is unchanged.

**Checked** (the whole campaign, `node tests/full.js --parallel`, two lanes)
- The quick suite: generated files, the 237 presets sound (finite, under 0 dBFS), the VST3 host (99 checks), the web app loads and plays.
- The C++ engine against the JavaScript reference: **323 cases, worst difference 2.1e-7**.
- The 18 TOP Sounds of beta 0.7 that are in the list sound as they did (worst difference 8.8e-8 of the peak).
- The engine tests (idle skip, filter, SuperModulation, live display), the presets file (`library_test`: the stars of an older file are not carried over), the VST2 entry point (41 checks), the plug-in window in a host (tabs, CHORD MODE, the LFO tabs, the oriental colours, the fit to the screen, the browser).
- The crackle of a loud chord (three chords at velocity 1, all 237 presets): **none above 1 %** (HF residual).
- The web app: the smoke test, the demo tour (67 checks) and the full web run on every preset (`test_web`, 104 checks) pass.

**Known limits**
- macOS: no build is made or tested here (the code is portable; `editor_mac.mm` follows the Windows editor but is not compiled).
- The user bank sections (My presets) keep their old names (Keys, Pluck, ...): they are the player's own.
- Small differences from the mock-ups, kept on purpose: the cards' inside is not shifted by the 8 px of the mock-up, the dark bar of the vertical titles and the outer halo of the PLAY card are not drawn, the TARGET text is in the accent colour.

## Okto MultiWave Synth beta 0.3.3 — 2026-10-20 (the compact panel V1, the new presets 2 dB lower)

A **test version**: the panel layout the owner chose among five mock-ups, and a simple volume trim of the new presets while he has not chosen the good ones.

**In short**
- **A lower panel** (the owner's choice "V1" among five mock-ups on a 1920 x 1080 screen with the taskbar). The panel is **966 px tall** (1050 before; the bottom of the keyboard was out of sight on a 1080-pixel screen): the oscillator block, the three
  rows of cards and the keyboard are a little shorter (the knobs keep their size), the **titles of EFFECTS and PLAY are vertical, in a strip at the left of the card** (those two cards are 98 px tall), and, while CHORD MODE is on, the **CHORD KEYBOARD card is in the preset
  browser, under the list of presets** (the list is that much shorter and the panel keeps its height). With the browser hidden the card is under the keyboard as before (the panel is 120 px taller). The web app has the same panel, with the chord card under the keyboard.
- **The new presets are 2 dB lower** (every preset numbered 501 and up; `NEW_TRIM_DB` in `tools/spec.js`, on top of the loud-chord calibration of beta 0.3.2) while the good ones have not been chosen yet; the 22 TOP Sounds and the older presets are unchanged. Set the constant to 0 to take it off.
- Engine and presets file unchanged from beta 0.3.2 (the crackle guard and the chord compensation stay).

**Checked (light, for a pre-release)**: `tests/quick.js` (generated files, every preset plays, the VST3 host, the web app), the plug-in's window in a host (`vote_session`: EVALUATE SOUNDS, the stars, CHORD MODE with the card in the browser, the fit to the screen), the presets file (`library_test`) and the VST2 entry point.
Not run: the C++ / JavaScript cross-check (the engine did not change), the full web run, the loud-chord measure (kept for the official release).

**Known limits**
- The vertical titles are small (9.5 px); the B1 (additive) tab was not drawn in the mock-up, it uses the same geometry.
- The manual's screenshots show the previous panel.

## Okto MultiWave Synth beta 0.3.2 — 2026-10-20 (no more crackle on a loud chord, the window fits the screen)

A **test version** after two remarks of OktoPierre on beta 0.3.1: "many presets crackle, turning the master volume down cures it (a C major chord at C5 at the maximum velocity)" and "the panel is too tall, I do not see the bottom of the keyboard".

**In short**
- **No more crackle on a loud chord.** OktoPierre's test: a C major chord at the maximum MIDI velocity crackled in many presets, and lowering VOLUME cured it. The cause is the output stage: the soft limiter (knee at 0.7)
  flattens the peaks of a chord that sums to twice its knee or more into a buzz. Three changes (a chord of up to three notes that stays under 0.9 is bit-identical with beta 0.3.1):
  (1) the voice sum is scaled by sqrt(3 / n) when n > 3 voices sound (n weighted by their energy, so release tails count little; the same compensation as the Wavelet Synthesizer's beta 0.7.1; the chord keyboard keeps its own level, `chordTrim`);
  (2) a **peak guard** rides the output gain in front of the soft limiter so that the signal never reaches the limiter above 0.9 (exactly 1 below it: bit-identical; attack 0.3 ms, hold 15 ms, release 150 ms);
  (3) the master volume of **321 of the 900 newest presets** was lowered by 1 to 6 dB (mean 2.2 dB) where the loudest chords (triads at C4, C5 and C6, a five- and a six-note chord, all at velocity 1) peaked above 1.0 before the output stage (`tools/supermod/loud.js`;
  the 22 TOP Sounds and the 308 older presets keep their values). Measured by `tools/crackle.js` on all 1182 presets (the waveform change the output stage causes on the chord, against the same chord 18 dB lower, per 20 ms): presets above 1 %: triad at C6 58 -> 1, five notes 226 -> 7, six notes 351 -> 15;
  above 2 %: 27 -> 0, 82 -> 0, 163 -> 1 (the remaining ones are old presets, not touched).
- **The window fits the screen.** The panel is 1050 px tall (1170 with the chord card): on a 1080-pixel screen the bottom of the keyboard was out of sight. The new default zoom is **FIT** (the box at the top left shows "FIT 90 %"): the window is scaled
  down so that the whole panel is on the screen of the host window, the taskbar left out and 100 px kept for the window's bar (never above 100 %, never below 50 %; it follows CHORD MODE, which makes the panel taller). A size chosen in the menu (50 to 150 %) stays; the same menu has "Fit the window to the screen". A project saved by an older beta holds 100 % = FIT.
- The version is the plug-in's: no web app is published; its engine is the same (core.js), so the web app has the same output stage.

**Checked**: the C++ engine against the JavaScript reference on **1268 cases** (every preset, the variants of every feature and 14 loud chords at velocity 1 with 3, 5 and 8 notes, 16 voices and unison, and a master at +6 dB so that the guard works; worst 3.95e-7 of full scale); the 22 TOP Sounds against beta 0.7 (worst 2.1e-7);
the filters, the SuperModulation destinations, the idle rule, the live display, the presets file (`library_test`), the VST2 entry point (41 checks) and the plug-in's window in a host (`vote_session`: EVALUATE SOUNDS, the stars, CHORD MODE, and the fit: a 1366 x 728 screen shows the whole panel, 806 x 620 with the chord card; a large screen keeps 100 %).

**Known limits**
- Presets numbered 501 and up are quieter than in beta 0.3.1 (321 of 900, 1 to 6 dB); the 22 TOP Sounds and the 308 older presets are unchanged, so a loud chord on those is limited by the guard (a gain reduction, no crackle) instead of being turned up and down by the preset.
- A chord of more than three notes is a little quieter than before (3 dB for six equal notes).
- On a very small screen the fit goes down to 50 % (the text is then small): choose a larger size in the menu if the host allows a bigger window.
- Not heard on every preset: the measure is the high-frequency part of the distortion on 1182 presets and five chords; the owner's ear on his own chords decides.

## Okto MultiWave Synth beta 0.3.1 — 2026-10-20 (the owner's ratings applied: sorted and remade presets, stars in the browser, Skip, 300 new SuperModulation presets, no more saturation, a live scope)

A **test version** that applies the first ratings of OktoPierre (his files `sound 501 to sound 540.txt`, `541 to 580` and `581 to 620`: 80 of the 120 presets rated) and what he asked for after.

**In short**
- **The list follows his ratings.** The 48 presets he rated **below 5 stars are left out** (their numbers are not used again); the 37 (32 of the 80 he rated, and the five favourites of beta 0.3) rated 5 or more stay and show their stars; those rated **above 7**, and the six favourites he named later (`669 680 692 694 697` of beta 0.3 and `377` of beta 0.2, 7 stars each) are in **TOP Sounds**, after the 22 of beta 0.7 (best first).
- **The presets he had not rated were remade** (515 of them, same numbers and categories) to look more like the ones he liked. What the ratings say (80 presets, the stars against the measures of each sound): he rates highest the **wide, roomy, slowly moving sounds** — stereo width (r = 0.39), reverb (0.37), chorus (0.36), unison (0.34), a delay (0.27), a gentle release (0.27) and a louder sound (0.31) — smooth warm waves (soft triangle, warm saw, a rounded square) and the LFO on the scale cutoff, the resonance, the slope or the sparsity; he rates lowest the dry mono basses, the nasal or phased waves, the filter envelopes, the LFO on the filter cutoff and the vibrato. A small model (ridge regression on eleven such measures; leave-one-out correlation 0.43) predicts the stars of every candidate the composer made; `tools/supermod/rebuild.js` takes, in each category, the best predicted and, among them, the most different from each other. The composer itself now draws **lush** sounds (unison, width, chorus, reverb, echo, a gentle release) and the smooth layers more often, the filter and the vibrato less often.
- **300 new SuperModulation presets** (`1101`–`1400`), made to **innovate with the wavelets**: LFO 2 and LFO 3 each move a wavelet control, with at least two recipes that act on the wavelet itself (the atoms kept, the source phase and width, the morph between two wavelets, the window, the additive scales), at slow speeds. Start at `1101` in EVALUATE SOUNDS to hear them.
- **Stars in the preset browser**: five stars (half stars: 1 to 10) at the right of every sound; a click on the rating a sound already has clears it. They are saved in the presets file (`Stars: 7` in the block of the sound; the 38 ratings of his files and favourites are its built-in votes) and **EXPORT carries them**, whenever you like; IMPORT reads them. User-bank sounds can be rated too.
- **Skip to vote** in EVALUATE SOUNDS: ends the music at once and asks for the stars. The music is also shorter: **3.5 s of Beethoven (−30 %) and a C minor chord of 2 s (−50 %)**, 5.9 s in all instead of 9.4 s.
- **No more saturation on a long chord.** Every new preset was rendered the way EVALUATE SOUNDS plays it (16 voices, Beethoven and the chord) and compared with the same passage 12 dB lower: 195 of the 900 of them were changed by the soft limiter by more than 0.4 %; their master volume was lowered by whole dB (`tools/supermod/gain.js`).
- **The scope and the scalogram move again.** Beta 0.3 had made them static (a computed cycle at C4). They now show the **live** gains and windows of every oscillator that plays in the last voice (the cutoff the LFOs and the envelopes move, the note) with a "C4 · LIVE" mark; static again only when no note plays. A regression of beta 0.3, fixed in the plug-in and the web app (`tests/display_live.js`).
- **The lists of the browser are rebuilt** (the presets file says `LIST ORDER v4`; the lists of beta 0.3, `v3`, are not read any more, as beta 0.7 did for `v2`): the new TOP Sounds are there whatever file the player had. The user bank, the adjusted and deleted presets and the stars are kept.
- The listening files say 3.5 s and a 2 s chord.

**Checked**: `tests/quick.js --dsp` (the engine plays all 1182 presets finite and under 0 dBFS; the C++ engine matches the JS reference in 1252 cases, worst 4.1e-7 of 2e-6), the 22 TOP Sounds against the Wavelet Synthesizer beta 0.7 (worst 1.4e-7), the plug-in's window in a VST3 host (`vote_session`: EVALUATE SOUNDS with Skip, the stars of the browser — a click, a second click that clears, the right half of the fifth star = 10 —, the live scope in the screenshots), the presets file (`library_test`: built-in votes, the player's ratings, EXPORT / IMPORT, the user bank), the VST2 entry point (41 checks), the live display (`tests/display_live.js`), the filters, the SuperModulation destinations, the idle rule, and the web app (`smoke`, `test_evaluate`, `test_web`).

**Known limits**
- The remade presets are chosen by a model of 80 ratings: it is a way to put the sounds that look like his favourites first, not an oracle; the bass category was rated low, perhaps partly because EVALUATE SOUNDS plays a chord and a piano passage on them, which is not how a bass is heard.
- The built-in votes (the stars of his ratings) are shown as the ratings of every installation: change them in the browser, they are yours then.
- The old presets (`001`–`500`) were not touched (their volume neither): the saturation check is for the presets of beta 0.3 and later.

## Okto MultiWave Synth beta 0.3 — 2026-10-19 (B2 removed, three folder tabs, LFO 3, FILTER, 600 new presets, evaluation in sets of 40)

A **test version**, asked for by OktoPierre after beta 0.2: the second additive oscillator (B2) is removed, the panel is reorganised around three folder tabs, a third LFO and a
real filter are added, 600 new presets use them, and EVALUATE SOUNDS rates sounds in sets with a long chord at the end of the passage. The sound engine, the chord keyboard
and the oriental keyboard are those of beta 0.2; the 22 TOP Sounds and the presets that stay are **unchanged**.

**In short**
- **B2 is gone.** Three oscillators are left: **A1, A2** (subtractive) and **B1** (additive). B2's 41 parameters left the specification, so the parameters after them are numbered 41 lower,
  and the new ones are appended (**175 parameters**). The plug-in's state has a new version: a session saved by beta 0.1 or 0.2 is not read (it would have put its values on the wrong
  controls), the instance keeps its default sound; the web app's saved state and the user presets file are read by name and keep working (B2's values are ignored).
- **The presets that played B2 left the list**: 192 of the 500 (67 of the 200 of beta 0.1, 125 of the 300 of beta 0.2). **Their numbers are not used again**, so the ratings already given
  to the others stay valid: 308 presets of the earlier betas are left to rate (133 of beta 0.1, `001`–`200`, and 175 of beta 0.2, `202`–`500`), plus the 22 TOP Sounds. The presets that stay
  were not touched (only their unused B2 values are dropped: an oscillator at level 0 does not change the sound). Four sounds of the demo's tour played B2 and were replaced
  (Crystal Choir → Cloud Choir, Harp → Harp Pluck, Marimba → Celeste Bell, Full Drawbar Organ → Chapel Organ).
- **A new panel.** One strip of three **folder tabs** under the header — **OSC1 A1 · SUBTRACTIVE**, **OSC2 A2 · SUBTRACTIVE** (yellow) and **OSC3 B1 · ADDITIVE** (blue) — chooses the oscillator whose
  cards are shown on a soft tinted plate; a lit dot says it is heard. The ENGINE tabs are gone. **OSC MIX** and the **SCOPE** are common to every oscillator and sit at the top right, outside the
  plate; the scope and the scalogram draw the **whole sound** (one cycle of every oscillator that plays, and the sub oscillator, at C4). The card titles lost their "OSC A2 ·" prefix, the LFO 2 / LFO 3
  card has a small **2 | 3** switch, a **PLAY** card holds CHORD MODE, BASS, TUNING, MAQAM and TONIC, the preset box is narrower and the DEMO arrow bigger. The panel is 1050 px tall (860 in beta 0.2).
- **LFO 3**: a second LFO of the LFO 2 kind (the same 17 targets, in a second sub-tab of the same card). LFO 1 did not change. LFO 2 and LFO 3 each move one control in every oscillator that has it
  and add up when they aim at the same one; the table "variants" (SPARSITY, PHASE, WIDTH) look at both.
- **FILTER**: a four-pole (24 dB per octave) resonant low-pass in every voice, after the oscillators are mixed and before the amp envelope; two characters, **LADDER** (every stage saturates) and **OTA**
  (only the input of the feedback loop saturates; part of the low end kept); CUTOFF (20 Hz – 20 kHz), RESO (just above self-oscillation at 100 %), DRIVE, KEY TRK, ENV AMT (± 8 octaves) and an ADSR of its own;
  LFO 2 and LFO 3 get two new targets, **Filter Cutoff** and **Filter Resonance**. It is **open by default** and an open filter is not computed (`fltOn`): **every older sound is bit-identical**
  (the 22 TOP Sounds still match beta 0.7 within 1.5e-7). Brand names are not used for the two characters (the classic circuits they recall are trademarks).
- **600 new presets**, `501`–`1100`, 50 in each of the 12 categories (Drums & Perc included, with a new composer of drums). The composer of beta 0.2 (`tools/supermod/`) was ported to three oscillators:
  every preset has **LFO 2 and / or LFO 3 on wavelet controls** (the SuperModulation ones both, with LFO 1 on two or three more; the weights favour the controls only the subtractive oscillators have: SPARSITY, SOURCE
  PHASE, SOURCE WIDTH — and the window, the scale cutoff and resonance, the morph …), at most one LFO per control, and about **two in three use the FILTER** with an envelope fitted to the kind of sound
  (a bass snaps open, a pad opens slowly, a pluck snaps shut, an organ hardly moves it) and, in some, an LFO on its cutoff or resonance. The same measures as in beta 0.2 apply (limiter share, bursts of high
  frequency, drop-outs, motion with and without the LFOs, contrast between oscillators, the onset difference of decaying sounds), and the selection is farthest-first, also against the 330 presets that existed
  without them; loudness = the TOP Sounds' median minus 1 dB. **Nobody has heard them yet.**
- **EVALUATE SOUNDS**: the passage is now the 5 s of Beethoven **and a long C minor chord** (C3 G3 C4 Eb4 G4, 4 s) so that a sustained sound can be judged; the sounds come in **sets of 40**, each with
  **its own file** (`sound 501 to sound 540.txt`: the web app downloads it when the set is finished, the plug-in writes it next to the ratings file after every rating); **Start at…** asks for the number of the first
  sound (web: a prompt; plug-in: a small window); the list is the 600 of beta 0.3 first, then the 175 of beta 0.2, then the 133 of beta 0.1 (**908** sounds). Preset numbers have 3 or 4 digits.
- Manuals, screenshots and numbered callouts follow the new panel; a FILTER chapter and LFO 3 are described.

**Checked**: the C++ engine against the JavaScript reference on **1000** cases (all 930 presets and 70 variants of every feature: LFO 3, the filter in both characters, the live chord scenarios, the tunings; worst 3.6e-7 of full scale); the 22 TOP Sounds against the published beta 0.7 engine (worst 1.43e-7); `tests/filter.js`, `tests/supermod.js`, the idle rule and the engine self-test; the plug-in in its own window (`vote_session`: the three tabs, "Start at…", the set file, a recorded change, CHORD MODE: 39 checks), the presets file (`library_test`, 930 presets) and the VST2 entry point (41 checks); the web suites {{WEB}}.

**Known limits**
- The 600 new presets were **measured, not listened to**; the owner's ratings are what tells which are good. The measures cannot hear a preset that is thin or odd in a way they do not see.
- The plug-in's state of beta 0.1 / 0.2 is not read (the parameters moved); the web app's own saved state and the user presets file are read by name.
- The filter's two characters are models of the classic circuits, not copies; LADDER at high RESO and DRIVE is loud: the master and the limiter keep it under 0 dBFS, but turn VOLUME down first.
- The composer cannot run the old recipes any more (`tools/make_presets.js`, `recipes_*.js` write B2); they are the record of the 200 presets of beta 0.1.
- macOS: no build is made or tested (the shared code stays portable; `editor_mac.mm` was only adapted by reading).

---

## Okto MultiWave Synth beta 0.2 — 2026-10-19 (SuperModulation, 300 new presets, oriental keyboard, a chord that follows the left hand)

A **test version**, asked for one night by OktoPierre: the LFOs reach the wavelet itself, the chord keyboard gets a bass and follows the left
hand, a three-position switch adds an oriental keyboard with quarter tones, and 300 new presets are waiting for his ears. The 22 TOP Sounds and the
200 presets of beta 0.1 are **unchanged** (they are still bit-identical with beta 0.7 / beta 0.1).

**In short**
- **SuperModulation.** LFO 1 has three new amounts, **SPARSITY** (the subtractive oscillators' sparsity swings by ± the amount: the tables are built at
  nine sparsities and each voice crossfades between the two nearest), **RESO** (± dB on the resonance of every scale filter, kept in 0–24 dB) and
  **ENV>WAV** (the mod envelope's reach on the wavelet morph swings with the LFO). **LFO 2** now reaches every control of the wavelet oscillators and
  of the scale filter: seven more targets after the ten of beta 0.3/0.4 — **SPARSITY, SOURCE WIDTH** (nine widths), **TILT, ODD BARS, EVEN BARS, SCALE
  SUSTAIN** (the additive oscillators) and the **WAVELET MORPH** position. The beta 0.4 phase sets became a general "variant" mechanism (12 phases, 9
  sparsities, 9 widths; one kind per oscillator, SPARSITY before PHASE before WIDTH). Every new amount is 0 by default and the old code paths are
  untouched then (the 22 TOP Sounds still match beta 0.7 within 1.5e-7; the cross-check is bit-compatible). The LFO 1 / LFO 2 / VOICE cards were
  re-laid out (LFO 1 440 px wide with seven amounts).
- **300 new presets**, `201`–`500`, made by a composer (`tools/supermod/`) from 24 subtractive and 13 additive oscillator *layers* and 22 LFO
  recipes, then measured one by one (about 2,000 candidates for 300 presets): the two oscillators of one kind are **very different** (family,
  role, wavelet class, wave, brightness, tuning, filter, own envelope: a "contrast" score and the difference of their solo spectra and envelopes),
  the sound keeps a pitch, there is no burst of high frequencies, no drop-out, and the chord with its bass stays under the limiter's knee (the
  cause of the crackle some presets had when chords were played); the new **SuperModulation** category (120 sounds, first in the lists) keeps only
  sounds whose four most moving spectral bands move by more than 3 dB (standard deviation) more than they do with the LFOs at 0, and the other
  categories (Bass 22, Lead 22, Keys 20, Organ 8, Pad 26, Strings 12, Brass & Wind 14, Pluck 20, Bells & Mallets 20, FX 16) at least a little;
  a decaying sound (pluck, bell) is judged by how much its notes differ with the LFO phase. Their loudness is the TOP Sounds' median minus 1 dB.
  They were chosen farthest-first, also against the 222 older presets, so the set is as varied as the engine allows. Of the 222 older presets only
  about 30 moved their timbre at all. **Nobody has heard the 300 yet** — that is what EVALUATE SOUNDS is for (the list is now 201–500 first, then
  the 200 of beta 0.1; the ratings file is keyed by the number, so ratings of 001–200 stay valid). "Wobble Bass" is the first of the Bass list.
- **Chord keyboard.** **BASS** is a button under CHORD MODE and is **on by default**: the root two octaves below (never under C1), 3 dB louder
  (`BASS_GAIN` 1.4). A chord keeps the level of a triad whatever its size (`chordTrim`). **The chord follows the left hand**: pressing another
  chord on the selector octave (or a pad, VOICING or BASS) while a root is held changes the held chord at once; only the notes of the chord now
  played sound (the dropped notes fade out in 60 ms at most, the shared notes are not played again); the last chord chosen stays chosen
  (the left hand's memory).
- **Oriental keyboard.** The three-position switch **TUNING** (Western / Arabic / Turkish) under CHORD MODE, **MAQAM** (Rast, Bayati / Uşşak,
  Hijaz / Hicaz, Saba, Nahawand / Buselik) and **TONIC** under the scalogram: Arabic = 24-tone equal temperament (quarter tones of 50 cents),
  Turkish = the 53 commas of the Arel-Ezgi-Uzdilek system; the keys the tuning moves carry an amber arrow; every note follows (keys, chord notes,
  sub oscillator, MIDI), except the demo and EVALUATE SOUNDS. Three new playing parameters (never in a preset).
- The **preset browser follows the preset box** (web and plug-in): choosing a sound with the arrows, the menu, a program change or the demo shows
  its category and its row at the right.
- EVALUATE SOUNDS says "Start at 201" (the first preset's own number) and rates 500 presets in factory order.
- A **sine source** is now computed with the same additions and multiplications in both engines (`sinTurn`, a Taylor series: 7e-16 from `Math.sin`). `Math.sin` and `std::sin` differ
  in the last bit, and SPARSITY chooses between atoms of equal size (a sine analysed with Daubechies 20 has many): the web app and the plug-in kept other atoms, and six of the new presets
  sounded different in the two. The old presets that use a sine source differ from beta 0.1 by that 7e-16 only.

**Checked**: the 22 TOP Sounds against the published beta 0.7 engine; the C++ engine against the JavaScript reference on **577** cases (all 522 presets and 55 variants: the new LFO
destinations, the live chord scenarios, the tunings with a glide and a chord keyboard: worst 1.8e-7); `tests/supermod.js`; the idle rule; the engine
self-test; the VST3 test host (188 checks of its non-editor sections; its controller-state section is the Wavelet Synthesizer's and still fails on its first check); the VST2 entry point (41 checks); the plug-in's EVALUATE SOUNDS window, CHORD MODE and the preset browser following the preset box, driven like a player; the presets file of beta 0.1 read with the new presets in their default places; the web app in headless Edge (the whole run plays all 522 presets).

**Known limits**
- The 300 new presets were **measured, not listened to** (nobody can listen to a thousand candidates overnight): a preset can be thin or odd in a way the measures do not see; that is what the ratings are for.
- A loud chord played with many fingers still distorts on a few older presets, which are not changed (131 Oboe, 121 String Machine II, 067 Pipe Organ Duo, 073 Fair Organ, 130 Clarinet, 064 Jazz Organ, 071 Theatre Organ II, 187 Spaceship: lower VOLUME or the number of notes). The chord keyboard turns its chords down so that it does not.
- The oriental tunings are the usual keyboard approximations (a half-flat degree = -50 cents; the Turkish values are the commas of the Arel-Ezgi-Uzdilek system): in the Arabic tuning Rast retunes the third and the seventh and Bayati and Saba the second degree, while Hijaz and Nahawand use the piano's semitones (nothing is retuned); the Turkish tuning gives all five their commas.

---

## Okto MultiWave Synth beta 0.1 — 2026-10-18 (four oscillators, 200 new presets, EVALUATE SOUNDS)

A **test version**: the sound engine, the panel and the presets are new, and the 200 new presets still have to be heard.

**In short**
- **Four oscillators instead of two engines**: A1 A2 (subtractive wavelet) and B1 B2 (additive wavelet). Each has its own tone,
  scale filter, position window, tuning (octave, semitones, cents), **own envelope** (it multiplies the AMP ENVELOPE) and
  **pitch envelope** (a fall or rise in semitones over a time); one tab per oscillator at the top of the panel shows its cards
  (the panel is as clear as before: the other three oscillators' cards are not shown).
- **OSC MIX** (four level knobs) replaces the A/B MIX knob. A new patch plays A1 at 100 %, the others at 0. A level is smoothed
  over 20 ms; an oscillator at 0 costs nothing, and the wave tables of an oscillator are built only while its level is above 0.
- **LFO 2** moves its target in every oscillator at once; WAVELET MORPH and the SOURCE PHASE LFO act on each oscillator.
- **222 presets**: the **22 TOP Sounds** (unchanged: they match the Wavelet Synthesizer beta 0.7 within 1.5e-7 of the peak)
  and **200 new presets** `001`–`200` — Bass 18, Lead 22, Keys 22, Organ 12, Pad 30, Strings 18, Brass & Wind 14, Pluck 20,
  Bells & Mallets 18, FX 14, Drums & Perc 12 — made with the oscillator pairs A1A2 (73), B1B2 (67) and A1B1 (60). Every one uses
  at least two oscillators; one oscillator is often the attack (a click of noise, a pluck, a breath). Their loudness is matched
  to the TOP Sounds, and none is a near copy of another (checked by their spectra and envelopes).
- **EVALUATE SOUNDS** (web app and plug-in): plays 5 s of Beethoven's *Appassionata* (III) with each new preset, asks 1–10
  stars, offers to modify what you rated above 5 (the changes are recorded as the parameters that differ from the preset) and
  saves a `.txt` after every answer; it continues where it stopped, and **Save as…** keeps a copy of the ratings so far under a name of
  your own (stop half way whenever you like).
- **CHORD MODE** button next to the keyboard: it grows the panel by 120 px and shows the chord-harp card; off, the panel is
  the plain synthesizer (the chord settings stay plug-in parameters, saved with the project, never in a preset).
- Demo: a tour of 29 presets on *Appassionata* (the TOP Sounds mixed with new presets that show the oscillators at work), the
  other pieces play the same tour.
- New identity next to the Wavelet Synthesizer and WaveChord: name, class IDs, VST2 ID `OkMW`, presets file
  `OKTOMULTIWAVE presets.txt`, web storage keys. Windows and web only: no macOS build was made.

**CPU remarks of the load study applied** (`Revue.md`, `CPU Load test`; the C++ and JavaScript engines still agree: 251 cases
within 1.8e-7, the limit of the cross-check is now 2e-6). Measured with the JavaScript engines on the 22 TOP Sounds, twelve held notes
each, 3 s of audio: 2.65 s for the beta 0.7 engine, 2.15 s for this one (−19 %), although it can run four oscillators:
- *P1, P7*: the terms that do not depend on the voice (oscillator levels, unison, the additive bands' bars, decays and tilt,
  LFO 2) are computed once per block; an oscillator at level 0, or a morph or phase share at 0, is not rendered.
- *P2*: `exp` instead of `pow(10, ·)` in the filter gains, the drive and the master level (differences of the last bit).
- *E1*: the chorus' two LFOs are rotating vectors (two sines and two cosines per block instead of six sines per sample).
- *R1*: the wavelet transform wraps with a mask instead of `%` (bit-identical).
- *P10*: an instance with no voice, no table fade and a silent output (under −180 dBFS for longer than the delay's echo plus
  4096 samples) does not compute its blocks; checked against the full computation on dry, delay, reverb and chorus sounds.
- *E3*: the delay, its filter, the master smoothing and the reverb damping have the same time constants at 44.1, 48 and 96 kHz
  (48 kHz is unchanged to the bit).
- *T3*: the web app builds the wave tables in a Worker (with a sequence number, so a late result never replaces a newer one);
  it falls back to the main thread without Worker.
- Robustness: a NaN or huge velocity and a NaN parameter are harmless; the builder thread and the first activation catch an
  out-of-memory error; a table set built for an older state cannot replace the one built at activation; the build uses
  `-ffp-contract=off`; the presets file is never written over when it was read cut (16 MB), it is flushed to the disk before it
  replaces the old one, and the library asks the system for its folder once and looks at the file at most every 500 ms; the
  preset browser is drawn only when its part of the window is; the web app says so when the audio processor fails
  (`onprocessorerror`), draws its animated displays when their data changed (and twice a second at rest), and creates no
  buffer views per audio quantum.
- *Not done* (they change the sound or need a listening validation, and the TOP Sounds must stay as they were): P3 `CTRL = 64`
  (the gains would follow more slowly), P4 table of the filter gains and P5 `float` voice loop (1e-4 and 1e-7 away from the
  reference), T1 real inverse FFT, T2, T4, T5 shared tables between instances, T6, E2 reverb layout in C++, the `fmax` limit
  at high sample rates, and the Revue's remarks on CI, accessibility and import limits.

**Checked**: the 22 TOP Sounds against the published beta 0.7 engine; the C++ engine against the JavaScript reference on 251
cases (all 222 presets and variants of every feature, chord scenarios included); the idle rule; the VST3 test host (98 checks of
its quick sections); the plug-in's EVALUATE SOUNDS window and CHORD MODE driven by `vst/devtest/vote_session.cpp` in an
off-screen window (audio, parameters sent to the host, ratings file, screenshots); the web app in headless Edge (the four
oscillator views, CHORD MODE, the demo, every preset plays and releases).

---

# The chord keyboard (WaveChord Synth beta 0.1 — 2026-10-18), now part of Okto MultiWave Synth

- A chord keyboard in the style of electronic chord harps: one octave of the keyboard (KEYS OCT, C3–B3 by default, tinted
  purple) chooses the chord type and makes no sound; every key above it plays the whole chord with one finger; keys pressed
  while the root is held play as themselves, keys below the selector octave play a bass line.
- Twelve chord pads in the layout of the selector octave (Maj, Min, 7, m7, Maj7, Sus2, Sus4, Dim, Aug, 5, Add9, Note) and 22
  chord types in all; a chord display, STACKED / FOLDED voicing, BASS, STRUM (0–100 ms between the notes) and a strum plate.
- The chord's notes are ordinary notes: sustain, portamento, voice allocation and every sound parameter work as usual; a chord
  never uses more voices than VOICES. Reference-counted notes: a note shared by the chord and a held key keeps sounding until
  both release it. The six chord settings are automatable plug-in parameters, never in a preset; a selector key updates the
  Chord Type parameter.

---

# Wavelet Synthesizer — Release history (the synthesizer Okto MultiWave Synth is built on)

## beta 0.7 — 2026-10-18 (OktoPierre's TOP Sounds, a roomier panel, a new demo)

**In short**
- **TOP Sounds = OktoPierre's 22 favourites**, in his order, the best first (his presets file "OKTOWAVE presets V7.txt"):
  B · Mirror Sub Bass, A · Noise Wash Pad, A · Siren Sweep, B · Theatre Organ, B · Space Choir, A · Wavelet Lead,
  B · Focus Sweep, B · Flute Lead, B · Choir Pad, A · Wave Brass, A · Wave Riser, A · Warm Pad, A · Wave Attack Lead,
  A · Dub Echo Lead, A · Wave Pulse Lead, AB · Glass Choir, A · Cello Section, AB · Silk Strings, A · Spiccato Strings,
  A · Shimmering Strings, A · Wave Robot, A · Laser Sweep. beta 0.5 / 0.6 had added 15 Source Phase sounds to them.
  **Source Phase** is the last category again. The 150 presets and their sounds are unchanged.
- **Panel**: SUB OSC's LEVEL, OCT and SHAPE one above the other, so the SCOPE / SCALOGRAM window is wider and the scope
  taller; the keyboard and the wheels taller; LFO 1, LFO 2 and EFFECTS a little shorter; more room in VOICE; the credit
  "By OktoPierre" small, at the bottom left.
- **Demo** (web app): OktoPierre's choice of sounds from the previous tour mixed one by one with his TOP Sounds; during
  the first presets the demo window explains the idea of the synth in a few plain sentences.
- **Plug-in presets file**: the lists are now written "LIST ORDER v3"; the lists of a beta 0.5 / 0.6 file are rebuilt with
  the new TOP Sounds (your adjusted and deleted presets and your user bank are kept).

## beta 0.6 — 2026-10-17 (panel ergonomics, tempo sync)

**In short**
- **A clearer panel** (plug-in and web app): SUB OSC at the top beside the wavelet oscillator; LFO 1 (the former "LFO")
  and LFO 2 side by side with the same controls (shape tabs); the chorus is part of EFFECTS, shown in the order of the
  sound SATURATION | CHORUS | PING-PONG DELAY | REVERB (the effects chain itself is unchanged); VOICE, the PITCH / MOD
  wheels (just left of the keyboard) and the keyboard on the bottom row; "SCALOGRAM" written above the scalogram;
  "Created by OktoPierre" larger.
- **One MANUAL button** instead of MANUAL A / MANUAL B: it opens the manual of the engine shown.
- **Tempo SYNC** (plug-in only): SYNC buttons on the delay, LFO 1 and LFO 2. With SYNC on, the delay's TIME is a note
  value of the host's tempo (1/32 … 1/1, T = triplet, D = dotted, ordered by length; up to 4 s) and the LFO RATE too
  (4/1 … 1/32); without a tempo from the host, 120 BPM. The delay can now be up to 4 s long. The web app has no DAW, so
  it has no SYNC.
- **Web app**: a welcome window at page open — *Run the demo*, *Play the synth* (MIDI supported; it starts the sound and
  plays no note), *Download the VST* — and a DOWNLOAD VST link in the header (the GitHub releases page).

**Your projects and presets**: the six SYNC parameters are new and off by default, so every Live Set, preset and presets
file sounds as before.

**Checked**: 148 of the 150 presets are sample-identical with beta 0.5; A · Steel Pluck and A · Phase Glitch differ by less
than 4e-9 (−170 dB, inaudible: the longer delay line rounds its read position differently). The plug-in matches the web
engine on all presets and on the SYNC'd delay and LFOs; the echo times were measured in a DAW-like host at several tempos.

**Security review**: before this release a second, independent AI agent reviewed the plug-in (Windows and macOS) and the
web page. It found no intentional malicious code (no network access, no hidden process or file access, nothing
obfuscated) and no serious vulnerability. Its minor findings are fixed in beta 0.6:
- "Show the presets file" starts Windows Explorer by its full path;
- an IMPORTed presets file is refused when it is 16 MB or larger or holds more than 2000 user-bank sounds; the bank keeps
  at most 2000 sounds, and names are cut at 160 bytes;
- the host's tempo is held at 1000 BPM at most, and only sample rates from 8 kHz to 1.536 MHz are taken;
- the web app checks the user presets kept in the browser before using them.

## beta 0.5 — 2026-10-17 (OktoPierre's sort)

**In short**
- **150 presets** instead of 253: OktoPierre went through all of them in the plug-in (his presets file "OKTOWAVE presets
  V4.txt") and kept 150; the 103 others are left out (listed below). His six adjustments are now the factory presets:
  B · Focus Sweep (unison 2), A · Laser Sweep (LFO 0.37 Hz, sub oscillator 26 %), A · Acid Sub (octave −2, unison 2),
  A · Wave Pulse Lead (octave −3, unison 4), A · Wavelet Lead Shift (octave −1), A · Focus Sweep Shift (octave −2).
- **TOP Sounds** (37): his TOP list and the first 15 sounds of Source Phase, one in two, the best first. They also open
  the factory order (◀ ▶, the plug-in's programs, the web app's preset list). Each category lists its sounds in his order.
- **Source Phase** is the second section of the browser and the menus, after TOP Sounds (44 sounds).
- **Moving presets** (plug-in): drag a sound of the browser onto another category — onto TOP Sounds it is added there — or
  right-click it: *Move to ▸*, *Back to* its own category, *Add to / Remove from TOP Sounds*. In the USER BANK tab a sound
  dragged onto a section moves to that section. All of it is kept in the presets file ("LIST ORDER v2") and travels with
  EXPORT / IMPORT; ★ marks the sounds that are in TOP Sounds.
- **Arrow keys** (plug-in and web app): ↑ ↓ play the sound above / below in the list shown, ← → show the category above /
  below; with the browser hidden, the previous / next preset. In the plug-in, click in the browser first so that it has
  the keyboard (other keys still go to the host).
- **Your projects and presets**: a Live Set keeps its sound (it is in the plug-in's state). One saved with a preset that is
  left out shows its name (SAVE PRESET then keeps it in the user bank). In your presets file the adjusted and deleted
  presets and the user bank are kept; the list order of a beta 0.3 / 0.4 file is not read (the lists were rebuilt).
- **The web app’s demo** (Appassionata): after B · Clarinet, the first eleven TOP Sounds; the five beta 0.2 sounds left out
  are replaced by kept ones of the same type (AB · Analog Strings, A · Ladder Bass, A · Wave Wobble Bass, AB · Silk Strings,
  AB · Wobble Bass).

**Checked**: the 144 presets kept unchanged are sample-identical with beta 0.4; the 6 adjusted ones differ only in the
values OktoPierre changed; every kept preset has exactly the values of his file. The plug-in matches the web engine on
all 150 presets.

**Left out** (103, beta 0.4 order): A · Square Mod 2; A · Haar Bass; A · Edge Pluck; B · Soft Flute; A · Infra Sub Bass; A · Fuzz Bass; A · Sparse Keys; A · Square Mod; A · Deep Saw Bass; A · Wave Morph Bass; A · Acid Line; A · Fat Unison Bass; A · Sub Saw Bass; B · Sub Organ Bass; A · Deep Sub Pluck; AB · Sub Hybrid Bass; B · Pluck Bass; A · Rubber Bass; A · Octave Bass; A · Screaming Lead; AB · Duo Lead; A · Wave Window Lead; B · Chip Walsh; B · Chip Echo; AB · Chip Hybrid; A · Pulse Lead; A · Dyno Keys; AB · Wurli Bark; AB · Gospel Mix Organ; A · Cathedral Saw; A · Dark Pad; A · Solo Violin; AB · Hybrid Strings; AB · Space Strings; A · Chamber Strings; A · Synth Brass; A · Brass Stab; AB · Breathy Flute; B · Impulse Pluck; AB · Shimmer Pluck; B · Koto; B · Walsh Bells; A · Wave Laser; B · Wave Random Computer; B · Wave Reverse Bands; A · Wave Glitch Morph; A · Scanning Edge; A · Haar Bass Shift; A · Edge Pluck Shift; A · Soft Flute Shift; A · Infra Sub Bass Shift; A · Dub Echo Lead Shift; A · Fuzz Bass Shift; A · Sparse Keys Shift; A · Screaming Lead Shift; A · Wave Attack Lead Shift; A · Dyno Keys Shift; A · Theatre Organ Shift; A · Deep Saw Bass Shift; A · Wave Morph Bass Shift; A · Duo Lead Shift; A · Wurli Bark Shift; A · Gospel Mix Organ Shift; A · Silk Strings Shift; A · Spiccato Strings Shift; A · Wave Brass Shift; A · Fat Unison Bass Shift; A · Wave S/H Lead Shift; A · Sweep Pad Shift; A · Phase Pair Bass 0°; A · Phase Pair Bass 67°; A · Shifted Reese; A · Haar Grit Bass; A · Rubber Phase Bass; A · Phase Sub Pluck; A · S&H Phase Bass; A · Phase Pair Lead 0°; A · Phase Pair Lead 2°; A · Phase Scream; A · Shift Lead; A · Phase Sync Lead; A · Morph Phase Lead; A · Chip Phase; A · Phase E-Piano; A · Shifted Clav; A · Phase Bell Keys; A · Glass Phase Keys; A · Tine Shift; A · Lo-Fi Phase Keys; A · Phase Organ; A · Rotary Phase Organ; A · Reed Phase Organ; A · Phase Choir; A · Phase Is The Sound; A · Shifted Cellos; A · Phase Viola; A · Phase Brass; A · Phase Pluck; A · Shift Harp; A · Phase Bells; A · Phase Mallet; A · Phase Hat; A · Phase Snare.

## beta 0.4 — 2026-10-17 (Source Phase)

**In short**
- **SOURCE PHASE** (engine A, new knob PHASE right of the SOURCE CYCLE display): the source wave is moved inside the cycle
  before the wavelet transform. The transform is shift-variant — band *b* only commutes with shifts by multiples of
  2^(12−b) samples — so the scale filter, the sparsity and the position window meet other atoms and the timbre changes:
  strongly with Haar and Daubechies 2/4, weakly with Daubechies 20. A Fourier filter cannot do this. It is the “source
  phase” control announced as future work in the author’s paper.
- **LFO 2 can move it** (TARGET PHASE, the last of the menu): the tables are then also built at 11 more phases, 30° apart,
  and each voice crossfades between the two nearest — a scan through the timbres of the cycle.
- **100 new presets** in a new last section, **Source Phase**: 50 phased versions of OktoPierre’s 15 favourites and 35 best
  voted sounds (“… Shift”; the 14 engine B and A+B ones rebuilt on engine A), 50 new sounds of every type, two pairs to
  compare (“A · Phase Pair Bass 0°” / “… 67°”, “A · Phase Pair Lead 0°” / “… 2°”: even 13 samples change it) and “A · Phase Is The Sound”, which
  is silent at 0°. They use the whole instrument (unison, chorus, delay, reverb, sub oscillator, glide, LFOs, WAVELET MORPH);
  23 of them move the phase with LFO 2. 253 factory presets in all.
- **Nothing older changes**: at PHASE 0 (the default) the source is the beta 0.3 one bit for bit; the 153 older presets were
  rendered with the beta 0.3 and beta 0.4 engines and are sample-identical; states, Live Sets, user presets and the presets
  file saved before beta 0.4 get PHASE 0. The older presets keep their place and number (the new section is last).

**From the testers’ reports** (the same beta 0.4, rebuilt)
- **Fixed: a note that never stopped.** A key held while a preset with another VOICES setting was loaded (mono ↔ poly) was
  then released on the wrong voice, and kept sounding until the plug-in was removed and reloaded. A note off now releases
  that note whatever VOICES is (plug-in and web app); the mono list of held keys forgets released keys; mono legato plays
  as before.
- **IMPORT…** in the preset browser (in place of FILE; “Show the presets file” is in the right-click menu, with the new
  “Import presets (.txt), replacing yours…”): an EXPORT copy or someone’s `OKTOWAVE presets.txt` replaces your adjusted and
  deleted presets, list order and user bank, after a question. Your previous file is kept next to it as
  `OKTOWAVE presets (backup <date> <time>).txt`; a file without presets is refused and nothing changes.
- **A wide scroll bar** for the long lists of the preset browser (12 px instead of a 3 px line): drag it or click the bar,
  easy with a trackpad, no mouse wheel needed. The web app’s list has the same wider bar.

**Measured** (`tools/phase_effect.js`: the preset’s cycle at middle C at phase 0 and at its phase, harmonics 1–64 within 50 dB
of the strongest): every phased preset changes some harmonic by 6 dB or more (lowest 6.1 dB, median 22.6 dB) and the loud
harmonics — within 20 dB of the strongest — by 4 dB or more (lowest 4.4 dB, median 17.8 dB). Loudness matched to the
favourites (loudest 200 ms of a held C major chord, median −13.8 dB; drums over 50 ms, 3 dB lower); a few resonant sounds stay
up to 5 dB quieter so that their peaks stay under 0 dBFS, the hat sits at −31 dB like the factory Closed Hat.

**The 100 presets of the Source Phase section** (name, phase, largest harmonic change against 0° / the same among the loud harmonics, ~ = LFO 2 also moves the phase):

*From the 15 favourites and the 35 best voted* (★ engine B / A+B sounds rebuilt on engine A): A · Square Mod 2 Shift 194° 25/25 dB; A · Wavelet Lead Shift 199° 12/7 dB ~; A · Haar Bass Shift 19° 17/17 dB; A · Edge Pluck Shift 92° 72/13 dB; A · Focus Sweep Shift 11° 66/56 dB ~ ★; A · Soft Flute Shift 44° 8/8 dB ★; A · Infra Sub Bass Shift 73° 8/6 dB; A · Dub Echo Lead Shift 298° 19/9 dB; A · Fuzz Bass Shift 165° 17/17 dB; A · Laser Sweep Shift 56° 34/34 dB ~; A · Warm Pad Shift 275° 29/8 dB ~; A · Mirror Sub Bass Shift 81° 38/5 dB ★; A · Sparse Keys Shift 275° 7/7 dB; A · Space Choir Shift 300° 31/25 dB ~ ★; A · Square Mod Shift 67° 29/29 dB; A · Wave Robot Shift 354° 52/52 dB ~; A · Screaming Lead Shift 87° 15/14 dB; A · Wave Attack Lead Shift 253° 10/10 dB; A · Wave Pulse Lead Shift 36° 35/34 dB; A · Dyno Keys Shift 348° 24/19 dB; A · Theatre Organ Shift 151° 19/19 dB ★; A · Noise Wash Pad Shift 185° 25/25 dB; A · Solo Violin Shift 11° 19/19 dB; A · Siren Sweep Shift 104° 20/19 dB; A · Wave Riser Shift 286° 22/22 dB; A · Wave Laser Shift 191° 10/6 dB; A · Deep Saw Bass Shift 19° 16/16 dB; A · Wave Morph Bass Shift 230° 19/10 dB; A · Duo Lead Shift 30° 29/12 dB ★; A · Flute Lead Shift 329° 9/6 dB ★; A · Wave Window Lead Shift 160° 43/26 dB; A · Wurli Bark Shift 28° 19/18 dB ★; A · Gospel Mix Organ Shift 143° 75/7 dB ★; A · Choir Pad Shift 11° 23/23 dB ~ ★; A · Glass Choir Shift 106° 21/21 dB ★; A · Cello Section Shift 143° 19/9 dB; A · Silk Strings Shift 143° 29/12 dB ★; A · Spiccato Strings Shift 185° 23/6 dB; A · Shimmering Strings Shift 320° 20/4 dB; A · Wave Brass Shift 134° 7/7 dB; A · Acid Line Shift 340° 26/25 dB ~; A · Fat Unison Bass Shift 44° 32/32 dB; A · Wave Wobble Bass Shift 134° 8/8 dB; A · Wave S/H Lead Shift 101° 6/6 dB; A · Full Drawbar Organ Shift 56° 13/13 dB ★; A · Sweep Pad Shift 95° 14/14 dB ~; A · Analog Brass Pad Shift 126° 14/14 dB; A · Wave Morph Pad Shift 64° 29/23 dB; A · Wave Atom Choir Shift 289° 26/26 dB ★; A · Ensemble Strings Shift 320° 20/4 dB.

*New sounds*: A · Phase Pair Bass 0° (0°, reference); A · Phase Pair Bass 67° 32/32 dB; A · Shifted Reese 11° 22/22 dB ~; A · Phase Wobble Bass 149° 19/19 dB ~; A · Haar Grit Bass 30° 18/18 dB; A · Rubber Phase Bass 331° 15/15 dB; A · Phase Sub Pluck 64° 92/62 dB; A · S&H Phase Bass 157° 18/18 dB ~; A · Phase Pair Lead 0° (0°, reference); A · Phase Pair Lead 2° 9/9 dB; A · Phase Scream 168° 99/69 dB ~; A · Shift Lead 50° 26/26 dB; A · Phase Sync Lead 168° 26/26 dB ~; A · Morph Phase Lead 101° 7/6 dB; A · Window Phase Lead 241° 42/42 dB; A · Chip Phase 67° 93/63 dB ~; A · Phase E-Piano 163° 21/21 dB; A · Shifted Clav 50° 19/19 dB; A · Phase Bell Keys 120° 102/72 dB; A · Glass Phase Keys 28° 28/28 dB; A · Tine Shift 53° 18/15 dB; A · Lo-Fi Phase Keys 157° 57/57 dB ~; A · Phase Organ 64° 23/23 dB; A · Rotary Phase Organ 165° 18/9 dB ~; A · Pipe Phase 36° 81/11 dB; A · Reed Phase Organ 154° 23/5 dB; A · Phase Drift Pad 275° 17/17 dB ~; A · Dawn Phase 281° 22/6 dB; A · Shifted Strings Pad 143° 29/12 dB; A · Phase Choir 177° 70/70 dB ~; A · Noise Phase Pad 53° 30/29 dB; A · Phase Glass Pad 42° 15/15 dB; A · Dark Phase Pad 165° 7/5 dB ~; A · Phase Is The Sound 177° 66/66 dB; A · Phase Ensemble 230° 24/8 dB; A · Shifted Cellos 185° 23/6 dB; A · Phase Tremolo Strings 143° 29/12 dB ~; A · Phase Viola 5° 16/14 dB; A · Phase Brass 168° 17/17 dB; A · Shifted Horns 104° 30/30 dB; A · Phase Stab 78° 26/26 dB; A · Phase Clarinet 36° 10/7 dB; A · Phase Pluck 157° 20/20 dB; A · Shift Harp 14° 19/15 dB; A · Phase Bells 44° 98/68 dB; A · Phase Mallet 84° 13/10 dB; A · Phase Scanner 157° 86/68 dB ~; A · Phase Glitch 64° 93/63 dB ~; A · Phase Hat 123° 32/32 dB; A · Phase Snare 14° 23/23 dB.

**Engine** (web and plug-in, bit parity kept): `sourceCycle(wave, width, phase)`; the phase sets of LFO 2 → PHASE (`PHASE_K = 12`,
`phaseModNeeded`, `renderTable`); the C++ engine matches the web engine on all 253 presets and 14 LFO 2 / phase variants
(worst 3.35e-7, on A · Space Choir Shift, whose long reverb gathers float rounding; 2.38e-7 elsewhere). Cost of LFO 2 → PHASE
(measured): 12 table sets per engine-A sound, 12.4 MB instead of 1.0 (24.8 MB with WAVELET MORPH); a table build of 38 ms in
the plug-in and 77 ms in the web app instead of 3 and 8 ms (68 / 159 ms with the morph); about 1.5 times the voice CPU.
Nothing of this when LFO 2 does not move the phase.

**Acknowledgments**
- Thanks to Jérémie Palmigiani (aka Soul Machine) and Flo (aka Go Tiger) for testing the synth and providing valuable
  feedback and improvement suggestions.
- Thanks to Arnaud Grignard for the technical review of the concept.

## beta 0.3 for macOS — 2026-10-17

**The first Mac version**: the beta 0.3 plug-in as a **VST3 for macOS 10.13 or later**, one universal binary for **Apple
silicon and Intel** Macs (Ableton Live, Cubase, Bitwig Studio, Reaper, Studio One…; not Logic Pro or GarageBand, which load
only Audio Units). Same sound, panel, 153 presets, preset browser, SAVE PRESET / DELETE / user bank and
`OKTOWAVE presets.txt` file as the Windows beta 0.3, which is not changed (its release stays as tested).
- **Install**: copy `WaveletSynthesizer.vst3` into `~/Library/Audio/Plug-Ins/VST3` (your own folder: the presets file is
  written next to it). The plug-in is signed "ad hoc" (no paid Apple developer certificate): macOS blocks it once; one
  Terminal line or *Privacy & Security → Open Anyway* allows it (`INSTALL-mac.txt` in the zip).
- **On a Mac**: Cmd-click (or double-click) resets a knob, Shift-drag adjusts finely, Control-click (or right-click) on the
  preset name opens the preset menu; the window sizes (70–150 %) are in points, so the panel is sharp on Retina screens.
- **Code**: the editor is now shared by both systems — `editor.cpp` draws the panel through `editor_platform.h`;
  `editor_win.cpp` keeps the Windows window (GDI+) unchanged, `editor_mac.mm` draws it with Core Graphics and Core Text.
  `platform.h` holds the file and folder calls of both systems. The Windows plug-in built from this code passes the same
  tests as the released one (VST3 host 254/254, presets library 37/37, VST2 38/0; its editor screenshots are identical).
- **Tests**: GitHub's Macs build the plug-in on every push (`.github/workflows/mac.yml`), check that its sound equals the
  web engine's on both architectures (153 presets + 9 LFO 2 variants, worst difference 2.38e-7, as on Windows) and run
  `tests/machost`, a small macOS host: notes, states, the editor's screenshots, mouse (browser, engine tab, knobs, HIDE),
  the menus, and SAVE PRESET / TO BANK / DELETE with their windows answered.

## beta 0.3 — 2026-10-17

**In short**
- **Presets**: **153 factory presets** (46 new). The new ones are OktoPierre's best candidates from his listening test of
  150 new sounds: every preset he rated **7 to 10 stars out of 10**, with the changes he recorded while listening. In each
  category they come **first, the best rated first**; his 15 favourites stay at the top of the list.
- **Sound engine**: new **WAVELET MORPH** — a second wavelet and a crossfade between the two, set by a knob, moved by the
  LFO or by the mod envelope — and a second LFO, **LFO 2**, on any parameter of the SCALE FILTER or the POSITION window.
- **Plug-in**: a **preset browser** at the right of the panel (TOP Sounds and the sound types, one click loads a sound,
  can be hidden), **SAVE PRESET** to adjust a factory preset (and rename it), **DELETE** to clear out the presets you do
  not want, **▲ ▼** to reorder every list, and a **user bank**; all of it in one readable text file, `OKTOWAVE presets.txt`,
  kept when Live is closed and read back to make the next version. The panel's name reads **OKTOWAVE** · Wavelet
  Synthesizer.

**WAVELET MORPH**
- The sound is also built with **WAVELET 2** and crossfaded with the main one, per voice: **MORPH** (0 % = WAVELET,
  100 % = WAVELET 2) + LFO × **LFO→WAVELET** + mod envelope × **ENV>WAV**. It is heard where the wavelet shapes the sound:
  the scale filter (CUTOFF, RESO), SPARSITY, the POSITION window, and all of engine B.
- Panel: WAVELET 2, MORPH and ENV>WAV in the engine A section (the atom display is a little smaller), LFO→WAVELET in the
  LFO section.
- Compatibility: four parameters appended (WAVELET 2, MORPH, LFO→WAVELET, ENV>WAV, default 0): presets, user presets and
  Live Sets saved before sound exactly as before (bit-identical: the WAVELET 2 tables are only built when the morph can
  move away from WAVELET).

**New presets** (★ = OktoPierre's vote, * = changed by him while listening; levels matched to the favourites):
Bass (5): A · Deep Saw Bass 8★*, A · Wave Morph Bass 8★, A · Acid Line 7★*, A · Fat Unison Bass 7★*, A · Wave Wobble Bass 7★*; Lead (7): A · Screaming Lead 9★, A · Wave Attack Lead 9★, A · Wave Pulse Lead 9★*, AB · Duo Lead 8★, B · Flute Lead 8★, A · Wave Window Lead 8★, A · Wave S/H Lead 7★*; Keys (2): A · Dyno Keys 9★, AB · Wurli Bark 8★; Organ (3): B · Theatre Organ 9★, AB · Gospel Mix Organ 8★, B · Full Drawbar Organ 7★; Pad (7): A · Noise Wash Pad 9★*, B · Choir Pad 8★*, AB · Glass Choir 8★*, A · Sweep Pad 7★, A · Analog Brass Pad 7★, A · Wave Morph Pad 7★, AB · Wave Atom Choir 7★*; Strings (8): A · Solo Violin 9★*, A · Cello Section 8★, AB · Silk Strings 8★, A · Spiccato Strings 8★, A · Shimmering Strings 8★*, A · Ensemble Strings 7★, B · Vox Strings 7★, A · Wave Tremolo Strings 7★*; Brass & Wind (3): A · Wave Brass 8★*, A · French Horn 7★, A · Brass Section Stab 7★; Pluck (1): A · Steel Pluck 7★*; Bells & Mallets (1): B · Xylophone 7★; FX (9): A · Wave Robot 10★, A · Siren Sweep 9★*, A · Wave Riser 9★*, A · Wave Laser 9★*, B · Wave Random Computer 7★, A · UFO 7★, A · Wave Atom Scanner 7★*, B · Wave Reverse Bands 7★, A · Wave Glitch Morph 7★*.

**LFO 2** (both products)
- A second free-running LFO in its own card next to CHORUS: SHAPE (the five shapes of LFO 1), RATE (0.05–20 Hz), AMOUNT
  (±100 % = ± half the target's range: ±6 bands of CUTOFF, ±180° of POSITION…) and the TARGET menu next to its title:
  CUTOFF, SLOPE, RESO, KEY TRK, ENV AMT, VEL AMT, POSITION, WIDTH or DEPTH. The on-screen keyboard is a little narrower
  (still C2–C7).
- Compatibility: four parameters appended (AMOUNT 0 by default): older presets and Live Sets sound exactly as before.

**Knobs with few positions** (both products): SUB OCT and the SHAPE knobs move with a short drag (24 px per step), and a
click goes to the next value.

**Presets in the plug-in**
- **Preset browser**, at the right of the panel: FACTORY and USER BANK tabs; the sound types with their count — first
  **TOP Sounds** (OktoPierre's 15 favourites, then the sounds he rated 8 to 10) — and the sounds of the type selected (a
  click loads one; engine letters, ★ for a favourite, his vote, "ADJ" for an adjusted preset). ▲ ▼ move the sound playing
  in its list. Buttons TO BANK…, RESTORE, DELETE, EXPORT…, FILE. **HIDE** folds it away (the window gets narrower); a
  click on the preset name brings it back; a right-click opens the classic menu. Live Sets remember whether it is open.
- **SAVE PRESET** (left of MANUAL A) overwrites the preset playing: a factory preset is **adjusted** in place (a small
  window proposes its name, which can be changed; RESTORE brings the original back), a sound of the user bank is
  replaced.
- **DELETE** takes a factory preset out of the lists and the ◀ ▶ arrows (the menu's "Deleted presets" brings it back).
- **User bank**: your own sounds in 12 sections (Bass … Bells & Mallets, **Chords**, FX, Drums & Perc), empty at first.
- **One text file**, `OKTOWAVE presets.txt`, next to the `WaveletSynthesizer.vst3` folder (kept when a new version
  replaces that folder), shared by every instance and read back when Live opens again: every factory preset ("Adjusted:
  yes" with its name now, "Deleted: yes"), the order of every list ("LIST ORDER"), and the user bank — each sound as the
  parameters that differ from the defaults. EXPORT… writes a copy. A folder that cannot be written (the VST3 system
  folder needs administrator rights) gives a clear message. The user bank of the first beta 0.3 build is taken over.

**Panel**: the name at the top left reads **OKTOWAVE** · WAVELET SYNTHESIZER (the plug-in keeps its name in Live).

**Web app** (update of 2026-10-17): the same **preset browser** as the plug-in at the right of the panel — TOP Sounds and
the sound types, ★ favourites and votes, FACTORY / USER PRESETS tabs, HIDE — to select sounds only (saving stays in the
status bar). The panel itself keeps its 1100 × 720 layout; "#nobrowser" in the address leaves the browser out.

**Plug-in**: version 0.3.0 everywhere (VST3 class info and DLL version info agree).

**How to cite**: the code has a DOI on Zenodo, https://doi.org/10.5281/zenodo.23431760 (record
https://zenodo.org/records/23431760): README "How to cite", `CITATION.cff` (GitHub's "Cite this repository") and the
manuals' "About" section.

**Quality**: C++ = JavaScript within 2.38e-7 on the 153 presets and on LFO 2 driving each of its 9 targets; VST3 host
suite (its editor clicks now scale from the window height: the browser makes the window wider), VST2 smoke test,
`vst/devtest/bank_session.cpp` (the browser, SAVE PRESET, RESTORE, DELETE, ▲ ▼, the user bank, the presets file read
back after the plug-in is reloaded), web app suites.

## beta 0.2 — 2026-10-15

**In short**
- **Sound engine**: the two engines can now be **mixed** (new A/B MIX knob: subtractive engine A, additive engine B, or both together in one sound), and a new **triple chorus** gives the wide, lush ensemble sound of 1970s string machines.
- **Presets**: **107 factory presets** instead of 32 (75 new), **organised by type** like a hardware synthesizer — Bass, Lead, Keys, Organ, Pad, Strings, Brass & Wind, Pluck, Bells & Mallets, FX, Drums & Perc — with OktoPierre's 15 favourite sounds at the top of the list.
- **Demo** (web app): starts straight on the music's first fast phrase, on the Clarinet.

**Engines A and B mixed**
- New **A/B MIX** knob (at the right of both engine sections): engine A alone, engine B alone, or both at once (linear crossfade, smoothed over 20 ms). Each voice then renders engine A's filtered source and engine B's atoms at the same pitch, through the same envelopes, scale filter, position window and effects; the sub oscillator is added once.
- The **A · SUBTRACTIVE / B · ADDITIVE** tabs now only choose the panel shown; switching them neither changes the sound nor marks the preset as modified.
- Compatibility: presets, user presets and Live Sets saved with beta 0.1 get A/B MIX = their engine and sound exactly as before (the 32 beta 0.1 factory presets render bit-identically).

**Triple chorus (string machine)**
- New **CHORUS** section (amount, RATE, DEPTH) next to the SUB OSC: three delay lines (6–12 ms) swept by a slow and a fast LFO (about 9.7 × the rate), 120° apart, spread left / centre / right; after DRIVE, before DELAY and REVERB. The keyboard is a little narrower to make room (still C2–C7).

**Presets by category**: 107 factory presets (75 new), organised like the banks of a hardware synthesizer. OktoPierre's 15 favourite sounds stay first, in his order; all the others follow by category: Bass (15), Lead (11), Keys (10), Organ (8), Pad (17), Strings (8), Brass & Wind (8), Pluck (7), Bells & Mallets (7), FX (8), Drums & Perc (6), Init (2).
- With the chorus: A · String Machine, A · Solina Cellos, A · Poly Chorus Pad, A · Chorus Square Lead, B · Ensemble Organ, B · Glass Ensemble, B · Chorus Flute. With the sub oscillator: A · Sub Saw Bass, A · Reese Sub, A · Acid Sub, A · Deep Sub Pluck, B · Sub Organ Bass. Mixing both engines ("AB · …", shown in both engine colours): Hybrid Strings, Dream Pad, Bell Pad, Wavelet Choir, Hybrid Keys, Organ Lead, Space Strings, Sub Hybrid Bass, Glass Keys, Wide Brass, Chip Hybrid, Shimmer Pluck.
- A library by category: A · Ladder Bass, B · Pluck Bass, AB · Wobble Bass, A · Rubber Bass, A · Octave Bass; A · Saw Lead, A · Whistle Lead, A · Pulse Lead, AB · Hybrid Lead; A · Tine Piano, AB · Electric Piano, B · Reed Piano, A · Clavi, B · Toy Piano, A · Lo-Fi Piano; B · Jazz Organ, B · Gospel Organ, B · Church Organ, B · Reed Organ, B · Flute Organ; A · Analog Pad, A · Dark Pad, B · Halo Pad, AB · Evolving Pad; A · Chamber Strings, A · Pizzicato, A · Slow Strings, AB · Analog Strings; A · Synth Brass, A · Brass Stab, B · Clarinet, AB · Breathy Flute; A · Harp, B · Koto, A · Synth Pluck, AB · Arp Pluck; B · Glockenspiel, B · Vibraphone, B · Marimba, B · Tubular Bells, AB · Crystal Bell; A · Wind, B · Sci-Fi Burble, AB · Robot Voice, A · Alarm; AB · Sub Kick, A · Noise Snare, A · Closed Hat, A · Open Hat, B · Wood Block, A · Synth Tom (the drums are pitched: play them on different keys). Levels matched to the favourites.
- Preset menus: in the web app ★ FAVOURITES on top, then one folding group per category (with its number of presets), then the user presets; in the VST the favourites on top and one submenu per category. ◀ ▶ and Program Change follow the same order. Live Sets keep their preset (stored by name).

**Demo**: the default demo now starts with the phrase that follows the opening chords of the *Appassionata* (7.8 s cut, 1:59 instead of 2:07), opening on "B · Clarinet"; then a new preset about every 4 s on a change of chord: OktoPierre's favourites, then presets showing the chorus, the sub oscillator and the mix of both engines. The demo's preset sequence is written out, so new presets do not change it.

**Quality**: the C++ engine matches the JavaScript reference within 2.4e-7 for all 107 presets; test expectations updated for the A/B MIX (VST host) and the new tour (demo test). `CLAUDE.md` describes the architecture for maintenance and code reviews.

## beta 0.1 — 2026-10-14 (first release)

**Products**
- Web application (`web/index.html`, vanilla JavaScript + Web Audio AudioWorklet, works from file://).
- VST3 and VST2 instrument for Ableton Live on Windows x64 (`build/WaveletSynthesizer.vst3`, one self-contained DLL with both entry points and a native Win32/GDI+ editor; the folder can be copied into a VST3 folder or a VST2 folder).
- User manuals A (Wavelet Subtractive) and B (Wavelet Additive), also bundled inside the VST3.

**Sound engine**
- Engine A, Wavelet Subtractive: 6 source waves, 7 wavelets (Haar, Daubechies 2/4/8/20, Symlet 8, Coiflet 3), sparsity, scale filter (LP/HP/BP/BR, cutoff 0–12 bands, slope, resonance, key tracking), position window.
- Engine B, Wavelet Additive: 6 atom patterns, 11 drawbars, tilt, per-band scale envelope.
- Sub oscillator (sine / triangle / square, −1 or −2 octaves) for extra low end.
- Shared: amp and mod envelopes, LFO, 16 voices with mono/legato, polyphonic portamento (Off / Poly / Legato only, Poly by default: every voice glides from its own previous note; Legato glides from the held note) with glide time, unison, saturation, ping-pong delay, reverb, DC blocker, soft limiter.
- Band-limited (alias-free) playback; the C++ engine matches the JavaScript reference within 2.4e-7.

**Presets**: 32 factory presets (17 for engine A, 15 for engine B), from clean sounds to heavy effects, ordered with OktoPierre's 15 favourite sounds first (Square Mod 2, Wavelet Lead, Haar Bass, Edge Pluck, Focus Sweep, Soft Flute, Infra Sub Bass, Dub Echo Lead, Fuzz Bass, Laser Sweep, Warm Pad, Mirror Sub Bass, Sparse Keys, Space Choir, Square Mod), then the others alternating A / B and the two Init presets last (the order of the DEMO preset tour too; the VST3 stores the preset shown in its browser by name, so Live Sets saved with the earlier order show the right preset), including "B · Mirror Sub Bass", "A · Square Mod" and "A · Square Mod 2" by OktoPierre; the app and new plugin instances open on "A · Warm Pad".

**Web app extras**
- ▶ DEMO plays Beethoven's *Appassionata* (III) with a tour of all the factory presets (a new preset about every 4 s, on a change of chord, shown in the preset browser: "A · Warm Pad" on the opening chords with its filter cutoff opening, then "A · Wavelet Lead", then the other presets in menu order, favourites first, without "A · Square Mod"); the ▾ menu offers J. S. Bach *Toccata in D minor* and seven virtuoso Beethoven piano works (*Appassionata* III, *Moonlight* III, *Rage over a Lost Penny*, Symphony No. 5 I in piano reduction, *Pathétique* I, *The Tempest* I, Sonata Op. 111 I; MIDI from the Mutopia Project, public domain except *Moonlight*: CC BY-SA 2.5, Stewart Holmes), or your own MIDI file, with animated parameters explained in a small window.
- Computer keyboard (digits 1–0 = C D E F G A B C D E, letter rows chromatic), Web MIDI, user presets (save / export / import).
- Online on GitHub Pages (https://pierrearnaudguyot.github.io/Free-Wavelet-Synthesizer-VST/). MIDI for hardware without a DAW: input channel selector (all or 1–16), Program Change selects a preset, MIDI learn (right-click a control, move a controller knob; Esc cancels, Delete unlinks; kept in the browser).

**Quality**
- Independent test suites (`tests/`): VST3 test host (DAW-like call order, state, automation, offline rendering, editor), browser tests (UI, audio, presets, demo).

**Licence**: free software under the GNU General Public License v3 or later (`LICENSE`), Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre). The panel credit, the manuals, the DLL version information and every source file carry the notice; the plugin bundle contains the licence texts. The demo music keeps its own licences (see `tools/demo/SOURCE.md`).

**Security fixes** (code review of 2026-10-14)
- Oscillator: a fundamental above the sample rate (e.g. note 127 with OCTAVE +2, or notes from G8 up with OCTAVE +3) made the VST read outside its wavetable and crash the host; in the web app it made the sound NaN until reload. The phase now always stays inside the cycle, and voices (and the sub oscillator) whose fundamental is above Nyquist are silent. Normal playing is bit-identical.
- MIDI file reader (web "Load a MIDI file…"): lengths read from the file are limited to the data really present, so a damaged or hostile file can no longer freeze the page; tempo lookup is now fast for files with many tempo changes.
- VST3 message attributes: null arguments and too-small string buffers from the host are rejected.
- `vst/install.bat`: the folder path is no longer pasted into an administrator command line (the elevated step runs the same file again), so folder names containing `'`, `&` or parentheses are safe.
