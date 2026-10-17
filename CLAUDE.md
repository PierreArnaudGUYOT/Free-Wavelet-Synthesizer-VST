# CLAUDE.md — Wavelet Synthesizer: architecture and maintenance guide

Wavelet Synthesizer is a polyphonic synthesizer based on the discrete wavelet transform, created by Pierre Arnaud GUYOT
("OktoPierre"), GPL-3.0-or-later. It ships as a **web app** (plain JavaScript, Web Audio AudioWorklet, no dependency)
and a **VST3 / VST2 instrument** for Windows x64 (one self-contained DLL, native Win32/GDI+ editor), also built as a
**VST3 for macOS** (universal bundle, Cocoa / Core Graphics editor; Mac port of beta 0.3). They run the same
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
| `vst/src/` | Plugin: `plugin.cpp` (VST3 processor, controller, factory), `editor.cpp` (GUI, every system) + `editor_platform.h` (its drawing / window interface) + `editor_win.cpp` (Win32, GDI+) + `editor_mac.mm` (Cocoa), `platform.h` (files, folders, text: Windows / macOS), `bank.h` (presets library), `vst2.cpp` (VST2 entry point, Windows), `common.h`, `iids.cpp`, `version.rc`. |
| `vst/external/pluginterfaces/` | Steinberg VST3 interface headers (MIT, licence kept). No other SDK code is used. |
| `vst/build.bat`, `vst/install.bat` | Build with the portable llvm-mingw toolchain (`-static`); install to the VST3 system folder (elevated, path never pasted into a command). |
| `vst/build_mac.sh`, `vst/INSTALL-mac.txt` | macOS build (Xcode command line tools, universal arm64 + x86_64, ad-hoc signature) → `build/mac/`; the Mac zip's install guide. |
| `.github/workflows/mac.yml`, `tests/machost/` | The Mac plug-in built and tested on GitHub's Macs at every push (artifacts: release zip, test output). |
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
- **noteOff never depends on VOICES** (beta 0.4 fix, both engines): a preset can switch mono <-> poly between a note on
  and its note off. The key leaves the mono list first; the mono legato branch is taken only when voice 0 plays that
  note and another key is held; otherwise every gated voice playing that note is released (a stuck note before).

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

### 3.3c LFO 2 (beta 0.3)
- `lfo2_shape`, `lfo2_rate`, `lfo2_amt`, `lfo2_target` (appended; AMOUNT 0 by default = bit-identical). `LFO2_TARGETS` in
  `tools/spec.js` (the lfo2_target choices, all linear parameters) → web `SPEC.LFO2_TARGETS`, C++ `kLfo2Targets`.
  `lfo2Tick` (own phase, S&H `rng(778)`) after `lfoTick`; in `control()` `d2 = amt · lfo2 · 0.5 · (max − min)` of the
  target and `lfo2Value(p, i, t2, d2)` replaces the target's value (clamped; POSITION wraps with the window). The layout
  widget `menu` (W_MENU) shows a choice parameter as a drop-down (web `ui.menu`, VST `choiceMenu`).

### 3.3d SOURCE PHASE (beta 0.4)
- `a_phase` (appended, structural, `fmt: 'deg'`, 0–1 of a cycle, default 0). `sourceCycle(wave, width, phase)` reads the
  wave at `frac(i/N + phase)` exactly (no interpolation); the NOISE cycle is shifted by `round(phase·N)` whole samples; mean
  removal and peak normalisation unchanged. Phase 0 is the beta 0.3 source **bit for bit** (`dsp_selftest` 8; all older
  presets render identically). Engine A only (a shifted engine-B cycle has the same timbre); the knob sits right of the
  SOURCE CYCLE display, which draws the moved wave. Why it matters: the periodic DWT is shift-variant (band b commutes only
  with shifts by multiples of 2^(12−b) samples), so the scale filter, sparsity and window act on other atoms.
- **Moved by LFO 2**: the last `LFO2_TARGETS` entry. `phaseModNeeded(params)` = target `a_phase`, amount ≠ 0, engine A
  playing. Then `buildTables` also builds every engine-A set (main, alt, WAVELET 2, WAVELET 2 alt) at the other
  `PHASE_K − 1` phases `a_phase + k/PHASE_K` (`PHASE_K = 12` in `core.js` and `dsp.h`; not a power of two, so neighbours
  differ in every band): JS `set.ph[k − 1] = {mode, mips, rms}`, C++ `Tables::phMips[slot][k − 1]`, `TableRef::phM[slot][k]`
  (k = 0 the set itself; slots 0 main, 1 alt, 2 w2, 3 w2 alt). `control()` puts the voice at `q = d2·PHASE_K` wrapped into
  [0, PHASE_K) (`ap0` → `ap1` across the block); `renderTable` renders the sets on each side of q with shares
  `1 − |q − k|` (round the cycle; the shares of a block start and end each add up to 1), the sub oscillator once; without
  `ph` it is exactly `renderVoice`. Rebuild when `phaseModNeeded` changes (web `setParam`; VST `process` `phaseEnds`: AMOUNT
  leaves / reaches 0, TARGET to / from PHASE). Cost (measured): 12.4 MB of tables instead of 1.0 (24.8 MB with WAVELET MORPH), builds of 38 ms
  in C++ and 77 ms in JS instead of 3 and 8 (68 / 159 ms with the morph), about 1.5 × the voice CPU; nothing when off.
- Compatibility: states and presets without `a_phase` get 0 (web `applyKeyed` defaults, VST `readState` `sawPhase`, the
  library starts from the defaults). Adding the PHASE target appended a choice to `lfo2_target` (plain values unchanged).
- Presets: the "Source Phase" section (`CATEGORIES` last, after Init, so older presets keep their numbers): 100 engine-A
  presets, every phase checked by `tools/phase_effect.js` (≥ 6 dB on some harmonic, ≥ 4 dB among those within 20 dB of the
  strongest; pair references at 0° are listed as such).

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
- Preset browser (beta 0.3, `ui.makeBrowser` / `renderBrowser`): a `#browser` element beside `#device` (the panel keeps
  its 1100 × 720 box: the test suites locate it by that shape), scaled with it by `fit()`; lists = TOP Sounds (favourites
  + `stars` ≥ 8, the web spec carries `stars`) and the categories, as the plug-in's defaults; selection only. Open state
  in `localStorage 'ws.browser'`; `#nobrowser` in the address leaves it out (manual screenshots, `tools/manual/shots.js`).
  The preset name opens it when hidden, else the classic menu.
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
- `editor.cpp`: the panel, drawn from the layout tables, zoom menu, preset popup, manual buttons (open
  `Contents/Resources/manual/*.html` of the bundle) — the same code on both systems. It draws through `Canvas`
  (`editor_platform.h`: rectangles, rounded rectangles, ellipses, arcs, lines, polygons, linear gradients, text with
  GDI+'s layout — 1/6 em margins —, a nearest-neighbour image) and talks to the system window through `EditorWindow`
  (invalidate, size, capture, modifier keys, pop-up menus as a `MenuItem` tree, message / Yes-No / save windows, save-file
  dialog, reveal, open). The window calls back through `EditorEvents` (paint, timer, mouse, wheel, `testCommand`).
  - `editor_win.cpp`: Win32 child window + GDI+ into a back buffer, DPI-aware (exactly the beta 0.3 Windows code: keep
    its screenshots identical, `tests/vst3host` compares them); the save window is an in-memory dialog template.
  - `editor_mac.mm` (ARC): a flipped NSView of a class created at run time under a name unique to the binary (two
    versions in one host never share a class), Core Graphics + Core Text (system font at 95 %: it is ~5 % wider than Segoe
    UI), sizes in points (no `setContentScaleFactor`: macOS scales for Retina), a 30 Hz `CFRunLoopTimer` in the common
    modes, NSMenu (target/action, tab → "  (n)"), NSAlert windows (the save window: an accessory view, text field
    `ws.name`), NSSavePanel; Cmd = Ctrl (reset), Control-click = right-click; modifier keys read from the mouse event;
    `wsTestCommand:` = the Windows `WM_APP + 1` test hook.
- **Preset library** (beta 0.3, VST only): `bank.h`, `Library::get()` (one per process, mutex, reads the file again
  when its write time or size changes: several instances). One text file `OKTOWAVE presets.txt` next to the `.vst3`
  bundle folder (`libraryFolder`; `WS_PRESETS_FILE` / `WS_PRESETS_EXPORT` / `WS_PRESETS_IMPORT` for tests), written atomically after every
  edit (an error leaves the state unchanged): `######## FACTORY PRESETS` (every preset: `Preset:` its name now,
  `Factory:` its built-in name = the key, `Adjusted: yes|no`, optional `Deleted: yes`, then `  key: value   (Name: shown)`
  for the parameters that differ from the defaults, ENGINE and A/B MIX always; only adjusted blocks override the built-in
  values), `######## LIST ORDER` (TOP Sounds — favourites + `kPresetStars` ≥ 8 — and each category, `N. built-in name`;
  missing members keep their default place), `######## USER BANK` (12 `kBankSections`, `Preset:`, `From:`, values). A
  beta 0.3 user-bank file (`Wavelet Synthesizer user bank.txt`) is read when the library file does not exist. Parsing
  ignores unknown lines and clamps values. `importFrom` (beta 0.4 IMPORT) reads and checks another file (a `Preset:` line), parses it
  over the built-in state, keeps the current file as `OKTOWAVE presets (backup YYYY-MM-DD HHMM[ n]).txt` (never over an
  earlier backup), then commits; an error leaves the library unchanged. The controller takes factory values and names from the library (`loadPreset`,
  `exactPreset`, `findPreset` = name now or built-in name, new instances' default preset, VST2 program names).
- **Editor, presets** (beta 0.3): the **preset browser** (`kBrowserW` = 360 logical px added at the right while open;
  `browserOpen` kept by the controller, written in `"WSC2"` as a trailing int32 only when closed, so other states stay
  byte-identical): FACTORY / USER BANK tabs, the lists of the library, one click loads, ▲ ▼ `moveInList` / `moveUser`,
  buttons TO BANK, RESTORE, DELETE, EXPORT, IMPORT (beta 0.4, `bankImport`, `kCmdBankImport` 903, `openFileDialog`:
  GetOpenFileNameW / NSOpenPanel; FILE = "Show the presets file" in the right-click menu); the list's scroll bar
  (beta 0.4, `bScrollR` 12 px, `bThumb` ≥ 28 px, hit code 30: drag the thumb, a click on the bar centres it there); **SAVE PRESET** (`kSaveBtn`, the preset box is shorter) adjusts the
  factory preset (`Library::adjust`, then `presetStored`) or replaces the bank sound; DELETE = `setDeleted` (lists and
  ◀ ▶ skip it; the right-click menu's "Deleted presets" brings it back). The preset name opens the browser, a right-click
  the classic menu. Save window: an in-memory dialog template (name, optional section and note). Commands also reachable
  as `WM_APP + 1` (test hook). Controller: `loadUserSound` (group edit, keeps `presetIdx` for ◀ ▶), `userPresetName()`;
  the state `"WSC2"` stores `"USER · name"` for a bank sound (name buffer 512, no NUL byte; an unknown name is taken only
  with that prefix). Knobs with ≤ 5 positions: 24 px per step, a click = next value (web `dragBehaviour` too). The
  panel's logo reads OKTOWAVE / WAVELET SYNTHESIZER (both products; the plug-in keeps its name).
- `vst2.cpp`: `VSTPluginMain` with VST 2.4 declarations written from the public binary layout (no Steinberg VST2 file).
  It hosts the same Processor + Controller in-process (parameter queues, event list, chunk `"WSV2"` = both states,
  programs = factory presets, editor via `IPlugView` + `IPlugFrame`).
- **Bundle**: `WaveletSynthesizer.vst3/Contents/x86_64-win/WaveletSynthesizer.vst3` (VST3) + a copy named
  `WaveletSynthesizer.dll` (found by hosts scanning a VST2 folder) + `Contents/Resources/` (manuals, licences).
  Only Windows system DLLs and the UCRT are imported.
- **macOS bundle**: `WaveletSynthesizer.vst3/Contents/MacOS/WaveletSynthesizer` (universal Mach-O bundle exporting only
  `GetPluginFactory`, `bundleEntry`, `bundleExit`; `-fvisibility=hidden`), `Info.plist` (BNDL,
  `com.oktopierre.waveletsynthesizer.vst3`, version from `WS_VERSION`), `PkgInfo`, `Resources/` (manuals, licences),
  ad-hoc signed. Same class IDs as on Windows. The presets file is written next to the bundle (`libraryFolder`: up from
  `Contents/MacOS`), so the player installs into `~/Library/Audio/Plug-Ins/VST3`. Flush-to-zero: MXCSR on x86, FPCR.FZ on
  Apple silicon. No VST2 on macOS.

## 6. Security hardening already in place (keep it)
MIDI file reader bounds every length to the bytes present (VLQ ≤ 4 bytes, binary-search tempo map); oscillator phase
wrap and above-Nyquist silence (prevented an out-of-bounds read); state/chunk/attribute parsing validated; MIDI-learn
and channel data validated; `install.bat` relaunches itself elevated instead of building a command line.

## 7. Building and manuals
- `vst/build_mac.sh` (macOS): `plugin editor iids` + `editor_mac.mm` (ARC) + `funknown.cpp`, universal, **`-ffp-contract=off`**
  (clang fuses multiply-adds on Apple silicon by default, which would change the sound), ad-hoc `codesign`. The Mac zip is
  made by the workflow (`ditto`, so the bundle keeps its permissions and signature), not on Windows.
- `vst\build.bat`: regenerates the spec (if Node is present), compiles `plugin editor editor_win iids vst2` + `funknown.cpp`,
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
- `vst/devtest/bank_session.cpp` (beta 0.3): the preset library driven through the editor like a player (browser clicks,
  SAVE PRESET / rename / refused name, RESTORE, DELETE and back, ▲ ▼, the user bank, EXPORT, OCT click, LFO 2 menu, HIDE,
  unwritable folder, the file read back after the plug-in is unloaded and loaded; beta 0.4: the scroll bar dragged and
  clicked on the 100 Source Phase sounds, IMPORT with its backup copies and a refused file). The save windows and message boxes are
  answered by a helper thread (a single-OK message box closes with IDCANCEL).
- `tools/dsp_compare.js` / `dsp_render.cpp` also render LFO 2 on each of its targets, and (beta 0.4) four SOURCE PHASE
  variants: static (Haar saw, noise) and moved by LFO 2 with WAVELET MORPH and with A/B MIX (every phase-set slot).
- beta 0.4: `node tools/phase_effect.js` measures every phased preset (phase 0 against its phase, static cycle at middle
  C); `dsp_selftest` 8 checks phase 0 = the beta 0.3 source, the Haar band-6 effect (> 10 dB), the noise shift, the phase
  sets; `dsp_selftest` 9: no stuck note when a preset switches VOICES while a key is held. The 153 older presets were checked bit-identical against beta 0.3 (old and new `core.js`, same scenario).
- `tests/vst3host`: `scaled()` maps layout points with the height scale (the browser makes the editor wider).
- macOS (`.github/workflows/mac.yml`, `macos-14`, Apple silicon + Rosetta for Intel): `dsp_render.cpp` + `dsp_compare.js` on
  both architectures, then `tests/machost/machost <bundle> <outdir>` (built by `tests/machost/build.sh`): bundle and
  exports, sound, states, editor in a window (PNG screenshots, synthetic mouse events at logical points, Cmd-click), HIDE /
  browser, the zoom and preset menus (chosen through `NSMenuDidBeginTrackingNotification` + `performActionForItemAtIndex`),
  SAVE PRESET / TO BANK / DELETE / undelete / EXPORT / IMPORT (903, `WS_PRESETS_IMPORT`) through `wsTestCommand:` with the NSAlert windows answered by a timer
  (`stopModalWithCode`). The presets file's header quotes "Adjusted: yes" / "Deleted: yes": look for them at a line start.
  Results: the run's page in the repository's Actions tab, or the Actions REST API (artifacts `WaveletSynthesizer-mac`
  = the release zip, `mac-test-output` = logs and screenshots).
- **Headless Edge must always run with `--mute-audio`** (otherwise test audio plays on the user's speakers) and be
  closed in `finally`; check that no `msedge --headless` process is left.
- beta 0.2: the VST host offline test switches `A/B Mix` (not the panel's `Engine`); `test_demo.js` checks the tour
  against `WS_TEST.demoTour` and the agreed sequence `EXPECTED_TOUR`; `quick.js` waits up to 2 s for slow attacks.
  `tests/web/test_web.js` and the full VST host run were not re-run for beta 0.2 (quick + demo smoke + VST2 smoke were).
- beta 0.3: the 46 new presets come from the TEST branch (`preset-test`, votes file of the listening test);
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
- Keep the web app dependency-free and runnable from `file://`; keep the plugin a single static DLL (Windows) and a
  self-contained bundle using only system frameworks (macOS).
- Shared plug-in code (`editor.cpp`, `plugin.cpp`, `bank.h`, `dsp.h`) calls no operating system directly: add the call
  to `platform.h` or to the `EditorWindow` interface, with both implementations.
