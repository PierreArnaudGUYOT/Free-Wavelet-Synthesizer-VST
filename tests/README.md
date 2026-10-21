# Okto MultiWave Synth - test tooling

These are independent test tools for the two products: the VST3 instrument (`vst/` -> `build/OktoMultiWaveSynth.vst3`)
and the web app (`web/index.html`). They don't use any product code: the VST host is written against the
VST3 `pluginterfaces` headers only, and the web driver talks to Edge directly over the Chrome DevTools Protocol.

```
tests/
  quick.js       the 20-second check to run after every change (syntax, generated files, engine, VST3 host sections, web app)
  regress_v07.js the 22 TOP Sounds against the published Wavelet Synthesizer beta 0.7 engine (tests/ref/v07/), within 2.1e-7 (one note, then two notes over its release: up to three voices)
  idle_skip.js   the engine's idle rule, the smoothing at other sample rates, hostile velocities
  vst3host/      VST3 test host (C++, llvm-mingw, static exe)
    host.cpp, host_util.h, host_objects.h, build.bat
    check_params.js          params.csv  <->  tools/spec.js
    selftest/                reference plug-in used only to validate the host
  web/           headless-Edge tests for the web app
    cdp.js, png.js, smoke.js, test_web.js, test_demo.js, selftest_cdp.js, dummy/index.html
```

**Status for Okto MultiWave Synth beta 0.2.** Maintained and passing: `quick.js`, `supermod.js` (the SuperModulation destinations, BASS and the chord that follows the left hand, the oriental tunings), `regress_v07.js`, `idle_skip.js`, `web/smoke.js`
(the four oscillator views and CHORD MODE), `web/test_web.js` (about 10 minutes: it plays all 522 presets) and `web/test_demo.js`,
`tools/dsp_selftest.js` (12 sections), the C++ cross-check (`tools/dsp_compare.js` + `vst/devtest/dsp_render.cpp`, 577 cases) and the
developer checks `vst/devtest/vote_session.cpp` (the plug-in's window: folder tabs, CHORD MODE, the LFO 2/3 tabs and the oriental colours, fit to the screen, preset browser and its stars), `library_test.cpp` (the
presets file) and `vst2_smoke.cpp`. The VST3 host below is the Wavelet Synthesizer's: with `--skip-editor` its sections params, audio, state, offline, presets, sub,
porta, stress, instances and sync pass (190 checks); its controller-state section (beta 0.1 WSC1 projects, presets left out in beta 0.5, `A · Reese Sub`…)
is the Wavelet Synthesizer's and fails on its first check. **Not ported** (they drive the Wavelet Synthesizer's browser, screenshots and presets, or the macOS build, which
this version does not make): `vst/devtest/bank_session.cpp`, `tests/machost`, the editor and reload sections of the VST3 host.

Requirements: Windows x64, `%USERPROFILE%\tools\llvm-mingw` (or set `CXX`), Node.js >= 22 (it has a
global `WebSocket`), and Microsoft Edge (or set `EDGE_PATH`). No npm packages and no admin rights are needed.

---

## 1. VST3 host: `tests/vst3host/vst3host.exe`

### Build

```bat
tests\vst3host\build.bat
```

This compiles `host.cpp` plus `vst/external/pluginterfaces/base/funknown.cpp` into a statically linked
`vst3host.exe` (no extra DLLs needed). `host.cpp` defines `INIT_CLASS_IID`, which instantiates every interface ID
in that one translation unit.

### Run

```bat
tests\vst3host\vst3host.exe build\OktoMultiWaveSynth.vst3 tests\vst3host\out
```

Usage: `vst3host.exe <bundle.vst3 | dll> <outdir> [options]`

| option | meaning |
|---|---|
| `--sr 48000` / `--block 512` | sample rate and block size for the main renders |
| `--quick` | shorter stress tests (skips block size 1) |
| `--skip-editor` | do not open the editor |
| `--drag x,y` / `--click x,y` | editor points to drag/click, in 1x editor pixels (can be repeated). The default points come from the `tools/spec.js` layout (Cutoff, Amp Attack, Master knobs, Engine A/B selector). |
| `--real-input` | drive the editor with real `SendInput` mouse events (this moves your cursor) instead of window messages |
| `--pace` | pace every render at real time, like DAW playback |
| `--only a,b` | run only these sections: `params,audio,state,offline,experiment,presets,sub,porta,stress,editor,instances,reload` |
| `--presets file` | spec presets exported by `make_presets.js` (default: `presets_spec.txt` next to the exe) |
| `--no-reload` | skip the unload/reload cycle at the end |
| `--timeout s` | hang watchdog (default 90 s) |

Exit code: `0` no FAIL (WARNs allowed), `1` failures, `2` plug-in not loadable, `3` crash/abort, `4` hang, `64` usage.

Outputs in `<outdir>`:
- `report.txt`: the full log, every PASS/WARN/FAIL with details, and a summary at the end.
- `params.csv`: every parameter (id, title, units, steps, default, flags, plain range, display strings).
- `*.wav`: 32-bit float stereo renders, e.g. `a_notes.wav`, `b_params.wav`, `c_silence_*.wav`, `stress_*.wav`,
  `blocks_*.wav`, `sr_*.wav`, `offline_*.wav`, `state_*.wav`, `instance*.wav`.
- `editor_1x.png`, `editor_1.5x.png`, `editor_instance1.png`, `editor_instance2.png`: editor screenshots.
- `crash.dmp` / `hang.dmp`: minidumps, written only if the plug-in crashed or hung.

Before running, export the spec presets once (the presets section uses them):

```bat
node tests\vst3host\make_presets.js
```

Afterwards you can check the reported parameters against the spec:

```bat
node tests\vst3host\check_params.js tests\vst3host\out\params.csv
```

### What the host does (in DAW order, modelled on Ableton Live on Windows)

1. **Module**: checks the bundle layout (`X.vst3/Contents/x86_64-win/X.vst3`); checks the PE file (x64 DLL, exports
   `GetPluginFactory`/`InitDll`/`ExitDll`, imports only system DLLs, so a `libc++.dll` dependency is flagged).
   It then loads the DLL with a clean-machine search path (no `PATH`), calls `InitDll`, `GetPluginFactory`, and
   `IPluginFactory3::setHostContext`.
2. **Factory**: prints factory and class info (PClassInfo/2/W). The sub-categories must contain `Instrument`.
3. **Instantiation**: creates the component, then calls `initialize(hostContext)`. `IHostApplication` creates
   real `IMessage`/`IAttributeList` objects. The host gets the controller class ID, then creates and initializes
   the controller (single-component plug-ins are also supported). It connects both `IConnectionPoint`s
   directly, then does component `getState` -> controller `setComponentState` -> `setComponentHandler`.
4. **Buses**: expects 1 event input, 0 audio inputs and 1 stereo output. Calls `setBusArrangements(stereo)` and
   `activateBus`, then `setupProcessing(realtime, 32-bit)`, `setActive(true)` and `setProcessing(true)`.
5. **Parameters**: prints every parameter. Checks unique IDs, defaults, the string<->value round-trip,
   plain<->normalized consistency and monotonicity, and set/get round-trip. It also checks that host
   `setParamNormalized` never echoes back as `performEdit`.
6. **Units / MIDI mapping**: lists program lists. Checks that pitch bend and mod wheel are mapped through
   `IMidiMapping`, because Ableton has no other way to deliver them to a VST3.
7. **Audio**: `process()` runs on a separate MMCSS "Pro Audio" thread, with a `ProcessContext` (120 BPM, playing).
   Output buffers are pre-filled with a sentinel value, so samples the plug-in never writes are detected.
   Each render reports peak, RMS, DC, NaN/Inf, and per-block process time with real-time CPU %.
   - (a) C4-E4-G4 chord, then single notes MIDI 24..96 (events at odd offsets inside blocks); per-note levels;
     sample-accurate onset; determinism.
   - (b) Engine/Wavelet/Cutoff changes and a Cutoff automation ramp via `IParameterChanges`; each engine alone;
     pitch bend / mod wheel through their mapped parameters.
   - (c) the default patch and an FX patch must decay below -90 dBFS (also checks for denormal CPU spikes);
     double note-on with a single note-off.
7b. **Neutral reference / initial preset**: a new instance starts on `DEFAULT_PRESET`. The host checks that
   both the controller and the processor state hold that preset, then applies every declared default as the
   neutral reference used by the audio tests.
7c. **Factory presets**: every spec preset is applied through the processor (chord + single note). The host
   checks for NaN/Inf, level <= 1.0 and sound, and lists long tails as information.
7d. **Sub oscillator**: energy at f0/2 and f0/4; Sine/Triangle/Square spectra (H3/H1); mono; not affected by the
   filter; square aliasing compared with a reference PolyBLEP square and a naive square; state.
7e. **Portamento**: Off / On / Legato in mono and poly, for separated and overlapping notes (A3 -> E4, Glide
   0.3 s). The test compares energy in the glide band with energy at the target pitch, 70-170 ms after the
   second note.
7f. **Polyphonic portamento (voice allocation)**: 8 voices, Glide 0.4 s.
   - Every voice is first primed with a released far-away cluster (MIDI 100-107), so results don't depend on
     earlier tests.
   - A pluck envelope (sustain 0) makes held notes silent, so each new note's start pitch (first 12 ms,
     autocorrelation) can be compared with the expected source.
   - Cases: Poly melody 60->64->67, each note from the previous one. Poly chord change C-E-G -> F, A, C5: G->F,
     E->A, C->C5. Legato only: no glide after a released note, glide from the held note. Off: each note on its
     own pitch.
   - The same cases run in the web suite through the audio tap.
7g. **Preset parity**: the editor's next-preset arrow is clicked through all presets. Every preset's controller
   values must match `tools/spec.js`, in order.
7h. **Security regressions**:
   - `hinote`: Octave +3 with notes 127 and 115, and Octave +2 with note 127 (also with pitch bend +2), with
     the sub off and on, at 44.1/48/96 kHz, in real time and kOffline. Checks: no crash, finite output; the
     wavetable part silent when f0 >= sr/2; only the sub when it alone is below Nyquist; a normal C4 afterwards.
   - `attrlist`: a host that refuses `IHostApplication::createInstance(IMessage)` makes the plug-in use its own
     Message/AttrList. A pass-through connection proxy intercepts those messages. Then `getString` is called
     with sizes 0/1/2/3/6/64 into a canary-guarded buffer, plus null ids and buffers on every accessor.
8. **State**: `setState(default)` must undo any single parameter change. A full getState -> scramble -> setState
   must give the same audio as before, and the controller must parse the processor state. The host also feeds
   empty, truncated, random and corrupted state blobs and checks for crash/NaN.
9. **Offline**: a render in `kOffline` mode (Ableton export/freeze) right after an Engine change must already
   have the new timbre.
10. **Stress**: random automation (all automatable parameters) while the UI thread changes controller values;
    48 simultaneous notes; fast repeats; block sizes 1/7/64/random/4096; 44.1/48/96 kHz (pitch must not depend
    on the sample rate); activation cycles; `numSamples == 0` parameter flushes.
11. **Editor**: `createView("editor")`, HWND support, `getSize`. The host opens a real top-level window with a
    container child (as Live does), calls `attached`, pumps messages for 1.5 s and captures `editor_1x.png` with
    `PrintWindow(PW_RENDERFULLCONTENT)` and GDI+. It then simulates mouse drags and clicks: the edits must arrive
    as correctly paired begin/perform/end calls, and they must reach the processor (checked via its state).
    Host automation must not echo back. It also checks a live content-scale change through
    `IPlugFrame::resizeView`, and `editor_1.5x.png` (`IPlugViewContentScaleSupport`). The editor is opened and
    closed 5 times while counting GDI/USER handles, threads and memory. Audio keeps playing on the audio thread
    the whole time.
12. **Multiple instances**: duplicate a track (copy the state into a 2nd instance, which must sound identical);
    instances must be independent; both editors open at once.
13. **Teardown**: `setProcessing(false)` -> `setActive(false)` -> disconnect -> `terminate` (controller, then
    component) -> release -> `ExitDll` -> `FreeLibrary`. Then it pumps messages to catch timers left in the
    unloaded code. It checks that host callbacks never came from the audio thread, and that host objects
    (`IMessage`, `IAttributeList`, host context) were all released.
14. **Reload**: load -> instantiate -> render -> editor -> unload, twice. This catches window classes and static
    state that are not cleaned up.

Every call into the plug-in is wrapped with SEH and C++ exception guards: a crash is reported with
`module+offset` and the run continues where possible. A watchdog writes `hang.dmp` if there is no progress.

### Self-test of the host (no product needed)

```bat
tests\vst3host\selftest\build_selftest.bat
tests\vst3host\vst3host.exe tests\vst3host\selftest\build\DummySynth.vst3 tests\vst3host\selftest\out
```

`DummySynth` is a small reference instrument written for this purpose only; it is not the product. The clean
run passes. You can switch on deliberate defects with `set DUMMYSYNTH_BUGS=...` (comma separated) to check that
the host catches them:
`nan, noclear, stuck, audiothread, leakview, shared, noedit, srbug, crash, hang, noscale`.
Each one was verified to produce the matching FAIL/WARN, the crash report or the hang watchdog.

---

## 2. Web app: `tests/web/test_web.js`

```bat
node tests\web\test_web.js                 :: file:///.../web/index.html
node tests\web\test_web.js --quick --out tests\web\out --url <other url> --headed
```

The test uses the page's hook `window.WS_TEST`: `start, noteOn, noteOff, setParam, getParam, paramKeys,
getLevel, presets, loadPreset, openManual, closeManual` (and `allNotesOff` if present).
`tools/spec.js` is the oracle for parameter keys/ranges and preset contents. Steps:

1. Load the page. Any console error, uncaught exception or failed resource is a FAIL. Take screenshots at
   1280x860 and 1920x1080 and check for overflow.
2. `start()`, then idle silence; UI screenshots (`ui_*.png`).
3. Parameters: keys vs spec, ranges, set/get round-trip, clamping.
4. Note C4 (and MIDI 24/96): the level must rise above 0 and return below 0.001 after noteOff + release.
5. All presets: values applied as in the spec, every preset sounds and releases (`preset_NN.png`).
6. Engine A/B (`engine_A.png`, `engine_B.png`).
7. The manual (one page, `manual/manual.html`): the overlay is shown and the page actually loads (`manual_*.png`); `quick.js` checks that it names every card of the panel.
8. Computer keyboard: Digit/Numpad/letter keys play and release, held auto-repeat does not stick, Z/X octave.
9. Mouse on the UI, using spec layout coordinates mapped onto the device element: engine selector, Cutoff drag,
   on-screen keyboard.
10. Random parameter stress (no NaN, no blow-up, silence afterwards).
10c. High notes (Octave +3 note 127/115, Octave +2 note 127, sub on): every recorded sample stays finite, and
    later notes are audible.
10b. Portamento Off / On / Legato (mono and poly), measured on the page's real output through a test-only
    audio tap. The tap wraps `AudioNode.connect` and records what is sent to the destination with a
    ScriptProcessor; the analysis is the same as in the VST host.
11. URL hashes `#noaudio` and `#preset=3`.

Outputs: `tests/web/out/report.txt` and PNGs. Exit code `0` pass, `1` failures, `2` page or hook missing (the
test then reports clearly that `web/index.html` does not exist yet).

Option `--no-file-access` launches Edge without `--allow-file-access-from-files`, like a normal browser opening
`file://`. Screenshots are taken at 1124x782, 1280x860 and 1920x1080.

### Demo test: `tests/web/test_demo.js`

```bat
node tests\web\test_demo.js            :: like a normal browser (no file-access flag); --file-access to add it
```

The final version has one demo song (Beethoven, Appassionata III, `WS_TEST.demoSong()`), no song menu and no MIDI file
input (the arrow next to DEMO, the song list and "Load a MIDI file…" were removed). It checks:
- the header: `.demo-btn` is there, and there is no `.demo-arrow`, no `.demo-menu`, no `#file-midi` and no EVALUATE SOUNDS button;
- the demo started from the button while audio is not started, against the agreed preset tour (`WS_TEST.demoTour()`), over the
  whole piece (`--smoke`: up to the 7th preset), and its end ~2.5 s after the last note;
- the exact restore of the parameters and the UI after the end, the header STOP, the window STOP and Esc.

Times are measured inside the page with `WS_TEST.demoState().time`.
- Start by clicking the header button while audio is not started yet; the demo must produce sound.
- Scene index, varied parameter, window text and `hot` control at every sample.
- Ramp, step and drawbar-wave values, and the range each scene covers.
- Keys light up (accent colour, read from the screenshots).
- Playing along: C7, outside the piece's range, is pressed from the computer keyboard.
- No level above 1.0, and the page main thread is not overloaded.
- End of piece / Esc / the window's STOP / the header STOP each restore the exact previous parameter values,
  preset label and idle UI.
- start -> stop -> start, and `demoStart()` while running (it toggles).
- Ctrl+click on a knob resets it to the spec default; a plain click does not.

Option `--smoke` gives a short run of about 1.5 minutes. It checks the button (no arrow, no menu), the demo started
from the button with audio not started and stopped with the header STOP (restore of the untouched startup preset),
then a start on a modified preset stopped with Esc (exact restore), and the audio lifecycle.

Outputs: `tests/web/out_demo/report.txt` and screenshots (`demo_t008.png` ... `demo_playalong_C7.png`).

### Silent and leak-free browsers

Every Edge launched by `cdp.js` uses `--mute-audio`: pages still render audio (AudioContext, AudioWorklet,
`getLevel()` and the audio tap all work), but nothing reaches the speakers.

Each browser is killed with its whole process tree by `close()`. The same clean-up runs on process exit,
Ctrl+C and uncaught errors, and a launch that fails half-way kills its browser. `close()` waits until no
process with the run's temporary `ws-edge-*` profile is left. `openTab()` opens a second tab in the same
browser; the demo suite uses it to test the one-tab-plays-at-a-time audio lifecycle.

The demo suite (`test_demo.js`) also checks:
- the button: `.demo-btn` plays the demo (no arrow, no menu);
- the demo is a preset tour (`TOUR` of tools/spec.js, the first two entries are not heard), starting at the third;
- the values forced or capped during the tour;
- the preset label during demos;
- the audio lifecycle with two tabs: starting tab B pauses tab A and shows the overlay, 'Click to play here'
  takes the audio back, and pagehide closes the AudioContext and stops the demo.

### Driver library: `tests/web/cdp.js`

`Browser.launch({width, height})` starts headless Edge with `--remote-debugging-port`, a temporary profile,
`--autoplay-policy=no-user-gesture-required` and `--allow-file-access-from-files`. Helpers: `navigate`,
`evaluate` (awaits promises), `waitFor`, `setViewport`, `screenshot(file, {width, height})`, `click`, `drag`,
`mouse`, `key`/`keyDown`/`keyUp` (with `code`, e.g. `Digit1`), `errors()`/`warnings()` (collected from
`Runtime.consoleAPICalled`, `Runtime.exceptionThrown` and `Log.entryAdded`), and `close`.

Self-test against a dummy page:

```bat
node tests\web\selftest_cdp.js
node tests\web\test_web.js --url file:///C:/path/to/Wavelet%20Synthesizer/tests/web/dummy/index.html --out tests\web\out_dummy --quick
```
