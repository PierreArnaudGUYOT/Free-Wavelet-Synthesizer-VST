# CLAUDE.md — Wavelet Synthesizer: architecture and maintenance guide

Wavelet Synthesizer is a polyphonic synthesizer based on the discrete wavelet transform, created by Pierre Arnaud GUYOT
("OktoPierre"), GPL-3.0-or-later. It ships as a **web app** (plain JavaScript, Web Audio AudioWorklet, no dependency)
and a **VST3 / VST2 instrument** for Windows x64 (one self-contained DLL, native Win32/GDI+ editor). Both run the same
engine, panel layout and presets. This file explains how the code is organised and the rules that keep the two
products identical. Read it before changing the DSP, the parameters or the presets.

## 1. Repository map

| Path | Role |
|---|---|
| `tools/spec.js` | **Single source of truth**: app metadata, parameters, panel layout, factory presets and their order. |
| `tools/gen_spec.js` | Generates `web/js/spec.js` (`WS_SPEC`) and `vst/src/generated/spec.h` (`kParams`, `kPresets`, layout tables) from `tools/spec.js` + `tools/wavelets.json`. Never edit the generated files. |
| `tools/wavelets.json` | Wavelet filter coefficients (generated with PyWavelets, MIT). |
| `web/js/core.js` | **Reference DSP** (`WSCoreFactory(SPEC)`): transforms, table building, `Engine`, formats. |
| `vst/src/dsp.h` | **1:1 C++ port** of `core.js` (same algorithm, same operation order). |
| `web/` | Web app: `index.html`, `css/synth.css`, `js/{spec,core,worklet,ui,app,demo,midi,demo_data}.js`, `manual/` (generated). |
| `vst/src/` | Plugin: `plugin.cpp` (VST3 processor, controller, factory), `editor.cpp` (GUI), `vst2.cpp` (VST2 entry point), `common.h`, `iids.cpp`, `version.rc`. |
| `vst/external/pluginterfaces/` | Steinberg VST3 interface headers (MIT, licence kept). No other SDK code is used. |
| `vst/build.bat`, `vst/install.bat` | Build with the portable llvm-mingw toolchain (`-static`); install to the VST3 system folder (elevated, path never pasted into a command). |
| `vst/devtest/` | Developer checks: `dsp_render.cpp` (C++ renders for the JS cross-check), `vst2_smoke.cpp` (VST2 host-like test). |
| `tools/dsp_compare.js`, `tools/dsp_selftest.js` | C++ ↔ JS comparison; JS engine self-test. |
| `tools/make_demo.js`, `tools/midi.js`, `tools/demo/` | Demo songs: MIDI files (+ `SOURCE.md` licences) → `web/js/demo_data.js`. |
| `tools/manual/` | Manual generator (`build.js`, `engA.js`, `engB.js`, `shared.js`, `lib.js`, `figs.js`, `shots.js`). |
| `tests/` | Independent test suites (see §8) and `tests/quick.js`. |
| `index.html`, `.nojekyll` | GitHub Pages home: redirects to `web/index.html`. |

## 2. The specification (`tools/spec.js`)

- **Parameters** (`add(key, name, short, {curve, fmt, min, max, def, structural, hidden, choices})`).
  The array order **is the VST3 ParamID**: *append only, never reorder or delete* — saved Live Sets and automation
  depend on it. `structural: true` means "rebuilds the wave tables" (see §3.4). `hidden` = bend, mod wheel, sustain
  (driven by MIDI, not shown on the panel).
- **Curves** `lin | exp | pow2 | int | choice` map normalized 0..1 ↔ plain values (`toPlain` / `toNorm`, identical in
  JS and C++). **Formats** (`fmt`) give the display text; adding a format means updating `FMTS` in `gen_spec.js`,
  `format`/`parse` in `core.js` and `formatValue`/`parseValue` in `dsp.h`.
- **Layout**: sections (cards) with widgets in panel coordinates (1100 × 720). Both GUIs (`web/js/ui.js` and
  `vst/src/editor.cpp`) are generated from it. A widget may appear in several sections (the A/B MIX knob is in both
  engine sections; sections with `mode 'A'/'B'` are shown for one engine tab only).
- **Presets**: `PRESET_LIST` (name + sparse values over the defaults; presets added in beta 0.2 carry `cat`, older ones get
  theirs from `CATEGORY_OF`), then the factory order `PRESETS`: `FAVOURITES` (OktoPierre's 15, in his order) → every
  other preset grouped by category in the order of `CATEGORIES` (Bass … Drums & Perc, Init last). Generated as
  `cat` per preset plus `CATEGORIES` / `FAVOURITES` (web) and `PresetDef::cat` / `kNumFavourites` (C++).
  Menus: web `presetList()` groups ★ FAVOURITES + one folding group per category + USER PRESETS (`ui.js`
  `togglePresetMenu`); VST `editor.cpp presetMenu` = favourites + one submenu per category (relies on the categories
  being consecutive after the favourites). ◀ ▶, Program Change and VST programs follow the flat factory order.
  The VST stores the preset by name, so reordering never breaks saved Live Sets.
  Names start with `A · `, `B · ` or `AB · ` (both engines mixed); the UI colours those letters.
  Presets without `ab_mix` get `ab_mix = engine` (compatibility rule, §3.3). `DEFAULT_PRESET` is the opening sound.
  beta 0.3: presets from OktoPierre's listening test carry `stars` (his vote, 7–10); inside each category the list is
  sorted by `stars` (stable sort: the best voted first, equal votes and older presets keep their list order).
  Values are validated against the ranges at generation time; preset values are stored as doubles in both products.

## 3. The sound engine

### 3.1 Transform and tables
- One cycle = `N = 2048` samples. A periodic orthogonal DWT splits it into `NB = 11` detail bands; band *b* holds
  roughly harmonics 2^(b−2)…2^(b−1). Each band is resynthesised (inverse DWT of that band only) into a **layer**;
  engine A adds a `DRY` layer (the whole source) → `NL = 12` layers.
- Layers become **band-limited mip tables** (`NMIP = 11` levels, level *m* keeps harmonics 1…1024≫m) through an FFT,
  stored interleaved (`TW = (N+1)·NL` floats per level, one guard sample). A voice picks the mip level from its highest
  frequency so nothing aliases below `fmax`.
- **Engine A (subtractive)**: `sourceCycle` (saw, square, pulse, triangle, sine, noise) → DWT → `sparsify` (keep the K
  largest atoms) → layers. Per voice, `filterGains` gives one gain per band (low/high/band-pass/reject in *bands*, slope,
  resonance, key tracking, envelope, velocity); the **position window** (`windowValue`) cross-fades dry ↔ filtered
  inside part of the cycle.
- **Engine B (additive)**: `patternCoeffs` (ramp, mirror, alternate, Walsh, impulse, random) writes the atoms; each
  band layer is peak-normalised. Per voice: drawbars × tilt × per-band **scale envelope**, through the same scale
  filter, normalised by max(1, Σ drawbars).

### 3.2 Voices (`Engine.control`, `renderVoice`, `block`)
- Control rate `CTRL = 32` samples: `control()` updates pitch (glide, octave, fine, bend, LFO, mod wheel), mip level,
  band gains (ramped per sample inside the block), envelopes of engine B bands and the window.
- `renderVoice()` renders unison copies (≤ 4, detuned and panned), the amp envelope per sample, and the **sub
  oscillator** (sine / triangle / PolyBLEP square, −1 or −2 octaves, unfiltered). It never mutates the voice: the end
  state goes to `endLevel/endStage/endPhase/endSubPhase` so that several renders of the same voice (table crossfade,
  A/B mix) start from the same state; `block()` commits it.
- Safety: the phase is wrapped with `x -= floor(x)` (a step can exceed one cycle), voices whose fundamental is above
  Nyquist are silent, notes are bounded 0–127.
- Polyphony 1–16 (mono = legato with last-note priority); portamento modes Off / Poly (each voice glides from its own
  last pitch, glide-aware voice allocation) / Legato only.

### 3.3 A/B MIX (beta 0.2)
- `ab_mix` 0 = engine A only, 1 = engine B only, in between both. **The `engine` parameter is only the panel shown**
  (it still exists for compatibility and display; it is structural only so that displays rebuild).
- `tableNeeds(params)` → bit 0 = A needed (`mix < 1`), bit 1 = B needed (`mix > 0`). `buildTables(params, true)` builds
  only what is needed; when both are, the panel's engine is the main set and the other is `alt` (JS `{mode, mips, rms}`,
  C++ `Tables::altMips/altRms`, `TableRef::alt*`). `buildTables(params, false)` (displays) always builds the panel's
  engine.
- `renderSet()` renders the main set with gain (1−mix) for A or mix for B, then the alt set with the complement, the
  sub oscillator once. The mix is smoothed per block (20 ms) and ramped per sample. With a single set the gain is
  exactly 1 and the code path is the beta 0.1 one (**bit-identical** sound for old presets).
- Rebuild only when `tableNeeds` changes (web `setParam`, VST `process`: `mixEnds`).
- **Compatibility**: everything saved before beta 0.2 lacks `ab_mix` → it gets `ab_mix = engine`: in the spec presets,
  in the web `applyKeyed` (user presets, imports), in the VST `readState` (processor state and controller sync).
  Switching the engine tab never marks a preset as modified (web `setParam`, VST `performEditPlain`, `exactPreset`).

### 3.3b WAVELET MORPH (beta 0.3)
- Parameters `wav2` (structural), `wmorph`, `lfo_wav`, `env_wav` (appended; all default 0). `morphNeeded(params)` =
  (`wmorph > 0 || lfo_wav > 0 || env_wav ≠ 0`) and `wav2 ≠ wavelet`. Then `buildTables` also builds the whole sound
  (`buildSound`, with its own alt set when A and B are mixed) with `wavelet = wav2`: JS `tb.w2 = {mode, mips, rms, alt}`,
  C++ `Tables::w2*` / `TableRef::w2*`.
- Per voice, `control()` computes the morph position `clamp(wmorph + lfo_wav·lfo + env_wav·mod, 0, 1)` at the end of the
  block (`wm1`, from `wm0`); `renderMorph` renders the main set with share 1 − wm and the WAVELET 2 set with share wm
  (`renderSetK`, ramped per sample, sub oscillator only once). Without WAVELET 2 tables `renderMorph` is exactly
  `renderSet`: **bit-identical** sound when the morph is off.
- Rebuild when `morphNeeded` changes: web `setParam`, VST `process` (`morphEnds`: one of the three amounts leaves or
  reaches 0; `wav2` is structural).

### 3.4 Table rebuilds
- Structural changes rebuild tables **off the audio thread** and switch with a 512-sample crossfade (`setTables`).
- Web: `app.js` throttles builds (45 ms) on the main thread and transfers the arrays to the worklet (`'tables'` message).
- VST: `Processor` owns 4 `Tables` sets with states `kFree/kBuilding/kPending/kActive`, a worker thread builds them
  (`structVersion` / `builtVersion`), the audio thread picks up `pendingIdx` and recycles released sets. In **offline
  rendering** (`kOffline`) the rebuild is synchronous so exports never depend on thread timing.

### 3.5 Effects and output (`block`)
Voices → **drive** (tanh) → **triple chorus** (beta 0.2: three 6–12 ms delay lines swept by a slow and a fast LFO 120°
apart, L / C / R, on the mono sum) → **ping-pong delay** → **reverb** (Freeverb topology) → 10 Hz **DC blocker** →
master volume (smoothed) → **soft limiter** (`LIMIT_T = 0.7`, never above 0 dBFS). `VOICE_GAIN = 0.4` gives chord headroom.
The C++ side also sets FTZ/DAZ during `process`.

### 3.6 JS ↔ C++ parity (non-negotiable)
`core.js` is the reference; `dsp.h` must follow it operation for operation (same constants, same order of floating-point
operations, Float32 buffers where JS uses `Float32Array`). After **any** DSP change, compile `vst/devtest/dsp_render.cpp`
and run `node tools/dsp_compare.js <dir>`: every preset must match within ~2.4e-7.

## 4. Web app (`web/`)
- `spec.js` (generated) → `core.js` → `worklet.js` (AudioWorkletProcessor; also a sample-accurate **sequencer** for the
  demo) → `ui.js` (`SynthUI`: builds the panel from the layout; knobs, segments, drawbars, canvases, preset menu,
  demo button, MIDI-learn right-click) → `app.js` (parameters, presets, tables, audio lifecycle, MIDI, keyboard,
  manuals overlay) → `demo.js` (demo player) with `midi.js` (Standard MIDI File reader) and `demo_data.js` (generated).
- The worklet code is serialised (`WSCoreFactory.toString()`, `WSWorkletMain.toString()`) and loaded from a **data:
  URL** so the app works from `file://` (blob: URLs fail there).
- Audio lifecycle: one playing window at a time (`localStorage 'ws.audioOwner'` + `storage` event), `pagehide` closes
  the AudioContext.
- MIDI (Web MIDI, all inputs): notes, bend, CC1, CC64, CC120/123, **channel filter** (`ws.midiCh`), **Program Change**
  → preset, **MIDI learn** (`ws.ccMap`: CC → parameter key; validated on load). Stored data is untrusted: names are
  escaped / set with `textContent`, values clamped.
- Demo: songs from `demo_data.js`; the default demo (Appassionata) is a **preset tour**: `STYLE.appassionata.order` =
  the written-out sequence `TOUR_APPASSIONATA` (so new presets never change the demo), one preset about every 4 s
  snapped to chord onsets. `make_demo.js` `start` cuts the opening chords; the song keeps `origin` (7.84 s) and
  `tourScenes(..., origin)` computes the grid on the whole piece, then starts with the preset playing at the cut, so the
  cut changes nothing after it. `demo.tourPlan(i)` (`WS_TEST.demoTour`) returns the plan for tests and the manual.
  Other songs use animated scenes.
- Test hooks: `window.WS_TEST` (used by the test suites).
- Other storage keys: `ws.user` (user presets), `ws.state`.

## 5. Plugin (`vst/src/`)
- **No SDK helper library**: `plugin.cpp` implements `IComponent`/`IAudioProcessor` (Processor) and
  `IEditController`/`IMidiMapping` (Controller) directly on the interface headers, plus the factory and minimal
  `IMessage`/`IAttributeList` (argument-checked).
- Processor ↔ controller: `IConnectionPoint` messages `"ws.hello"` / `"ws.shared"` carry the id of a process-wide
  `SharedState` registry entry (`weak_ptr`, never a raw pointer): live display data and on-screen keyboard notes.
- **State**: processor `"WSY1"` = (id, double) pairs, validated (count, id range, finite, clamped); controller `"WSC2"`
  = zoom, modified flag, **preset name** (older `"WSC1"` index states are translated through `kBeta01Order`).
- `editor.cpp`: Win32 child window + GDI+, drawn from the layout tables, DPI-aware, zoom menu, preset popup, manual
  buttons (open `Contents/Resources/manual/*.html` next to the DLL).
- **User bank** (beta 0.3, VST only): `bank.h` (12 sections `kBankSections`, text format = export format: `== Section ==`,
  `Preset:`, `From:`, then `  key: value   (Name: shown)` for the parameters that differ from the defaults, ENGINE and A/B MIX
  always; parsing ignores unknown lines and clamps values). File `Wavelet Synthesizer user bank.txt` next to the
  `.vst3` bundle folder (`bankPath`; `WS_BANK_FILE` / `WS_BANK_EXPORT` for tests), re-read before every use (several
  instances), written atomically. Editor: preset menu → *Save to user bank…* (in-memory dialog template: name + section),
  *USER BANK* submenu (load, Delete, Export, Show); commands also reachable as `WM_APP + 1` (test hook). Controller:
  `loadUserSound` (group edit, keeps `presetIdx` for ◀ ▶), `userPresetName()`; the state `"WSC2"` stores
  `"USER · name"` (name buffer 512; an unknown name is taken only with that prefix).
- `vst2.cpp`: `VSTPluginMain` with VST 2.4 declarations written from the public binary layout (no Steinberg VST2 file).
  It hosts the same Processor + Controller in-process (parameter queues, event list, chunk `"WSV2"` = both states,
  programs = factory presets, editor via `IPlugView` + `IPlugFrame`).
- **Bundle**: `WaveletSynthesizer.vst3/Contents/x86_64-win/WaveletSynthesizer.vst3` (VST3) + a copy named
  `WaveletSynthesizer.dll` (found by hosts scanning a VST2 folder) + `Contents/Resources/` (manuals, licences).
  Only Windows system DLLs and the UCRT are imported.

## 6. Security hardening already in place (keep it)
MIDI file reader bounds every length to the bytes present (VLQ ≤ 4 bytes, binary-search tempo map); oscillator phase
wrap and above-Nyquist silence (prevented an out-of-bounds read); state/chunk/attribute parsing validated; MIDI-learn
and channel data validated; `install.bat` relaunches itself elevated instead of building a command line.

## 7. Building and manuals
- `vst\build.bat`: regenerates the spec (if Node is present), compiles `plugin editor iids vst2` + `funknown.cpp`,
  links statically (`-lgdiplus -lgdi32 -luser32 -lshell32 -lole32 -luuid`), copies the `.dll`, manuals and licences
  into the bundle. The DLL cannot be relinked while a host has it loaded.
- Manuals: `node tools/manual/shots.js` (UI screenshots, muted headless Edge) then `node tools/manual/build.js a b`.
  The text is generated from the spec (ranges, defaults, preset tables) and from `core.js` (figures). Every preset
  needs a description in `engA.js` / `engB.js` (`presetDesc`; the table is chosen by the preset's `engine`).

## 8. Tests
- `tests/vst3host/vst3host.exe <bundle> <outdir> [--quick] [--only a,b]`: DAW-like VST3 host (parameters, audio,
  state, controller state, offline, presets, sub, portamento, high notes, attribute list, editor screenshots, reload).
- `tests/web/test_web.js`, `tests/web/test_demo.js [--smoke]`: browser suites through `tests/web/cdp.js`.
- `vst/devtest/vst2_smoke.cpp`, `tools/dsp_compare.js`, `tools/dsp_selftest.js`; `tests/quick.js` (fast check).
- `vst/devtest/bank_session.cpp` (beta 0.3): the user bank driven through the editor like a player (save window filled by
  a helper thread, load, replace, export, delete, state name, unwritable folder).
- **Headless Edge must always run with `--mute-audio`** (otherwise test audio plays on the user's speakers) and be
  closed in `finally`; check that no `msedge --headless` process is left.
- beta 0.2: the VST host offline test switches `A/B Mix` (not the panel's `Engine`); `test_demo.js` checks the tour
  against `WS_TEST.demoTour` and the agreed sequence `EXPECTED_TOUR`; `quick.js` waits up to 2 s for slow attacks.
  `tests/web/test_web.js` and the full VST host run were not re-run for beta 0.2 (quick + demo smoke + VST2 smoke were).
- beta 0.3 pre-release: the 46 new presets come from the TEST branch (`preset-test`, votes file of the listening test);
  their values were checked equal to the TEST presets plus the recorded changes, and the 107 older presets unchanged.

## 9. Common changes — checklist
- **New parameter**: append in `tools/spec.js` (never insert), choose `structural`, place a widget in the layout, run
  `gen_spec`, implement in `core.js` **and** `dsp.h`, add the manual control text (`shared.js`/`engX.js`, `PLABEL`),
  think about compatibility of old states (default must reproduce the old sound), run the cross-check and the suites.
- **New preset**: add to `PRESET_LIST` with its `cat` (one of `CATEGORIES`), add its manual description (`engA.js` or
  `engB.js` by its `engine`), match its loudness to the favourites (loudest 200 ms of a held C major chord, median of
  the favourites ≈ −14 dB; drums measured over 50 ms, 3 dB lower), regenerate the spec, the VST and the manuals.
  The demo sequence is fixed (`TOUR_APPASSIONATA`): add a preset there only on purpose.
- **DSP change**: both engines, bit-exact for unchanged settings where possible, cross-check, VST suite, web suite.
- **Release**: version in `tools/spec.js` (APP) **and** `vst/src/version.rc` (DLL version info), build, manuals, tests (muted), release zip (`WaveletSynthesizer.vst3` + `INSTALL.txt`, made with
  Windows `tar` so paths use `/`), README + RELEASE_HISTORY. Publishing to GitHub uses a repo-local identity
  (GitHub noreply address), never the author's work identity.

## 10. Conventions
- Every source file starts with the copyright line and `SPDX-License-Identifier: GPL-3.0-or-later`; demo music keeps
  its own licences (`tools/demo/SOURCE.md`).
- UI text is English; comments explain *why*; match the existing density and naming (`P.key` / `P_KEY`, `kParams`).
- Keep the web app dependency-free and runnable from `file://`; keep the plugin a single static DLL.
