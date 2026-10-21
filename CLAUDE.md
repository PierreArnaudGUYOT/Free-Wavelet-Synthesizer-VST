# CLAUDE.md — Okto MultiWave Synth: architecture and maintenance guide

> New here? [CLAUDE_DIFFERENCES.md](CLAUDE_DIFFERENCES.md) says in two pages how this version differs from the initial Wavelet Synthesizer (Free-Wavelet-Synthesizer-VST) and explains the design (panel, signal path, presets file); this file is the detailed guide by topic.

**Final version: EVALUATE SOUNDS (the listening test of the new presets, web app and plug-in) and the extra demo songs were removed** at the owner's request: the web app's DEMO plays Beethoven's Appassionata (III) only, with its preset tour, and has no song menu (the arrow) and no MIDI file loading; the plug-in has no evaluation session. The sections below that describe them are history (marked "removed") or were deleted.

**Okto MultiWave Synth** (beta 0.3, 2026-10-19, a test version; beta 0.2 was the same day, beta 0.1 2026-10-18) is the Wavelet Synthesizer beta 0.7 (commit f16b46a of
https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST, whose history this repository keeps) with **three
oscillators** (A1 A2 B1; beta 0.3 removed B2) instead of two engines (§3.3, §3.3i), the **chord keyboard** of the WaveChord work (§3.3f, shown by a CHORD MODE
button), 908 presets to rate (600 of beta 0.3, 175 of beta 0.2 and 133 of beta 0.1: the 192 older ones that played B2 were left out in beta 0.3), the **EVALUATE SOUNDS** listening test (removed in the final version) and the CPU remarks of the load study (§3.5, §3.6).
Beta 0.3 also adds **LFO 3** (a second LFO of the LFO 2 kind), the voice **FILTER** (4-pole, LADDER / OTA, §3.3i), three folder tabs with a plate and a global scope, 600 more presets (composed by
`tools/supermod/`, §9) and EVALUATE SOUNDS in sets of 40 sounds with a long chord at the end of the passage (removed in the final version).
Beta 0.2 adds **SuperModulation** (LFO 1 on SPARSITY / RESO / ENV>WAV, LFO 2 on every wavelet control, §3.3g), the chord keyboard's **BASS** (two
octaves down, louder, on by default), the chord that **follows the left hand** (§3.3f), the **oriental tunings** (Arabic / Turkish quarter tones, §3.3h),
the preset browser that follows the preset box (§4, §5) and 300 more presets, composed and measured by `tools/supermod/` (§9).
Everything else in this guide is the synthesizer's and still applies; "beta 0.x" below are the Wavelet Synthesizer's versions
unless it says Okto MultiWave Synth. Identity: bundle `OktoMultiWaveSynth.vst3`, VST3 class IDs, VST2 ID 'OkMW', window / view
class names, presets file `OKTOMULTIWAVE presets.txt`, web storage keys `mw.*` / `ws.*`, so it installs next to the
Wavelet Synthesizer. The panel is 1100 × **944** since beta 0.3.4 (§3.3m; 1050 in beta 0.3, 966 in 0.3.3) (+ 120 while CHORD MODE is on, `CHORD_H`); `APP.version` restarts at beta 0.1
(`APP.base` names the synthesizer). Platforms: web and Windows (VST3 / VST2); the macOS files of the Wavelet Synthesizer are
still in the tree (the shared code stays portable) but no Mac build is made or tested: `mac.yml` only runs by hand.

The synthesizer is polyphonic and based on the discrete wavelet transform, created by Pierre Arnaud GUYOT
("OktoPierre"), GPL-3.0-or-later. It ships as a **web app** (plain JavaScript, Web Audio AudioWorklet, no dependency)
and a **VST3 / VST2 instrument** for Windows x64 (one self-contained DLL, native Win32/GDI+ editor). They run the same
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
| `web/` | Web app: `index.html`, `css/synth.css`, `js/{spec,core,worklet,ui,app,demo,demo_data}.js`, `manual/` (generated). |
| `vst/src/` | Plugin: `plugin.cpp` (VST3 processor, controller, factory), `editor.cpp` (GUI, every system) + `editor_platform.h` (its drawing / window interface) + `editor_win.cpp` (Win32, GDI+) + `editor_mac.mm` (Cocoa), `platform.h` (files, folders, text: Windows / macOS), `bank.h` (presets library), `vst2.cpp` (VST2 entry point, Windows), `common.h`, `iids.cpp`, `version.rc`. |
| `vst/external/pluginterfaces/` | Steinberg VST3 interface headers (MIT, licence kept). No other SDK code is used. |
| `vst/build.bat`, `vst/install.bat` | Build with the portable llvm-mingw toolchain (`-static`); install to the VST3 system folder (elevated, path never pasted into a command). |
| `vst/build_mac.sh`, `vst/INSTALL-mac.txt` | macOS build (Xcode command line tools, universal arm64 + x86_64, ad-hoc signature) → `build/mac/`; the Mac zip's install guide. |
| `.github/workflows/mac.yml`, `tests/machost/` | The Mac plug-in built and tested on GitHub's Macs at every push (artifacts: release zip, test output). |
| `vst/devtest/` | Developer checks: `dsp_render.cpp` (C++ renders for the JS cross-check), `vst2_smoke.cpp` (VST2 host-like test). |
| `tools/dsp_compare.js`, `tools/dsp_cases.js`, `tools/dsp_selftest.js` | C++ ↔ JS comparison (1000 cases in beta 0.3, limit 2e-6); JS engine self-test (`dsp_selftest.js` still describes the Wavelet Synthesizer's two engines: not run for beta 0.1). |
| `tools/presets_top.js`, `tools/presets_new.js`, `tools/presets_super.js`, `tools/presets_lfo3.js` | The 22 TOP Sounds (beta 0.7 parameters, converted by `convertLegacy`), the 200 presets of beta 0.1 (001-200, **unchanged since**), the 300 of beta 0.2 (201-500) and the 600 of beta 0.3 (501-1100), the last two **generated** by `tools/supermod/build.js`: do not edit. |
| `tools/supermod/` | The composer of the 300 presets of beta 0.2 and the 600 of beta 0.3: `layers.js` (oscillator building blocks), `mods.js` (modulation recipes: LFO 1, LFO 2 and its LFO 3 twins, the filter), `perc.js` (the drums), `compose.js`, `audit.js` (renders every candidate the way a player plays it and measures it: limiter share, bursts of high frequency, motion, contrast between oscillators), `build.js` (parallel run, filters, farthest-point selection, loudness), `calib.js` (the same measures of the existing presets). |
| `tools/make_presets.js`, `preset_dsl.js`, `preset_lab.js`, `recipes_*.js` | The presets of beta 0.1 and the language the composer writes: one recipe file per group (`P(category, title, description, {A1, A2, B1, g, win})`; the recipes of beta 0.1 wrote B2 and can no longer run), the loudness / distinctness / contact-sheet tooling. |
| `vst/devtest/vote_session.cpp` | The plug-in window test (it was the EVALUATE SOUNDS test, a feature removed in the final version): folder tabs, CHORD MODE, fit to the screen, preset browser and its stars. |
| `tools/make_demo.js`, `tools/midi.js`, `tools/demo/` | The demo song: the MIDI file of Appassionata III (+ `SOURCE.md` licence) → `web/js/demo_data.js` (`WS_DEMO_SONGS`, one song); `tools/midi.js` is the MIDI reader of the converter (the web app reads no MIDI file). |
| `tools/manual/` | Manual generator: `mw.js` (the text of both manuals; tables from the spec), `lib.js` (helpers, page shell), `figs.js` (SVG figures computed with `core.js`), `shots.js` (screenshots), `top_desc.js` (the TOP Sounds' descriptions), `build.js`. |
| `tests/` | Independent test suites (see §8), `tests/quick.js`, `regress_v07.js` (+ `ref/v07/`, the published beta 0.7 engine), `idle_skip.js`. |
| `index.html`, `.nojekyll` | GitHub Pages home: redirects to `web/index.html`. |

## 2. The specification (`tools/spec.js`)

- **Parameters** (`add(key, name, short, {curve, fmt, min, max, def, structural, hidden, choices})`).
  The array order **is the VST3 ParamID**: *append only, never reorder or delete* — saved Live Sets and automation
  depend on it. `structural: true` means "rebuilds the wave tables" (see §3.4). `hidden` = bend, mod wheel, sustain
  (driven by MIDI, not shown on the panel).
- **Curves** `lin | exp | pow2 | int | choice` map normalized 0..1 ↔ plain values (`toPlain` / `toNorm`, identical in
  JS and C++). **Formats** (`fmt`) give the display text; adding a format means updating `FMTS` in `gen_spec.js`,
  `format`/`parse` in `core.js` and `formatValue`/`parseValue` in `dsp.h`.
- **Layout**: sections (cards) with widgets in panel coordinates (1100 × 944). Both GUIs (`web/js/ui.js` and
  `vst/src/editor.cpp`) are generated from it. `section(id, title, x, y, w, h, view, widgets, opts)`: `view` 0..2 = the card is
  shown only while that oscillator's tab is (A1 A2 B1), −1 = always; `opts.vis` (+ `visOn`) = shown only while that parameter is on
  / off (the chord card: `chord_mode`). Widget fields (generated into `WidgetDef` too): `only: 'web' | 'vst'` (C++ `only` 1 / 2: the
  other GUI skips the widget), `vis` + `visOn` (the SYNC'd RATE / TIME knobs share their place with the free ones), `style`
  (`'value'`: a knob labelled with its value), `text`, `env`
  (an ADSR display: 0 amp, 1 mod, 2 an oscillator's own envelope, whose `param` is its `eon` + 1 .. + 4). Types include `manual`
  (the manual of the oscillator shown), `download` (web only, the GitHub releases page), `toggle`, `label`, `chordpads`, `chordname`, `strumplate` (the `evaluate` type, the EVALUATE SOUNDS button, was removed in the final version).
  Panel (beta 0.3, §3.3i): header y 0 (logo, zoom, preset box x 384 w 296, SAVE PRESET 862 (plug-in)
  / DOWNLOAD VST (web), MANUAL 936, master, meter); section `oscframe` y 50 (the three folder tabs `osctabs` and the plate drawn by the section); at y 98 the tone card of the oscillator
  shown (544 × 260) inside the plate, and at its right, outside the plate, **OSC MIX** (572, 56; 124 wide: three level knobs + SUB OSC) and the SCOPE · ALL OSCILLATORS (704, 56; 384 wide); y 366:
  SCALE FILTER, POSITION, the oscillator card (TUNE | OWN ENVELOPE | PITCH ENVELOPE); y 520: the voice FILTER, AMP ENVELOPE, MOD ENVELOPE; y 656: LFO 1, LFO 2/3 (two sections, one shown by `lfo_view`),
  VOICE; y 792: EFFECTS and PLAY (CHORD MODE, BASS, TUNING, MAQAM, TONIC); keys section y 928 (wheels, keyboard 1006 wide); the chord card y 1054, shown only while CHORD MODE is on (the plug-in
  window and the web `fit()` grow by `CHORD_H`). The credit `APP.panelCredit` is at the bottom left.

- **Oscillators** (§3.3): `SLOTS[s] = {id, mode, name, k: {field → parameter key}}` for A1 A2 B1 (beta 0.3: B2 removed). The generated tables
  `kSlots` / `kSlotRole` (C++) and `SPEC.SLOTS` / `ROLES` / `LFO2_ROLE` (web) let the engine and both panels be written once for
  any oscillator. Validation at generation time: a LFO 2 role has the same range in every oscillator, the four envelope
  parameters of an oscillator are consecutive, the eleven bars are consecutive.
- **Presets**: `tools/presets_top.js` (the 22 TOP Sounds in the *beta 0.7* parameter form: `convertLegacy` in `spec.js` turns
  `ab_mix` / `engine` into `a1_lvl` / `b1_lvl` and gives B1 copies of the shared wavelet, filter and window) then
  `tools/presets_new.js` (200 presets in this version's parameters, names `"NNN A1A2 · Title"` where the letters say the
  oscillators used, `desc` = their one-line description; the data files' categories are Bass, Lead, Keys, Organ, Pad, Strings, Brass & Wind, Pluck, Bells & Mallets, FX, Drums & Perc and SuperModulation;
  since version 1.0 `CATEGORIES` = Pad, SuperModulation, Bass, Lead, Keyboard, Organ, Strings, Brass & Wind, Bells & Mallets, FX, Drums & Perc: `SECTION_OF` maps Keys and Pluck to Keyboard, §3.3n). Until beta 0.3.4 `PRESETS` = TOP, then the 600 of beta 0.3 (501-1100, `presets_lfo3.js`), the 300 of beta 0.2 (201-500, `presets_super.js`),
  then the 200 of beta 0.1 (001-200, `presets_new.js`, untouched: the owner asked that the old presets never change); `MW_NO_SUPER=1` and `MW_NO_LFO3=1` leave
  the 300 / the 600 out (the builder compares its candidates with the other 330). `TOP` = 22, `NEW_FIRST` = 22 / `NEW_COUNT` = 908 (beta 0.3: 600 + the 500 of the earlier betas minus the 192 that played B2, §3.3i; C++ `kFirstNew` /
  `kNumNew`) = the new presets, in that order (their numbers are 3 or 4 digits; the owner's ratings, `tools/ratings_*.js`, are keyed by them). `rank` = the factory order, which is every category's list order (version 1.0: sorted by the owner's stars, best first, a tie: the earlier one in the array). `TOUR` = the demo's preset sequence (`TOUR_PICKS`: a TOP Sound by name, a new preset as `new:<title>`; the first
  two are not heard). `DESCRIPTIONS` (name → text) is generated into the web spec (the manual's preset table shows them; the plug-in has no use for them since EVALUATE SOUNDS left, so `vote_data.h` is no longer generated). Values
  are validated against the ranges at generation time. Menus: web `presetList()` groups ★ TOP SOUNDS + one folding group per
  category + USER PRESETS; VST `editor.cpp presetMenu` = the library's lists. The VST stores the preset by name, so
  reordering never breaks saved Live Sets. `DEFAULT_PRESET` is the opening sound (`A · Warm Pad`).

## 3. The sound engine

### 3.1 Transform and tables
(This is per oscillator: four sets of layers can exist, §3.3. "Engine A / B" below means the subtractive / additive kind of oscillator.)
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
- Control rate `CTRL = 32` samples. Per block, once for all voices (`prepBlock`): LFO 2's role and amount, the unison pans and
  detune, the smoothed oscillator levels `lvlSm` (20 ms) → `m0` / `m1` / `live`, each oscillator's filter values, the additive
  bands' bar × tilt, attack rates, decays. Per voice and block: `control()` (pitch with glide, octave, fine, bend, LFO, mod wheel,
  each oscillator's tuning and pitch envelope, mip level, band gains ramped per sample, band envelopes of the additive
  oscillators, the window), `ampPass` (the AMP ENVELOPE with the velocity gain, per sample, into `envA`) and `ownPass` (an
  oscillator's own envelope, which multiplies `envA`).
- `renderSlot` → `renderTable` → `renderVoice(vc, n, s, mode, mips, rms, fade0, fadeInc, invert, gain0, gainInc)` renders one
  oscillator of a voice: unison copies (≤ 4, detuned and panned) with its own envelope × the amp envelope per sample;
  `renderSub` the **sub oscillator** (sine / triangle / PolyBLEP square, −1 or −2 octaves, unfiltered, once per voice). No render
  mutates the voice: the end state goes to `endLevel/endStage/endPh/endSubPhase` so that several renders of the same oscillator
  (table crossfade, morph, phase sets) start from the same state; `block()` commits it.
- Safety: the phase is wrapped with `x -= floor(x)` (a step can exceed one cycle), voices whose fundamental is above
  Nyquist are silent, notes are bounded 0–127.
- Polyphony 1–16 (mono = legato with last-note priority); portamento modes Off / Poly (each voice glides from its own
  last pitch, glide-aware voice allocation) / Legato only.
- **noteOff never depends on VOICES** (beta 0.4 fix, both engines): a preset can switch mono <-> poly between a note on
  and its note off. The key leaves the mono list first; the mono legato branch is taken only when voice 0 plays that
  note and another key is held; otherwise every gated voice playing that note is released (a stuck note before).

### 3.3 The three oscillators (Okto MultiWave Synth beta 0.1, four oscillators until beta 0.2; replaces the Wavelet Synthesizer's A/B MIX)
- Oscillators **A1 A2** (mode 0, subtractive) and **B1** (mode 1, additive; **B2 was removed in beta 0.3**, §3.3i). Fields of one oscillator (`SLOTS[s].k`): `lvl`;
  `wavelet`; the source (`wave width sparsity phase` | `pattern seed tilt bar1..bar11 atk spread body bright sus`); the scale
  filter (`ftype fcut fslope fres fkey fenv fvel`); the window (`pcen pwid pdep`); the tuning (`oct semi fine`); the own envelope
  (`eon ea ed es er`); the pitch envelope (`pamt` semitones at the start, `ptime` s to fall to 0; the pitch is
  `semis + tune + pamt · pe`, `pe` decaying per block like an envelope). **A1 and B1 keep the Wavelet Synthesizer's parameter
  names** (`a_wave`, `f_cutoff`, `b_bar1` …; A1 also `wavelet` and the filter / window; B1 has its own `b1_wavelet` and
  `b1_f*` / `b1_p*`); the others are clones named `a2_*`, `b1_*` (`cloneParam`). `osc_view` (0..2) replaces `engine`: it is
  only the panel shown (structural so that the displays rebuild, but neither the processor nor the web app rebuild the sound's
  tables for it). `ab_mix` is gone.
- **Levels**: `lvlSm[s]` follows `p[lvl]` with a 20 ms time constant per block and is ramped per sample inside it; before the
  first block it simply takes the value (a sound loaded into a new engine never fades in: `E.setParam` / `setParam` snap it
  while `!started`). An oscillator whose smoothed level is < `LVL_EPS` is not rendered (`live[s] = 0`), and its tables are not
  built: `buildTables(params, true)` → `{needs, slots: [{mode, mips, rms, ph?, w2?} | null × 3]}` (C++ `Tables::slot[NS]`,
  `TableRef`, `SlotRef`). `buildTables(params, false)` builds the raw layers of the oscillator **shown** for the displays.
  Rebuild only when an oscillator's level reaches or leaves 0 (`levelEnds`: web `setParam`, VST `process`).
- **Own envelope**: when `eon` is on, the oscillator's output is multiplied by its own ADSR (`ownPass`, advanced even while the
  oscillator is not rendered, so it is in step when it re-enters); it multiplies the AMP ENVELOPE, so it can only shorten.
  A re-entering additive oscillator restarts its band envelopes. **Pitch envelope**: `sl.pe` starts at 1 on every note.
- **LFO 2** targets are *roles* (`ROLES`, `LFO2_ROLE`, `kSlotRole[3][19]`): each role is applied to every oscillator that has it
  (SOURCE PHASE only to the subtractive ones) by the same amount. WAVELET MORPH (`wav2`, `wmorph`, `lfo_wav`, `env_wav`) and
  SOURCE PHASE moved by LFO 2 act on each oscillator (`w2` sets, `ph` sets, §3.3b / d).
- **Compatibility**: the 22 TOP Sounds are the beta 0.7 sounds (`tests/regress_v07.js`: ≤ 1.5e-7 of the peak against the published
  engine in `tests/ref/v07/`; that test sets the old engine's `mixSm` to the preset value because the old engine ramped
  it from the default). A Wavelet Synthesizer state is not read (a different plug-in).

### 3.3b WAVELET MORPH (beta 0.3; per oscillator since Okto MultiWave Synth: the `w2` sets are built for every oscillator that plays)
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

### 3.3c LFO 2 (beta 0.3; its targets are roles applied to every oscillator, §3.3; beta 0.2: 17 targets, §3.3g)
- `lfo2_shape`, `lfo2_rate`, `lfo2_amt`, `lfo2_target` (appended; AMOUNT 0 by default = bit-identical). `LFO2_TARGETS` in
  `tools/spec.js` (the lfo2_target choices, all linear parameters) → web `SPEC.LFO2_TARGETS`, C++ `kLfo2Targets`.
  `lfo2Tick` (own phase, S&H `rng(778)`) after `lfoTick`; in `control()` `d2 = amt · lfo2 · 0.5 · (max − min)` of the
  target and `lfo2Value(p, i, t2, d2)` replaces the target's value (clamped; POSITION wraps with the window). The layout
  widget `menu` (W_MENU) shows a choice parameter as a drop-down (web `ui.menu`, VST `choiceMenu`).

### 3.3d SOURCE PHASE (beta 0.4; subtractive oscillators only, the phase sets are built per oscillator)
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
- Presets: the "Source Phase" section: 100 engine-A presets in beta 0.4 (then last), every phase checked by
  `tools/phase_effect.js` (≥ 6 dB on some harmonic, ≥ 4 dB among those within 20 dB of the strongest); beta 0.5 keeps 44,
  second in `CATEGORIES` (last again since beta 0.7).

### 3.3e TEMPO SYNC (beta 0.6, plug-in only)
- `fx_dsync` / `fx_ddiv`, `lfo_sync` / `lfo_div`, `lfo2_sync` / `lfo2_div` (appended; SYNC off by default). The note values
  are `DELAY_NOTES` / `LFO_NOTES` in `tools/spec.js`, ordered by length (T = triplet, D = dotted), their lengths in beats
  `DELAY_BEATS` / `LFO_BEATS` (web `SPEC.*`, C++ `kDelayBeats` / `kLfoBeats`).
- `Engine.tempo` (BPM, 0 = none): `setTempo` (anything not finite or ≤ 0 → 0). `delaySec()` = TIME, or with SYNC on and a
  tempo `beats · 60 / tempo` capped at `DLY_MAX = 4` s; `lfoHz(sync, div, rate)` = RATE, or `tempo / 60 / beats`. The note
  index is rounded and clamped (`noteAt`). The delay buffer holds `DLY_MAX + 0.1` s (it was 1.1 s).
- The web app never sets a tempo (no DAW): its SYNC widgets are `only: 'vst'` and its sound ignores the SYNC parameters.
  The VST3 processor asks for the tempo (`getProcessContextRequirements` → `kNeedTempo`) and calls `setTempo` at each
  `process` with `ProcessContext::tempo` when `kTempoValid`, else 120 BPM; VST2 (`vst2.cpp`) reads it through
  `audioMasterGetTime` (the `TimeInfo` layout, `kTempoValid = 1 << 10`) into the same `ProcessContext`.
- The longer delay buffer changes rounding of the read position: 2 presets (Steel Pluck, Phase Glitch) differ from
  beta 0.5 by < 4e-9 (−170 dB); the 148 others are bit-identical.

### 3.3f CHORD KEYBOARD (Okto MultiWave Synth beta 0.1)
- Spec: `CHORDS` (label, name, suffix, intervals; append only, `chord_type` stores the index), `CHORD_KEYS` (the type of each
  selector key C..B: white = major / bright family, black = minor / altered / bare), six **perf** parameters appended:
  `chord_mode`, `chord_type`, `chord_oct` (selector octave = MIDI 24 + 12·k, default k 2 = C3–B3, middle C = C4 = 60),
  `chord_voicing` (Stacked / Folded, default Folded), `chord_bass`, `chord_strum` (0–0.1 s). Generated: web `SPEC.CHORDS` /
  `CHORD_KEYS`, C++ `kChords` / `kChordKeys` / `ParamDef::perf`.
- **perf** = a performance setting: on the panel and automatable, saved in the plug-in state (`WSY1`) and the web state
  (`oc.state`), but **never in a preset**: web `toKeyed()` (presets, export) skips it, `applyKeyed` / `loadPreset` / the demo's
  `applyPreset` leave it as it is, it never marks the preset modified; VST `applySound`, `exactPreset`, `performEditPlain`
  (dirty) and the library (`paramLines`, `parseParamLine`, `adjust`, the adjusted-equals-built-in test) skip it.
- **Chord layer** (`core.js` `keyOn` / `keyOff` …, ported 1:1 in `dsp.h`): every player key goes through it (web worklet
  `'on'` / `'off'`, VST3 note events, VST2 MIDI, the editors' keyboards via `SharedState::Ev` kind 0); the demo sequencer
  calls `noteOn` / `noteOff` directly. CHORD off: `keyOn` = `noteOn` (bit-identical). CHORD on: selector key = sets
  `p[chord_type]` + `chordTypeChanged`, silent; above it the first key held is the root → `startChord` (`chordNotes`: the type's
  intervals, Folded = pitch classes in the C..B octave of the root, BASS = the root two octaves below (beta 0.2; an octave up while under C1),
  cut from the top to VOICES with the root then the bass kept, > 127 dropped), other keys = plain notes; below it = plain notes.
  Notes are **reference-counted** (`holdCnt`, `holdOn` / `holdOff`): a note shared by the chord and a held key sounds until
  both release it. STRUM: `strumDue[k] = clock + k·strum·sr`, started by `strumTick()` at the start of each `block`
  (block boundaries, identical in JS and C++; `clock` counts samples). `setParam(chord_mode | chord_oct)` →
  `chordReset`; `allNotesOff` / `allSoundOff` → `chordClear`.
- **Strum plate**: `plateNotes(root, type)` (the chord's pitch classes over the three octaves above the root's octave, ≤ 12),
  `plateOn` / `plateOff` (plain counted notes whatever CHORD says; web `'plateon'` / `'plateoff'`, VST `Ev` kind 1). The plate
  uses the last root (`chordLastRoot`) when no root is held.
- **Chord type from a selector key → the host**: the VST3 processor writes it to `plain[]` and to
  `data.outputParameterChanges`; `SharedState::chordTypeEdits` lets the editor push it to the controller too (hosts that do
  not forward output changes); VST2 (`vst2.cpp`) gives the processor an `outChanges` list and forwards it (host automate,
  controller sync). Web: the worklet's `disp` message carries `chord` {root, last, notes, type, changed}; `app.js` follows
  `type` only when `changed`.
- Panel: the **CHORD MODE** button (a `toggle` on `chord_mode` in the keys section, left of the wheels; the web app draws toggles too) shows
  the card `section('chord')` at y 864 (`vis: chord_mode`; the panel grows by `CHORD_H` = 120: web `fit()`, plug-in `requestResize`, which
  `onTimer` calls when the parameter changes) with `chordpads` (W_CHORDPADS, the 12 pads in
  the selector octave's layout; a click sets the type and switches CHORD on), `chordname` (W_CHORDNAME), KEYS OCT step,
  voicing seg, BASS toggle, STRUM knob, `strumplate` (W_STRUMPLATE, drag across = plate notes). The keyboards tint the
  selector octave while CHORD is on. Same geometry in `ui.js` (`padRects`) and `editor.cpp` (`padRects`).
- Tests: `dsp_selftest` 11 (18 cases), `dsp_compare` / `dsp_render` 3 chord scenarios (`CHORD_SCRIPT` / `kChordScript`: keys,
  plate, all notes off), `quick.js` (a strummed chord and a plate note in the JS engine), `vst2_smoke` (MIDI selector key →
  Chord Type + automation, a root → the chord, release). Manual: `shared.js chordSection` (both manuals), screenshots
  `chord-card.png`, `chord-keys.png`.

**Beta 0.2 (chord layer).** BASS is on by default and is the first note of the chord: `chordNotes` puts it at `rootNote - 24` (+ 12 while under 24),
its voice plays `BASS_GAIN` = 1.4 louder (`vc.gain`, set by `trigger` from `nextGain`, which `holdOn(note, vel, gain)` loads; 1 for every other
note, so the old sound is bit-identical). `chordTrim` = `sqrt(3 / power)` when the chord's power (notes + 1.96 for the bass) is above a triad's:
every chord note is turned down by it, so a seventh with its bass does not press on the limiter (crackle): a triad without bass, a power chord
and a single note are untouched. **The chord follows the left hand**: `rechord` (called by a selector key pressed while a root is held, and by
`setParam` when `chord_type`, `chord_voicing` or `chord_bass` change under a held root) computes the new notes, releases the old ones that are
not in them with `holdOff(note, quick)` (`vc.quick`: `ampPass` ends such a release in `QUICK_REL` = 60 ms at most), leaves the shared notes
alone and starts the new ones with the root's velocity (no strum). `chord_type` stays set when the selector key is released: that is the left
hand's memory. Cross-check: `chordlive` scenarios (`LIVE_SCRIPT` / `kLiveScript`, with parameter events: kind 5).

### 3.3g SUPERMODULATION (Okto MultiWave Synth beta 0.2)
- **New parameters** (appended): `lfo_sp` (LFO 1 → SPARSITY, ± the amount), `lfo_res` (→ RESO, ± dB, kept in 0..24), `lfo_ew` (→ ENV>WAV: the morph is
  `wmorph + dMorph + lfo_wav·LFO + (env_wav + lfo_ew·LFO)·mod`). `lfo2_target` has 17 choices (appended): SPARSITY, SOURCE WIDTH, TILT, ODD BARS, EVEN
  BARS, SCALE SUSTAIN, WAVELET MORPH after the first ten. `ROLES` / `LFO2_TARGETS` / `LFO2_ROLE` are index-aligned (target i moves role i;
  `LFO2_TARGETS[i]` gives the span of the move); ODD / EVEN / MORPH have no single field (`kSlotRole` = -1: `prepBlock` moves the drawbars of odd /
  even bands and `control` the morph itself). The roles are `ROLE_*` constants generated into `spec.h`.
- **Variants** (replace the beta 0.4 phase sets): SPARSITY, SOURCE WIDTH and SOURCE PHASE change what the transform sees, so a subtractive oscillator
  is built at several values: `slotVariant(params, s)` = SPARSITY (`lfo_sp > 0` or LFO 2 on SPARSITY) before PHASE (LFO 2) before WIDTH (LFO 2, only
  a PULSE / TRI source) — one kind per oscillator, -1 none. Sets: PHASE 12 (`a_phase + k/12`, set 0 = the oscillator's own), SPARSITY `SPARSE_K` = 9
  (`k/8`, all of them), WIDTH `WIDTH_K` = 9 (0.02 … 0.98). JS `t.vk` + `t.ph` (also on `t.w2`); C++ `SlotTables::vk` + `phMips` …, `SlotRef::var[]` /
  `w2var[]` (index 0 = main for PHASE). Per voice and slot `control()` computes the place in each kind (`sl.vq0 / vq1[3]`: PHASE `d2·12` wrapped;
  SPARSITY `clamp(sparsity + lfo_sp·LFO + d2)·8`; WIDTH `(clamp(width + d2) - 0.02)/0.96·8`), `renderTable` crossfades the two nearest sets of the
  tables' own kind (wrapping for PHASE only). Rebuild when `variantSig(params)` (2 bits per oscillator) or `morphNeeded` changes (web `setParam`, VST
  `process` with `lastVarSig` / `lastMorph`). Cost: about 1 MB and 3-4 ms (C++) per set, ×2 with the morph; nothing when off.
- `lfo_res` is applied per voice in `control` (`res = clamp(fres + lfo_res·LFO, 0, 24)`, only when `lfo_res > 0`).
- Compatibility: every new amount defaults to 0 and every code path is exactly the old one then (`tests/regress_v07.js` and the cross-check pass).
- Presets: category **SuperModulation** (first in `CATEGORIES`): two oscillators of very different character and both LFOs moving two or more
  wavelet-domain controls, measured by `tools/supermod/audit.js` (the four most moving bands of the spectrum shape move > 3 dB more than without the
  modulation). Of the 222 older presets only about 30 move at all. The LFOs of the new presets are sine or triangle only (a saw, a square or a sample & hold jumps and the
  timbre clicks at the jump: the selection refuses them); a decaying sound is judged by how much its notes differ with the LFO phase (`onsetDiff`).

### 3.3h ORIENTAL KEYBOARD (beta 0.2)
- Parameters (appended, `perf`: never in a preset): `mt_mode` (0 Western, 1 Arabic, 2 Turkish: the three-position switch), `mt_scale` (`MICRO_SCALES`:
  Rast, Bayati / Uşşak, Hijaz / Hicaz, Saba, Nahawand / Buselik), `mt_tonic` (C..B). `MICRO_TABLES[tuning][scale][semitones above the tonic]` = cents from the
  equal-tempered key (generated: web `SPEC.MICRO`, C++ `kMicro`): Arabic = 24-tone equal temperament (degrees in cents, a quarter tone = 50), Turkish = 53
  commas of 1200/53 cents (the Arel-Ezgi-Uzdilek commas of each degree); a key that is not a degree keeps its piano pitch.
- `microSemis(pitch)` is added to the voice's pitch in `control()` (before octave, fine, bend and LFO; interpolated between the two neighbouring keys while a note glides;
  0 for Western, so the old sound is bit-identical). `Engine::noMicro` (set by the worklet while the demo's sequencer plays, until the voices die; the plug-in never sets it) keeps them in equal temperament. The keyboards mark the moved keys with an amber arrow.
- Panel: the `mt_mode` seg under CHORD MODE (keys section); `mt_scale` menu and `mt_tonic` step under the scalogram (SCOPE card, `vis: mt_mode`: widget-level `vis`
  works in the web app for `perf` parameters, in the plug-in for any).

### 3.3i THREE OSCILLATORS, FOLDER TABS, LFO 3 AND THE FILTER (Okto MultiWave Synth beta 0.3)
- **B2 is gone** (the owner's request): `SLOT_IDS = ['a1', 'a2', 'b1']`, so the 41 parameters of B2 left `tools/spec.js` and **every ParamID after them
  moved down by 41** (a deliberate break of the "append only" rule: Live Sets and user presets saved by beta 0.1 / 0.2 are not read
  correctly; the plug-in's state has a version, `kStateVersion = 2`, and `readState` refuses the others). The new parameters are **appended**: `lfo3_shape`, `lfo3_rate`,
  `lfo3_amt`, `lfo3_target`, `lfo3_sync`, `lfo3_div` (158–163), `lfo_view` (164, a perf parameter: the LFO 2 | LFO 3 sub-tab) and the ten `vf_*` of the filter (165–174): **175 parameters**.
  `osc_view` is 0..2; `NS` = `kNumSlots` (generated), `kSlots[3]`, `kSlotRole[3][19]`.
- **Presets.** `spec.js` leaves out every preset of `presets_new.js` / `presets_super.js` that plays B2 (`usesB2`: `b2_lvl > 0`; 67 of the 200 of beta 0.1, 125 of
  the 300 of beta 0.2) and strips the unused `b2_*` values of the others (`withoutB2`; a view of B2 is dropped). The files themselves are **not edited**
  (the 200 of beta 0.1 stay untouched); the numbers of the left-out presets are not reused, so the ratings file (keyed by the number) of the others
  stays valid. `PRESETS` = TOP, then the **600 of beta 0.3** (`presets_lfo3.js`, 501–1100, **generated** by `tools/supermod/build.js`), the 175 of beta 0.2, the 133 of beta 0.1:
  `NEW_COUNT` = 908 (`MW_NO_LFO3=1` leaves the 600 out: the builder compares its candidates with the other 330). Four demo-tour picks played B2 and were replaced (`TOUR_PICKS`).
  The recipes (`tools/make_presets.js`, `recipes_*.js`) still write B2 oscillators and cannot run on this spec any more (`P()` refuses a `B2` key): they are the record of how
  the 200 presets of beta 0.1 were made. The composer **was ported** (below).
- **LFO 3** is a second LFO of the LFO 2 kind: `lfo3_*` have the LFO 2's shape / rate / amount / target / sync (`E.lfo3Tick`, `lfo3Role`), the same `ROLES` (a role has
  the same range in every oscillator), and `roleVal` sums the moves of the two LFOs aimed at the same role (`d2 + d3`); the table "variants" (SPARSITY, PHASE, WIDTH, §3.3g)
  look at both. LFO 1 is untouched. The card (`lfo2` / `lfo3` sections, both titled "LFO 2/3", at the same place) shows one of them by the perf parameter `lfo_view`
  (the small 2 | 3 `seg`; `vis: 'lfo_view'`).
- **FILTER** (`vf_*`; `E.fltPrep` / `E.fltProcess`, `Engine::fltPrep` / `fltProcess`): per voice, **after the oscillators are mixed (rendered with a unit envelope into `vtL` / `vtR`) and
  before the amp envelope**, a four-pole low-pass: TPT stages with the feedback solved without delay for the linear ladder (`y4 = (G⁴u + S)/(1 + kG⁴)`), `G = g/(1+g)`, `g = tan(π fc / sr)`,
  `k = FLT_K · reso` (`FLT_K = 4.05`, just above the 4 where a four-pole ladder sings); a rational `tnh` (no library call) saturates: **LADDER** (`vf_type` 0) every stage, **OTA** (1) the input
  of the loop only, with `comp = 1 + 0.6k` for part of the low end. DRIVE saturates the input (`gin = 1 + 7 drive`, level-compensated). Cutoff in octaves = `vf_env · 8 · filter envelope`
  (an `Env` per voice, `fe`, gated with the amp and mod envelopes) `+ vf_key · (note − 60)/12 + LFO 2/3 FILTER CUTOFF` (the exponential target moves by `0.5 · amt · log2(max/min)` octaves,
  `roleSpan`); the coefficient `G` is interpolated per sample over the 32-sample block; a note starts with a cold filter. `fltOn` = **not** (`vf_cut >= 20000` and `vf_res = 0`, `vf_drive = 0`,
  `vf_env = 0` and no LFO aimed at it): the path is **bypassed** when open, so every older sound is bit-identical. LFO 2 / LFO 3 targets 17 / 18 = "Filter Cutoff" / "Filter Resonance"
  (`ROLES` `vfcut`, `vfres`). `tests/filter.js` checks it (spectra, resonance, saturation, key tracking, the envelope, the LFO targets, bypass), `tools/dsp_cases.js` has JS / C++ cases.
- **Panel.** `DEVICE.h` = 1050 (860 + the folder tabs, the plate, the FILTER row and the PLAY card). **Three folder tabs** `osctabs` (section `oscframe`, x 6 y 50: OSC1 A1 · SUBTRACTIVE |
  OSC2 A2 · SUBTRACTIVE | OSC3 B1 · ADDITIVE, 176 × 40 every 182 px; the header's ENGINE tabs are gone) choose the oscillator shown; the section also draws the **plate**, a soft tinted
  L-shaped frame (x 6 to 1094, y 88 to 511, notch from x 564 down to y 360) in the oscillator's colour (`kAccentA` yellow `#ffcf3d` for A1 and A2, `kAccentB` blue `#4aa8ff` for B1; the page's own
  chrome stays teal). A lit dot on a tab: the oscillator's level is above 0. **OSC MIX** (572, 56) and the **SCOPE · ALL OSCILLATORS** (704, 56) are common: outside the plate. Web: `oscTabs`
  in `ui.js`, `.otab` / `.oscframe` in `synth.css`; plug-in: `drawOscFrame`, `drawOscTabs` and the click in `editor.cpp`. Below the plate: FILTER (12, 520), AMP ENVELOPE, MOD ENVELOPE; LFO 1,
  LFO 2/3, VOICE (y 656); EFFECTS and the **PLAY** card (CHORD MODE, BASS, TUNING, MAQAM, TONIC; y 792); the keyboard (y 928). The preset browser is as tall as the panel.
- **Global scope and scalogram**: they show the sound, not the oscillator shown: `buildScopeSets` / `globalCycle` / `scopeBands` (JS) and `ScopeSets` / `globalCycle` / `scopeBands` (C++) add one cycle of
  every oscillator that plays (levels from `staticGains`, at C4) and the sub oscillator; static (no live per-oscillator animation).
- **The composer** (`tools/supermod/`) now writes three oscillators (A1 A2 B1; `CONFIGS` A1A2 40, A1B1 32, A1A2B1 24, A2B1 4): `mods.js` has an LFO 2 recipe set with a twin for LFO 3
  (`withLfo`, ids ending `_3`), two filter-LFO recipes (`l2FltCut`, `l2FltRes`) and `FLT` per kind of sound (`fltSetup`); `compose.js` `modulate()` gives **every preset** LFO 2 and / or LFO 3 on a
  wavelet control (both for SuperModulation; weights `w` favour the subtractive-only controls), at most one LFO per control (`canon`), the filter with `FLT_PROB` (about two thirds), and
  `perc.js` (new) draws the drums of the Drums & Perc category from 14 archetypes. `build.js` writes `tools/presets_lfo3.js` (50 per category, numbers 501–1100).

### 3.3j BETA 0.3.1: THE OWNER'S RATINGS, STARS, SKIP, A LIVE DISPLAY
- **Ratings** (`tools/ratings_beta03.js`: number -> stars from his files `sound 501 to sound 540.txt` ... ; `FAV` = six favourites he named, 7 stars, in TOP Sounds): `tools/spec.js` leaves out the presets rated < 5 (`lowRated`; numbers not
  reused), gives `stars` to the others (generated `kPresetStars`, the built-in votes) and puts those > 7 and `FAV` in TOP Sounds (`TOP_EXTRA` -> `kTopExtra` / `kNumTopExtra`, which `bank.h` `defaultLists()` appends to the first
  `kNumTop` of the TOP Sounds list). Version `0.3.1` (`APP`, `version.rc`, `common.h`).
- **Remaking the unrated presets**: `tools/supermod/taste.js` (a ridge regression of the stars on the features of a composer candidate: unison, chorus, reverb, delay, width, attack, release, peak, polyphony, bass; leave-one-out r = 0.43 on 80 ratings),
  `tools/supermod/rebuild.js` (the 600 of beta 0.3 in `tools/out/presets_lfo3_v1.js`: a rated one stays, an unrated one is replaced under the same number and category by the best predicted candidate of the pool, farthest-point first; plus `--extra 300`
  new SuperModulation presets 1101-1400 with at least two `INNOV` recipes), `compose.js` (`lush()`, `LAYER_W`, `INNOV`, the filter and the vibrato less often), `tools/supermod/gain.js` (renders the evaluation passage with the listening rules, compares with the same
  12 dB lower, lowers `master` by whole dB until the limiter changes the sound by < 0.4 %; `--apply`). Order: `build.js --no-write ... --pool` (candidates), `rebuild.js`, `gain.js --apply`, `gen_spec.js`.
- **Stars** (`bank.h`): `State.stars` (-1 = none given: the built-in vote shows), `BankPreset.stars`; the file has `Stars: N` in a factory preset's or a bank sound's block (a built-in vote the player cleared is `Stars: 0`); `Library::stars / setStars / setUserStars / starredCount`; the lists are `LIST ORDER v4` (the v3 lists of beta 0.3 are not read: the lists are rebuilt so that the new TOP Sounds show; `library_test` section 8b);
  EXPORT / IMPORT carry them. Editor: five stars with half stars at the right of a row (`bStarsR`, `drawRowStars`, `starHalf`, `bRate`); the browser is 420 px wide (`kBrowserW`).
- **Live scope / scalogram**: the engine publishes, for the last voice, the live gains and window of every oscillator that plays (`Display.sg / swin / mask`, `SharedState.sg / swin / smask`, JS `disp.sg`); `globalCycle` / `scopeBands` take an optional
  `live` (`ScopeLive` in C++) and use it instead of the static gains for the oscillators it names (`editor.cpp scopeLive`, `ui.js liveSlots()`). `tests/display_live.js`.


### 3.3k BETA 0.3.2: NO CRACKLE ON A LOUD CHORD, THE WINDOW FITS THE SCREEN
- **Output stage** (`web/js/core.js` / `vst/src/dsp.h`, operation for operation, cross-check kind `loud` in `tools/dsp_cases.js` + `dsp_compare.js` + `dsp_render.cpp`): `polyComp` (from the Wavelet Synthesizer beta 0.7.1: gain sqrt(POLY_FREE / nv), nv = the voices' energies over the loudest's,
  20 / 50 ms; the notes of the chord keyboard, `vc.gain != 1`, are not counted: `chordTrim` scales them) after the voices, and the **peak guard** just before `softLimit` (GUARD_T 0.9, attack 0.3 ms, hold 15 ms, release 150 ms; gain exactly 1 below 0.9; an idle
  skip and `reset` set it back to 1). Tests: `tests/regress_v07.js` plays one note then two notes over its release (three voices: the TOP Sounds stay within 2.1e-7 of beta 0.7; a denser chord is changed on purpose).
- **Measures**: `tools/crackle.js` (every preset, a chord at velocity 1: `d2` = waveform change after a gain fit per 20 ms, `d3` = its part above 3 kHz = the crackle; `--notes`, `--guard off`, `--nums`), `tools/supermod/loud.js` (peak of five loud chords at the preset's master;
  `--target 1.0 --apply` lowers the masters of presets numbered 501 and up by whole dB, run twice in beta 0.3.2: 1.15 then 1.0; 321 presets).
- **Window fit**: `zoomFactor` 0 = FIT (`plugin.cpp`; state "WSC2" stores 0; an older state holding exactly 1 reads as FIT, a chosen 100 % is stored as 1.0001); `editor.cpp updateAuto()` (work area of the monitor of the host window through `workAreaOf`, 100 px kept,
  clamp 0.5..1, in whole percents; recomputed in `requestResize`, `attached`, `getSize`); menu "Fit the window to the screen" + 50..150 %. Developer tests: `MW_WORKAREA=WxH` (a screen of that size; `vote_session` sets 3840x2160 and tests 1366x728).

### 3.3l BETA 0.3.3: THE COMPACT PANEL (V1)
- `tools/spec.js` `compactPanel()` moves and shortens the sections defined above it (DEVICE 1100 x 966; the wavelet card 250, the plate's second row 356..488, OSC MIX / SCOPE 290, rows at 496 / 622 (120 tall), EFFECTS 12,748 496x98 and PLAY 516,748 584x98 with `vtitle`
  (a 22 px strip, `SectionDef.vtitle`, the web `.section.vt`, `Canvas::textVertical`), keys 852 (98 tall), chord card at DEVICE.h + 4). The mock-up tools of the review are not in the repo (the owner's pictures: Maquettes_Okto).
- **Plug-in**: `devH()` adds `kChordH` only while CHORD MODE is on and the browser is closed; with the browser open the chord items (`chordItems`, section "chord") are re-laid out under the list (`layoutChordItems`, `bChordCard`, `drawChordInBrowser`; `bList()` is
  `kChordSideH + 6` shorter); `vote_session` section 1 and the screenshot 13_chord_in_browser.png.
- **Presets**: `NEW_TRIM_DB = 2` in `tools/spec.js` (every preset numbered 501 and up, until the owner has chosen the good ones; 0 = off).
- **Tests of a pre-release** are the light ones (the owner's rule): `tests/quick.js`, `vote_session`, `library_test`, `vst2_smoke`; the cross-check, `test_web` and the sweeps are for an official release.

### 3.3m BETA 0.3.4: THE PANEL OF THE MOCK-UPS P6 / Q1 / R6 (944 px), THE ORIENTAL COLOUR CODE
- The owner's chosen mock-ups (Maquettes_Okto v3 P6, v4 Q1 and R6; pictures made with the web app, so their geometry is the specification). `DEVICE` is 1100 x **944** (the row LFO 1 | LFO 2/3 | VOICE is 98 tall, 22 less; EFFECTS and PLAY 726, keys 830;
  PLAY ends at x 1088 like the cards above). `compactPanel()` in `tools/spec.js` places everything (`K0 = 32`: the knob row of the three cards of the row, one line).
- **LFO 1**: the wave selector (`seg` with `style: 'uline'` = 3) sits on the title line, underlined (the wave shown in the accent colour with a 2 px line under it). **LFO 2/3**: the card has no title (`tabbed: true` on both sections): the `lfotabs`
  widget (`lfo_view`, 246 x 25 at the top: a darker bar, two folder tabs 58 x 22 at x 6 and 66, a lit dot when the LFO's amount is not 0, the tab of the LFO shown filled with the accent colour; web `.ltab`, `ui.js lfoTabs`; plug-in `drawLfoTabs`,
  click in `mouseDown`), the plug-in's SYNC at (200, 4) in the bar, RATE (4) AMOUNT (54) and **SHAPE** (104) as knobs, TARGET 80 px wide at (160, 52) with the name cut by `…`. SHAPE is the choice parameter `lfo2_shape` / `lfo3_shape` on a knob
  (`style: 'choice'` = 4: five positions, 24 px a step, a click steps to the next one, the wheel steps, the name `choiceShort` under it in the accent colour). No parameter changed: `lfo_view` is still the parameter the tabs set.
- **WAVELET card** (subtractive): `knobL` (only SOURCE WIDTH and SPARSITY use it) is a 42 px disc in a 64 x 62 box (disc centre 32 / 22, label 9.5 px at 48), centres (326, 184) and (410, 184); the SOURCE CYCLE picture is 82 tall (R6).
- **Oriental colour code** (`ORIENT` in `tools/spec.js` -> web `SPEC.ORIENT.arab` / `.turk`, C++ `kOrientPals[2]`): while `mt_mode` (TUNING) is ARAB or TURK the accent is, for ARAB, sand-gold `#f0b84a` (oscillators A) / coral `#e46f4a` (B1), for TURK carmine `#ff5468` / amber `#ffb347`, instead of yellow / blue
  (web: class `orient` on `#device` and `#browser` + the CSS variables `--or-*`; plug-in: `orient` and `accentOf(mode)`), the cards stay grey, and the PLAY card is dressed (border and strip in the palette's c2, captions MAQAM / TONIC on a dark plate) with a
  **pattern of octagons and squares (4.8.8, an eight-pointed star in each octagon, tile 34 px, opacity 0.7)**: web, an SVG `<pattern>` (`orientPattern`, shown by CSS); plug-in, polygons drawn by `drawOrientCard` (only the tiles that meet the dirty
  rectangle, clipped by `Canvas::pushClipRR` / `popClip`, GDI+ and Core Graphics; each colour is mixed with the card's gradient once instead of a group opacity).
- **Tests**: `vote_session.cpp` section 8b (tabs, SHAPE knob, SYNC, ARAB / TURK by pixel colour, screenshots 14_* 15_* 16_*), `tests/web/smoke.js` (tabs, knob, knob line, colours, `tuning-arab.png`). The manuals still show the old panel: rebuild them (`node tools/manual/shots.js`, `build.js a b`) at the next release.
### 3.4 Table rebuilds
- Structural changes rebuild tables **off the audio thread** and switch with a 512-sample crossfade (`setTables`).
- Web: `app.js` builds the tables in a **Worker** (`startWorker` / `scheduleBuild` / `deliver`; a `data:` URL made of
  `WSCoreFactory.toString()`, so it works from `file://`; every request carries a sequence number and a result older than the last
  delivered is dropped; the display tables (`build(inWorker)` for the oscillator shown) use the same path; without Worker it falls
  back to the main thread). A preset load builds synchronously (the sound must be there at once); `heldTables` keeps the tables
  built before the audio starts. The arrays are transferred to the worklet (`'tables'` message).
- VST: `Processor` owns 4 `Tables` sets with states `kFree/kBuilding/kPending/kActive`, a worker thread builds them
  (`structVersion` / `builtVersion`), the audio thread picks up `pendingIdx` and recycles released sets. In **offline
  rendering** (`kOffline`) the rebuild is synchronous so exports never depend on thread timing.

### 3.5 Effects and output (`block`)
Voices → **drive** (tanh) → **triple chorus** (beta 0.2: three 6–12 ms delay lines swept by a slow and a fast LFO 120°
apart, L / C / R, on the mono sum) → **ping-pong delay** (up to 4 s, tempo sync §3.3e) → **reverb** (Freeverb topology) → 10 Hz **DC blocker** →
master volume (smoothed) → **soft limiter** (`LIMIT_T = 0.7`, never above 0 dBFS). `VOICE_GAIN = 0.4` gives chord headroom.
The C++ side also sets FTZ/DAZ during `process`. Okto MultiWave Synth beta 0.1 (CPU remarks, `Revue.md`):
- the chorus' LFOs are rotating vectors: `sin` / `cos` of both phases once per block, turned by one step per sample
  (`cosA sinA cosB sinB`), the three taps use `sin(a + 2πc/3) = sin a · CH_COS[c] + cos a · CH_SIN[c]`;
- `exp(x · LN10/20)` instead of `pow(10, x/20)` (filter gains, drive, master); `dwt` / `idwt` wrap with `& (M − 1)`;
- the smoothing constants of the delay time (0.0005), its filter (0.35), the master level (0.002) and the reverb damping (0.25) are
  *per sample at 48 kHz* (`rateCoef`: `1 − (1 − a)^(48000/sr)`, exactly `a` at 48 kHz), so the sound no longer depends on the host's rate;
- **idle rule** (`block`): with no voice, no table fade and `quiet ≥ quietNeed` the block is not computed (zeros out, `vol` and
  `dlyT` take their targets, the display state is published). `quiet` counts the samples whose output stayed under `QUIET_PEAK` = 1e-9
  with no voice; `quietNeed = 1.5 · max(delay time, dlyT) + 4096` while the delay can sound (an echo's gap must never fit in it),
  else 4096. `tests/idle_skip.js` checks that dry, delay, reverb and chorus sounds are identical with and without it;
- the reverb's 16 combs and 8 all-pass filters are flat arrays in JS (`cB cLen cI cF aB aLen aI`).
- **Crackle** (owner's remark, beta 0.2): the soft limiter acts per sample above `LIMIT_T`, so a loud chord that adds up beyond 0.7 is distorted. Measured on a hand-played six-note chord (velocity 0.9, the chord at master - 12 dB scaled back against it): 9 of the 222 older presets change by more than 3 % (131 Oboe, 121 String Machine II, 067 Pipe Organ Duo, 073 Fair Organ, 130 Clarinet, 064 Jazz Organ, 071 Theatre Organ II, 187 Spaceship, ...; lower VOLUME or the number of notes), 2 of the 300 new ones. They are not changed (the owner asked that the old presets never change; the limiter itself must keep the 22 TOP Sounds as in beta 0.7). The chord keyboard turns its notes down (`chordTrim`) and `tools/supermod/audit.js` refuses a candidate whose chord with its bass changes by more than 0.4 %.

### 3.6 JS ↔ C++ parity (non-negotiable)
`core.js` is the reference; `dsp.h` must follow it operation for operation (same constants, same order of floating-point
operations, Float32 buffers where JS uses `Float32Array`). **Both builds use `-ffp-contract=off`** (`vst/build.bat`, the
cross-check): clang would fuse multiply-adds on Apple silicon and change the sound. The rule is "same operations, same order";
what differs is the maths library (`sin`, `exp`, `tanh`) and float rounding of the buffers: the cross-check limit is **2e-6 of full
scale** (it was 1e-5 in the earlier code, 400 times looser than the real 2.4e-7; the beta 0.1 worst case is 1.8e-7). After
**any** DSP change, compile `vst/devtest/dsp_render.cpp` (`-ffp-contract=off`) and run `node tools/dsp_compare.js <dir>`
(`--list <dir>` first to write the cases), then `node tests/regress_v07.js` and `node tests/idle_skip.js`.

### 3.7 CPU optimisations (output bit-identical; the study is `Revue_CPU.md`)
The CPU load of a chord was measured and cut by about 35-40 % (167 presets, chords of 3 / 6 / 8 notes: mean 2.5 / 4.8 / 6.0 % of a core before, 1.6 / 2.9 / 3.6 % after; the worst preset of the 1182,
"Choir Keys", 27 % before and 11 % after on a chord of 6) **without changing one bit of the C++ output**: `core.js` did not change (no operation changed), the cross-check and `regress_v07` are as before.
- **Tools** (`vst/devtest/`, `tools/`): `cpu_bench.cpp` (thread CPU time = `QueryThreadCycleTime` at the TSC rate, never the wall clock; FTZ/DAZ as the plug-in sets them; `--dump` / `--check` compare renders with a reference, bit for bit;
  `--sample` is a sampling profiler read by `tools/cpu_profile.js`); `cpu_ab.cpp` + `cpu_ab_engine.cpp` run two builds of the engine (each compiled with `-Dws=ws_old` / `-Dws=ws_new` and its own `dsp.h`) in turn, render after
  render, which is the only fair comparison on a shared machine; `tools/cpu_cases.js` writes the cases (`all`, `check`, `sample`) and the preset features, `tools/cpu_report.js` the tables by class. Commands in `Revue_CPU.md`.
- **What `dsp.h` does now** (every line keeps the scalar operations and their order; without SSE2 the scalar form is compiled): `bandTerms` computes the interpolated terms of a table row two layers at a time (SSE2, the pairs
  that hold an active layer) and `renderVoice` adds them one by one in the order of the active list, as before; the per-sample ramp of the band gains is skipped while every step is exactly 0; an oscillator whose own
  envelope is exactly 0 for the block only moves its phases; the voices of a block go through the filter together (`filterVoices`: after all of them are rendered, sample by sample, the left / right pair of each stage
  in one SSE2 register, so that the chains of divisions of different voices overlap; the float sums of the mix are still added in voice order; the states `Voice::fs` are interleaved pairs, which is a layout, not a calculation:
  core.js keeps four left then four right); the results of pure functions of their inputs are memoised on the **exact** inputs (`Slot::mA..mFg`, `Voice::mSemis`, `fgMemo`, `ExpMemo` for the envelopes' `exp` factors, the
  unison copies, the output stage's `exp` / `tanh`): a new input of `filterGains`, the pitch, the mip level or an envelope factor must be part of its key; `softplus` below -9.5 and a resonance of +0 return their exact 0 without a
  libm call; `polyComp` with a settled gain is a plain scaling.
- **Rule**: a change here must give the same bits as the build before it. Check with `cpu_bench --dump` (reference) then `--check` on `cases_check.txt` (224 presets x chords of 3 / 6 / 8 x velocity 1 / 0.7), and render
  all cases of `dsp_render` with both builds and compare the files (`cmp`). A change that moves the sound (CTRL = 64, a higher threshold for the bands that are skipped, ...) belongs in the owner's decisions, see `Revue_CPU.md` §7.

### 3.3o WEB UPDATE 2026-10-21 (preview of 1.0.6; the plug-in is still 1.0.5)
- **A preset change is one message** (`app.js` `applyKeyed` -> `finalValues` -> `build(false, true, tables)` -> `{ t: 'bulk', v, tables }`), handled by `worklet.js` `presetChange`: with a voice sounding the output dips (`DUCK_DOWN` 2, `DUCK_HOLD` 3, `DUCK_UP` 8 quanta of 128 samples) and the change is made at the first silent quantum (`applyPending` -> `startMorph`): the choices and integers (`discrete`: curve `choice` / `int`) and the tables at once, the other parameters in `MORPH_QUANTA` (24) quanta by a smoothstep; a `p` message for a parameter being morphed wins; `all` ends the morph; nothing sounding (`!anyVoice()`) or a dip in progress: no dip. The engine (`core.js` / `dsp.h`) is untouched, so the cross-check does not change. Old behaviour, still understood: one `p` per parameter then `tables` (a knob move, the plug-in-like path). `tests/preset_change.js` runs the real worklet without a browser: click ten times smaller than the old way, dip, end state, no pending, no dip when idle, a move during the morph kept.
- **Demo**: `WSDemo.start` loads the first preset BEFORE posting `seq` (`st.t0` is set after), `sceneRules(sc)` is the demo's rules (TOUR_SAFE, caps, trim), the next scene's tables are built ahead by `api.prebuildPreset` (a second Worker, `prebuild()` in `app.js`; `applyKeyed` takes them when their values match). `TOUR`: `FIRST_OLD` (A · Wavelet Lead) first, then `FIRST_NEW` (AA · Deep Ripple, AB · Kalimba Lung Machine), `NOT_IN_DEMO` (AA · Flint Ripple Haze: the owner took it out of the whole tour, Deep Ripple took its place), the seven other old sounds spread (`OPENING` = 3 first slots). `SWAP_IN_DEMO` swaps a sound for another at its place without moving the others (AA · Morph of Brass -> A · Wave Brass: CPU 0.31 -> 0.06 of real time; the heaviest sounds of the demo are Morph of Brass and AAB · Rust Aurora, 0.33-0.37). After ANY change of the tour run `node tools/demo_level.js --trims 0 --write-trim` and `gen_spec`: a sound's trim depends on the window of the piece it plays.
- **Demo window** (`demo.js` `place()`): as far right as the page allows, in panel pixels (the panel is scaled): over the preset list when open (width = the list, 348), else in the free room right of the panel, else flush with the panel; `#device` has `z-index: 2` so it is above `#browser`. Dragging is limited to the same right edge.
- **Layout rule** (§10): nothing overlaps; `compactPanel` moves (ADSR pictures 6 px up, knobs 4 px down in FILTER / AMP / MOD; selector 4 px up and knobs 3 px down in the SCALE FILTER and POSITION cards; the wavelet card's selector 6 px up and its right column 62 px apart; TUNE toggle and picture 2 px up), `tests/quick.js` `layout`, `tests/web/overlap.js` in `smoke.js`.

### 3.3n VERSION 1.0: THE FINAL LIST (the official release)
- **Selection** (`tools/spec.js`): `tools/ratings_final.js` (GENERATED by `node tools/review_export.js "<exported presets file>" --write tools/ratings_final.js --baseline <spec.js of the version he rated>`: stars by number, by name for the
  TOP Sounds of beta 0.7, and the presets he adjusted: the parameters he changed + `master_delta`) from his export of 2026-10-20 17:03. `lowRated` = not rated 3 or more (of 10): the 237 presets that stay are the ones he rated 3 or more
  (21 of the 22 TOP Sounds of beta 0.7 + 216 numbered); the unrated ones (the 250 of `presets_filter.js` / `presets_fav.js`, made after his listening) and the 0 to 2 stars are out. `applyAdj` bakes his adjusted values in.
  `NEW_RAW` and `TOP_RAW` are sorted by stars, best first.
- **Lists**: `TOP_LIST` (indices; the 21 TOP Sounds of beta 0.7 + `TOP_EXTRA`, the presets rated above 7, sorted by stars) = C++ `kTopList` (54), the plug-in's TOP Sounds list (`defaultLists` in `bank.h`; "LIST ORDER v5": the lists of
  a beta 0.3.3 file, "v4", are not read, so the sorted lists apply whatever file the player had); the web app's TOP Sounds = the first `TOP` presets of the array (21). `DEFAULT_PRESET` = `PRESETS[TOP_LIST[0]]` (*A · Wave Brass*), the sound the app and a
  new plug-in instance open on. `rank`: every category is sorted by stars (best first; a tie: the earlier one in the array).
- **Sections**: `CATEGORIES` = Pad, SuperModulation, Bass, Lead, Keyboard, Organ, Strings, Brass & Wind, Bells & Mallets, FX, Drums & Perc; `SECTION_OF` = { Keys: 'Keyboard', Pluck: 'Keyboard' } is applied to `cat` after the presets are built. The user bank's
  own sections (`kBankSections` in `bank.h`: "My presets") keep their names: they are the player's, stored by name in the presets file.
- **1.0.5**: the oscillator tab and its plate are one outline, the "trail of light": web `oscTabs()` in `ui.js` builds the path of the tab shown + the plate (`outline(v)`), two gradients `oscStroke` / `oscFill` (stop colours set by `outlinePaint`, which `update()`, `updateOrient()` call), `svg.oscframe` in `synth.css` (glow = drop-shadow); plug-in `drawOscFrame` (the same corners with `roundedPoly`, a gradient fill, the stroke in 4 px pieces with `alphaAt`). `ORIENT` is `{ arab, turk, tile, opacity }`: ARAB sand-gold, TURK carmine (web `orientPal()`, `orientMode`; plug-in `kOrientPals[2]`, `opal()`, `orientMode`).
- **1.0.4**: `TOUR` (the demo) is built in `spec.js` from the best presets of `ratings_v3` (`before3` order) + `KEEP_OLD`, the eight sounds of the old tour the owner keeps, spread over the 28 heard places (they play with the `DEMO_PRESETS` values); `tools/demo_trim.js` (`node tools/demo_level.js --trims 0 --write-trim`, run it after any change of the tour or of the presets) gives the whole dB each tour preset goes down in the demo (`WS_SPEC.DEMO_TRIM`, applied by `demo.js`, checked by `test_demo.js`); `PIN_FIRST` keeps *AA · Flint Ripple Haze* first of everything.
- **1.0.3**: `TOP_LIST` starts with the best 20 % of the rated presets (`spec.js`: the seven 10-star ones, then the old members by `before3`); the web uses `TOP_LIST` for its TOP Sounds list and shows `stars` (the vote of `ratings_v3`, `vote` in `spec.js`, web spec only) as a read-only bar (`.rate` in `synth.css`, `ui.js`); the C++ `kPresetStars` stay zero. **KeyAttac**: `KEYATTAC` in `spec.js` (`percussive()` on the starred presets, masters from `tools/keyattac_adjust.js`, written by `node tools/supermod/loud.js --keyattac --target 0.7 --apply`), emitted as `kKeyAttac[]` and `SPEC.KEYATTAC`; `bank.h` has the user-bank section `KeyAttac` and `seedKeyAttac` (while the file is older than `LIST ORDER v7`; `State.fileVer`).
- **1.0.2**: `tools/ratings_v3.js` (his export of 2026-10-20 20:51, by current name) orders every section and the TOP Sounds (`before3` in `spec.js`: more stars now, then the stars of the second listening, then the array order), moves the SuperModulation presets without stars to the section `Other` (last in `CATEGORIES`) and bakes in the one preset he adjusted; `TOUR[2]` / `TOUR[3]` (the first two presets heard) are two of his favourites, taken from the factory list (`DEMO_PRESETS` first, then `PRESETS`). The web TOP list goes by rank too. `bank.h`: `LIST ORDER v6` (v5 lists are rebuilt; v5 stars are kept, `keepStars`; a file older than 1.0 loses its stars).
- **1.0.1**: `tools/master_adjust.js` holds the whole dB each preset goes down (by number; the TOP Sounds by name, applied in `spec.js` by `lowerMaster`): `node tools/supermod/loud.js --spec --all --target 0.7 [--apply]` plays eight loud chords (the three big ones included) at velocity 1 and lowers the masters until none reaches 0.7 before the output stage (re-run it after any change of a sound; `tests/regress_v07.js` compares the TOP Sounds at their lowered masters). The keys of the CHORD MODE selector octave make no sound: `selHeld` (`core.js`, `dsp.h`) keeps them while held and `worklet.js` / `plugin.cpp` publish them with the sounding keys so that the keyboards light them.
- **Names**: `spec.js` renames the presets after the sections: "NNNN A1A2B1 · Title" -> "AAB · Title" (`typeOf`: A, AA, AB, AAB, B); `id` keeps the old numbered name (web spec only: `tools/crackle.js`, `tools/supermod/loud.js` and the manual read the number from `p.id`); the tour's "new:<title>" picks and `DESCRIPTIONS` follow the new names. The browsers colour the letters (`splitName` / `engHTML` in `ui.js`, `nameText` in `editor.cpp`). **Stars**: `kPresetStars` is all zero (no built-in vote: `gen_spec.js`), the library ignores the stars of a file that does not say LIST ORDER v5 (`bank.h`); the sort order still comes from the owner's ratings (`ratings_final.js`). **Header**: OKTOWAVE / FRACTAL WAVELET SYNTHESIZER (`ui.js logo()`, `drawLogo`); the product, the VST name and the manual keep "Okto MultiWave Synth".
- **Demo tour** (web): `TOUR` = the tour of the Wavelet Synthesizer's web app beta 0.7.1 (`tools/demo_presets.js`, from `tools/demo_presets_extract.js <folder of that web app>`: the order and the values of its 30 presets); `DEMO_PRESETS` (converted by `convertLegacy`, web spec only) are the presets it plays (app.js `applyPreset` looks there first); they are in no browser list. Same piece, same level as that app (the Okto engine renders them at the same RMS: 0.00 dB median).
- **Removed**: EVALUATE SOUNDS (web `evaluate.js`, the header widget, the plug-in's vote block, `vote_data.h`), the demo's extra songs and menu, the loading of a MIDI file (`tools/midi.js` keeps the parser for the tests).
- **Manual**: chapter `intro` (`tools/manual/mw.js`: `introChapter`; figures `decomp-*` and `path-*` in `figs.js`), presets chapter from the spec (`presetTable`); presets cited by what they do (`pick()`), never by name.
- **Checks**: `node tests/full.js --parallel` (two lanes: web in headless Edge, everything else: build, cross-check, regress, engine tests, `library_test`, `vst2_smoke`, `vote_session`, three crackle sweeps; about 25 minutes). After any sound change run `node tools/supermod/loud.js --spec --apply`
  (the per-preset master calibration, `tools/master_adjust.js`). Version 1.0 / `1.0.0` in `spec.js` (`APP.version`), `version.rc`, `common.h` (`WS_VERSION`), `CITATION.cff`.

## 4. Web app (`web/`)
- `spec.js` (generated) → `core.js` → `worklet.js` (AudioWorkletProcessor; also a sample-accurate **sequencer** for the
  demo) → `ui.js` (`SynthUI`: builds the panel from the layout; knobs, segments, drawbars, canvases, preset menu,
  demo button, MIDI-learn right-click) → `app.js` (parameters, presets, tables, audio lifecycle, MIDI, keyboard,
  manuals overlay) → `demo.js` (demo player) with `demo_data.js` (generated, one song).
- The worklet code is serialised (`WSCoreFactory.toString()`, `WSWorkletMain.toString()`) and loaded from a **data:
  URL** so the app works from `file://` (blob: URLs fail there).
- Audio lifecycle: one playing window at a time (`localStorage 'mw.audioOwner'` + `storage` event), `pagehide` closes
  the AudioContext.
- MIDI (Web MIDI, all inputs): notes, bend, CC1, CC64, CC120/123, **channel filter** (`ws.midiCh`), **Program Change**
  → preset, **MIDI learn** (`ws.ccMap`: CC → parameter key; validated on load). Stored data is untrusted: names are
  escaped / set with `textContent`, values clamped.
- Demo: `demo_data.js` holds **one song** (Beethoven, Appassionata III; the final version removed the other songs, the song menu next to DEMO and the MIDI file loading); it plays the **preset tour** `WS_SPEC.TOUR` (`tools/spec.js` `TOUR_PICKS`, written out so
  that new presets never change the demo), one preset about every 4 s snapped to chord onsets (`tourScenes`); the window shows
  `TOUR_INTRO` (the idea of three oscillators in plain words) during the first presets, then `presetSummary` (the oscillators that
  play, their waves / patterns, tuning, own and pitch envelopes, effects). The old animated-scene demos were removed.
  (The paragraph below is the Wavelet Synthesizer's.) `make_demo.js` `start` cuts the opening chords; the song keeps `origin` (7.84 s) and
  `tourScenes(..., origin)` computes the grid on the whole piece, then starts with the preset playing at the cut, so the
  cut changes nothing after it. `demo.tourPlan()` (`WS_TEST.demoTour`) returns the plan for tests and the manual (`WS_TEST.demoStart`, `demoSong`, `demoState`, `demoStop`).
  beta 0.7 tour: OktoPierre's 16 sounds of the earlier tour mixed one by one with his TOP Sounds (`EXPECTED_TOUR` in
  `test_demo.js`); during the first presets the demo window shows `TOUR_INTRO` (the idea in plain words, one sentence
  per preset) instead of the preset summary.
- Preset browser (beta 0.3, `ui.makeBrowser` / `renderBrowser`): a `#browser` element beside `#device` (the panel keeps
  its 1100 × 720 box: the test suites locate it by that shape), scaled with it by `fit()`; lists = TOP Sounds (the first
  `TOP` presets) and the categories sorted by `rank`, as the plug-in's defaults; selection only. beta 0.5: the arrow keys
  (`app.js` keydown → `ui.browserKey`: ↑ ↓ the sound above / below, ← → the category; browser hidden: `presetStep`). Open state
  in `localStorage 'mw.browser'`; `#nobrowser` in the address leaves it out (manual screenshots, `tools/manual/shots.js`).
  The preset name opens it when hidden, else the classic menu. Beta 0.2: `setPresetName` calls `bReveal()` when the sound changed (`bShown`), so a sound chosen with the
  preset box (arrows, menu, MIDI program change, the demo) shows its category and its row at the right; a knob moved on the same sound leaves the bank being looked at.
  The plug-in's `bFollow()` (called by `onTimer` when the parameters change) does the same and keeps the scroll when the row is already in view.
- beta 0.6 **welcome window** (`index.html` `.welcome`, shown at page open): "Run the demo" (`#w-demo`), "Play the synth"
  (`#start-btn`, starts the audio, plays no note; "MIDI supported"), "Download the VST" (`#w-vst`, the GitHub releases
  page, `target _blank rel noopener`). Browsers allow sound only after a click: each choice is that click. `setOverlay`
  makes the panel `inert` while it is shown; it comes back (paused audio, another window playing) with the reason in
  `#w-sub`. Header: DOWNLOAD VST (`VST_RELEASES` in `ui.js`) and one MANUAL button (the manual of the engine shown, in
  the overlay viewer).
- Test hooks: `window.WS_TEST` (used by the test suites). `node.onprocessorerror` tells the player when the worklet fails. The animated
  canvases are drawn when `setLive` saw a change (`liveVer`), while the meter falls back and twice a second at rest.
- Other storage keys: `ws.user` (user presets), `ws.state`.

## 5. Plugin (`vst/src/`)
- **No SDK helper library**: `plugin.cpp` implements `IComponent`/`IAudioProcessor` (Processor) and
  `IEditController`/`IMidiMapping` (Controller) directly on the interface headers, plus the factory and minimal
  `IMessage`/`IAttributeList` (argument-checked).
- Processor ↔ controller: `IConnectionPoint` messages `"ws.hello"` / `"ws.shared"` carry the id of a process-wide
  `SharedState` registry entry (`weak_ptr`, never a raw pointer): live display data and on-screen keyboard notes.
- **State**: processor `"WSY1"` = (id, double) pairs, validated (count, id range, finite, clamped); controller `"WSC2"`
  = zoom, modified flag, **preset name** (older `"WSC1"` index states are translated through `kBeta01Order`). beta 0.5: a
  name of `kLeftOutPresets` is kept as `formerName` (`EditorHost::formerPresetName`: the panel shows it, getState
  writes it back, SAVE PRESET saves it to the user bank); any other unknown name is still ignored.
- `editor.cpp`: the panel, drawn from the layout tables, zoom menu, preset popup, the MANUAL button (beta 0.6: one button,
  opens `Contents/Resources/manual/manual-a.html` or `manual-b.html` of the bundle for the engine shown), the SYNC toggles
  (`W_TOGGLE`, a gesture 0 / 1; widgets with `vis` are redrawn when their choice parameter changes) — the same code on
  both systems. It draws through `Canvas`
  (`editor_platform.h`: rectangles, rounded rectangles, ellipses, arcs, lines, polygons, linear gradients, text with
  GDI+'s layout — 1/6 em margins —, a nearest-neighbour image) and talks to the system window through `EditorWindow`
  (invalidate, size, capture, modifier keys, pop-up menus as a `MenuItem` tree, message / Yes-No / save windows, save-file
  dialog, reveal, open). The window calls back through `EditorEvents` (paint, timer, mouse, wheel, `key`, `testCommand`). beta 0.5 keys: a click in
  the browser calls `EditorWindow::takeFocus` (Windows `SetFocus`, `WM_GETDLGCODE` = arrows, other keys sent on to the
  parent window; macOS first responder once wanted, `keyDown:` passes other keys up the responder chain); hosts also call
  `IPlugView::onKeyDown` (VST2 `effEditKeyDown`); `Editor::key` counts a key arriving both ways within 12 ms once.
  - `editor_win.cpp`: Win32 child window + GDI+ into a back buffer, DPI-aware (exactly the beta 0.3 Windows code: keep
    its screenshots identical, `tests/vst3host` compares them); the save window is an in-memory dialog template.
  - `editor_mac.mm` (ARC): a flipped NSView of a class created at run time under a name unique to the binary (two
    versions in one host never share a class), Core Graphics + Core Text (system font at 95 %: it is ~5 % wider than Segoe
    UI), sizes in points (no `setContentScaleFactor`: macOS scales for Retina), a 30 Hz `CFRunLoopTimer` in the common
    modes, NSMenu (target/action, tab → "  (n)"), NSAlert windows (the save window: an accessory view, text field
    `ws.name`), NSSavePanel; Cmd = Ctrl (reset), Control-click = right-click; modifier keys read from the mouse event;
    `wsTestCommand:` = the Windows `WM_APP + 1` test hook.
- **Preset library** (beta 0.3, VST only): `bank.h`, `Library::get()` (one per process, mutex, reads the file again
  when its write time or size changes: several instances; Okto MultiWave Synth: readers look at the file at most every 500 ms, every edit
  and `refresh()` look first; the plug-in's folder is asked once; a file longer than 16 MB is read cut and `tooBig` makes every edit
  refuse, so it is never written back cut; `writeTextFile` flushes before it replaces). One text file `OKTOMULTIWAVE presets.txt` next to the `.vst3`
  bundle folder (`libraryFolder`; `WS_PRESETS_FILE` / `WS_PRESETS_EXPORT` / `WS_PRESETS_IMPORT` for tests), written atomically after every
  edit (an error leaves the state unchanged): `######## FACTORY PRESETS` (every preset: `Preset:` its name now,
  `Factory:` its built-in name = the key, `Adjusted: yes|no`, optional `Deleted: yes`, then `  key: value   (Name: shown)`
  for the parameters that differ from the defaults, ENGINE and A/B MIX always; only adjusted blocks override the built-in
  values), `######## LIST ORDER v4` (beta 0.5 "v2", beta 0.7 "v3", beta 0.3.1 "v4": what TOP Sounds and each category hold, in order,
  `N. built-in name`; a preset the file does not know — no `Factory:` block — takes its default places, a known one in no
  category goes back to its own; files without "v3" — beta 0.3 to 0.6 — keep their adjusted / deleted presets and bank but
  not their lists, which are rebuilt with this version's TOP Sounds and categories;
  an adjusted block equal to the built-in preset is not "adjusted"), `######## USER BANK` (12 `kBankSections`, `Preset:`, `From:`, values). A
  beta 0.3 user-bank file (`Okto MultiWave Synth user bank.txt`) is read when the library file does not exist. Parsing
  ignores unknown lines and clamps values. `importFrom` (beta 0.4 IMPORT) reads and checks another file (a `Preset:` line), parses it
  over the built-in state, keeps the current file as `OKTOMULTIWAVE presets (backup YYYY-MM-DD HHMM[ n]).txt` (never over an
  earlier backup), then commits; an error leaves the library unchanged. The controller takes factory values and names from the library (`loadPreset`,
  `exactPreset`, `findPreset` = name now or built-in name, new instances' default preset, VST2 program names).
- **Editor, presets** (beta 0.3): the **preset browser** (`kBrowserW` = 360 logical px added at the right while open;
  `browserOpen` kept by the controller, written in `"WSC2"` as a trailing int32 only when closed, so other states stay
  byte-identical): FACTORY / USER BANK tabs, the lists of the library, one click loads, ▲ ▼ `moveInList` / `moveUser`,
  buttons TO BANK, RESTORE, DELETE, EXPORT, IMPORT (beta 0.4, `bankImport`, `kCmdBankImport` 903, `openFileDialog`:
  GetOpenFileNameW / NSOpenPanel; FILE = "Show the presets file" in the right-click menu); the list's scroll bar
  (beta 0.4, `bScrollR` 12 px, `bThumb` ≥ 28 px, hit code 30: drag the thumb, a click on the bar centres it there);
  beta 0.5: a row dragged onto a category (`rowDrag` / `dropCat`, the category lit, the name under the pointer) =
  `moveFactory` (`Library::moveToCategory`, back to its own category at its rank; TOP Sounds = `setTop`) or, in the
  user tab, `moveBank` (`moveUserTo`, refused on a namesake); right-click on a row = its menu (Move to ▸, Back to …,
  Add to / Remove from TOP Sounds: `kCmdMoveTo` 7000 + list, `kCmdTopAdd` 7100, `kCmdTopRemove` 7101 on `ctxRow`; as test
  commands they act on the sound playing); ★ = in TOP Sounds now (`Library::inTop`); **SAVE PRESET** (`kSaveBtn`, the preset box is shorter) adjusts the
  factory preset (`Library::adjust`, then `presetStored`) or replaces the bank sound; DELETE = `setDeleted` (lists and
  ◀ ▶ skip it; the right-click menu's "Deleted presets" brings it back). The preset name opens the browser, a right-click
  the classic menu. Save window: an in-memory dialog template (name, optional section and note). Commands also reachable
  as `WM_APP + 1` (test hook). Controller: `loadUserSound` (group edit, keeps `presetIdx` for ◀ ▶), `userPresetName()`;
  the state `"WSC2"` stores `"USER · name"` for a bank sound (name buffer 512, no NUL byte; an unknown name is taken only
  with that prefix). Knobs with ≤ 5 positions: 24 px per step, a click = next value (web `dragBehaviour` too). The
  panel's logo reads OKTOMULTIWAVE / WAVELET SYNTHESIZER (both products; the plug-in keeps its name).
- `vst2.cpp`: `VSTPluginMain` with VST 2.4 declarations written from the public binary layout (no Steinberg VST2 file).
  It hosts the same Processor + Controller in-process (parameter queues, event list, chunk `"WSV2"` = both states,
  programs = factory presets, editor via `IPlugView` + `IPlugFrame`).
- **Bundle**: `OktoMultiWaveSynth.vst3/Contents/x86_64-win/OktoMultiWaveSynth.vst3` (VST3) + a copy named
  `OktoMultiWaveSynth.dll` (found by hosts scanning a VST2 folder) + `Contents/Resources/` (manuals, licences).
  Only Windows system DLLs and the UCRT are imported.
- **macOS bundle**: `OktoMultiWaveSynth.vst3/Contents/MacOS/OktoMultiWaveSynth` (universal Mach-O bundle exporting only
  `GetPluginFactory`, `bundleEntry`, `bundleExit`; `-fvisibility=hidden`), `Info.plist` (BNDL,
  `com.oktopierre.oktomultiwavesynth.vst3`, version from `WS_VERSION`), `PkgInfo`, `Resources/` (manuals, licences),
  ad-hoc signed. Same class IDs as on Windows. The presets file is written next to the bundle (`libraryFolder`: up from
  `Contents/MacOS`), so the player installs into `~/Library/Audio/Plug-Ins/VST3`. Flush-to-zero: MXCSR on x86, FPCR.FZ on
  Apple silicon. No VST2 on macOS.

## 6. Security hardening already in place (keep it)
The MIDI file reader (`tools/midi.js`, the demo converter; the web app reads no MIDI file any more) bounds every length to the bytes present (VLQ ≤ 4 bytes, binary-search tempo map); oscillator phase
wrap and above-Nyquist silence (prevented an out-of-bounds read); state/chunk/attribute parsing validated; MIDI-learn
and channel data validated; `install.bat` relaunches itself elevated instead of building a command line.
beta 0.6 (independent security review, no intentional malicious code found): `reveal` starts explorer.exe by its full
path (`GetSystemWindowsDirectoryW`); the presets library limits a file from someone else (`kMaxBankSounds` 2000 — IMPORT
refused above, `putUser` refuses a new sound when full —, `kMaxNameBytes` 160 via `clipName`, IMPORT refused at 16 MB);
`setTempo` holds the tempo at 1000 BPM (JS and C++); the processor and VST2 ignore sample rates outside `kMinRate` /
`kMaxRate` (8 kHz – 1.536 MHz, `common.h`); the web app keeps only well-formed `ws.user` entries. Known and accepted: the
test hooks (`WS_PRESETS_*` environment variables, `WM_APP + 1`, `wsTestCommand:`) stay in the release build because the
suites drive the shipped binary (they cross no privilege boundary); no CSP meta (the worklet is a `data:` URL and the app
runs from `file://`); GitHub Actions pinned by tag.

## 7. Building and manuals
- `vst/build_mac.sh` (macOS): `plugin editor iids` + `editor_mac.mm` (ARC) + `funknown.cpp`, universal, **`-ffp-contract=off`**
  (clang fuses multiply-adds on Apple silicon by default, which would change the sound), ad-hoc `codesign`. The Mac zip is
  made by the workflow (`ditto`, so the bundle keeps its permissions and signature), not on Windows.
- `vst\build.bat`: regenerates the spec (if Node is present), compiles `plugin editor editor_win iids vst2` + `funknown.cpp`
  (`-ffp-contract=off`), links statically (`-lgdiplus -lgdi32 -luser32 -lshell32 -lole32 -luuid`), copies the `.dll`, manuals and licences
  into the bundle. The DLL cannot be relinked while a host has it loaded.
- Manuals: `node tools/manual/shots.js` (UI screenshots, muted headless Edge) then `node tools/manual/build.js a b`.
  The text is generated from the spec (ranges, defaults) and from `core.js` (figures).

## 8. Tests
Beta 0.3 (B2 removed, folder tabs, LFO 3, FILTER, 600 presets): the cases of the cross-check are 1000 (930 presets + 70 variants of `tools/dsp_cases.js`: B2 variants use B1 and A2, LFO 3 on
its targets and with LFO 2, the filter in both characters with resonance, drive, key tracking, the envelope and the LFO targets; worst 3.6e-7), `tests/filter.js` (new: the voice filter's spectra, resonance, saturation, key tracking,
envelope, LFO targets, bypass when open, stability under random settings), `tests/web/smoke.js` checks the three folder tabs, the cards of each view (one wavelet card, SCALE FILTER, POSITION and TUNE, OSC MIX, the SCOPE, FILTER, LFO 1 always
there) and the LFO 2 | LFO 3 sub-tab, `tests/web/test_web.js` clicks the tabs and maps the 1050 px panel (`DEV_H`), `vst/devtest/vote_session.cpp` clicks the three tabs, `vst/devtest/library_test.cpp` reads 3- and 4-digit numbers, `tests/quick.js` plays the last sustained sound instead of the last preset (a tambourine of a few tens of ms was missed by the 150 ms polling in about
one run in three; the level is read every 50 ms) and `--dsp` writes the list of cases first. After a change of the factory order run `node tests/vst3host/make_presets.js`.

Beta 0.2 adds `tests/supermod.js` (the variants' tables, the destinations moving the sound, BASS and the chord that follows the left hand, the oriental tunings measured by
the frequency they play) and 26 cross-check cases (577 in all, with the 522 presets: LFO 1 / LFO 2 on every new destination, the live chord scenarios, the tunings with a glide and a chord).
Okto MultiWave Synth beta 0.1 status. **Maintained and passing**: `tests/quick.js` (20 s: syntax, generated files up to date, JS engine
on the 222 presets + chord layer + hostile MIDI, the VST3 host's `params,audio,offline,attrlist` sections, the web app's first
checks), `tests/regress_v07.js`, `tests/idle_skip.js`, `tests/web/smoke.js` (three oscillator views with their folder tabs, CHORD MODE, no console error), `tools/dsp_compare.js` + `vst/devtest/dsp_render.cpp` (1000 cases), `vst/devtest/vote_session.cpp` (the plug-in's window in an off-screen window: folder tabs, CHORD MODE, fit to the screen, the preset browser and its stars, screenshots; build line at its
top; its presets file goes to its output folder through `WS_PRESETS_FILE`, so it never touches the player's file; it was the EVALUATE SOUNDS test, removed in the final version), `tests/web/test_web.js` (adapted: the
oscillator tabs, 860 px panel, no Source Phase, a neutral patch made of the spec defaults — there is no Init preset; the full run plays all
222 presets and takes about 10 minutes), `tests/web/test_demo.js` (the demo, one song, is a preset tour: the plan against the spec's `TOUR`, the
welcome sentences, the forced playing rules, stop paths, no arrow / menu / MIDI input / EVALUATE button; `--smoke` about 1.5 minutes), `tools/dsp_selftest.js` (12 sections; 12 =
the four oscillators), `vst/devtest/library_test.cpp` (the presets file, no window), `vst/devtest/vst2_smoke.cpp`. `tests/vst3host` with `--skip-editor`: the sections params, audio, state, offline, presets, sub, porta, stress, instances and sync pass (190 checks).
**Not ported** (they drive the Wavelet Synthesizer's presets, panel or screenshots, or the macOS build): `vst/devtest/bank_session.cpp`,
the controller-state and editor sections of `tests/vst3host` (the editor one hangs on a popup menu), `tests/machost`. Run them only after porting them. The old descriptions follow.
- `tests/vst3host/vst3host.exe <bundle> <outdir> [--quick] [--only a,b]`: DAW-like VST3 host (parameters, audio,
  state, controller state, offline, presets, sub, portamento, high notes, attribute list, editor screenshots, reload).
- `tests/web/test_web.js`, `tests/web/test_demo.js [--smoke]`: browser suites through `tests/web/cdp.js`.
- `vst/devtest/vst2_smoke.cpp`, `tools/dsp_compare.js`, `tools/dsp_selftest.js`; `tests/quick.js` (fast check).
- `vst/devtest/bank_session.cpp` (beta 0.3): the preset library driven through the editor like a player (browser clicks,
  SAVE PRESET / rename / refused name, RESTORE, DELETE and back, ▲ ▼, the user bank, EXPORT, OCT click, LFO 2 menu, HIDE,
  unwritable folder, the file read back after the plug-in is unloaded and loaded; beta 0.4: the scroll bar dragged and
  clicked on the Source Phase sounds, IMPORT with its backup copies and a refused file; beta 0.5: a sound dragged onto
  Bass and back by its menu, onto TOP Sounds and out, the arrow keys (window messages and `onKeyDown`), a bank sound
  dragged to another section). The save windows and message boxes are
  answered by a helper thread (a single-OK message box closes with IDCANCEL).
- `tools/dsp_compare.js` / `dsp_render.cpp` also render LFO 2 on each of its targets, and (beta 0.4) four SOURCE PHASE
  variants: static (Haar saw, noise) and moved by LFO 2 with WAVELET MORPH and with A/B MIX (every phase-set slot).
- beta 0.4: `node tools/phase_effect.js` measures every phased preset (phase 0 against its phase, static cycle at middle
  C); `dsp_selftest` 8 checks phase 0 = the beta 0.3 source, the Haar band-6 effect (> 10 dB), the noise shift, the phase
  sets; `dsp_selftest` 9: no stuck note when a preset switches VOICES while a key is held. The 153 older presets were checked bit-identical against beta 0.3 (old and new `core.js`, same scenario). beta 0.5:
  the 144 presets kept unchanged are bit-identical with beta 0.4 (commit 2a929cb), the 6 adjusted differ only in the
  values OktoPierre changed; `tests/vst3host` checks a WSC1 / WSC2 state naming a left-out preset.
- `tests/vst3host`: `scaled()` maps layout points with the height scale (the browser makes the editor wider).
- beta 0.6 (tempo sync): `tests/vst3host --only sync` measures the first echo of a note with the delay SYNC'd at several
  host tempos (`Instance::hostTempo`; 1/4, 1/8 D, 1/8 T, 1/1 held at 4 s, SYNC off); `dsp_compare` / `dsp_render` take a
  tempo and render 3 sync variants (delay, LFO 1, LFO 2); `dsp_selftest` 10 checks note lengths at several tempos, the
  4 s cap (a 1/1 echo at 60 BPM after 4 s), no tempo or SYNC off = the knobs' values; `bank_session` step 9b clicks the three SYNC buttons and steps TIME with the wheel; `machost`
  clicks the delay SYNC. The 150 presets were rendered against beta 0.5 (commit bc4196a): see §3.3e.
- beta 0.7: `bank_session` locates the browser's categories through `L_TOP`, `L_BASS`, `L_KEYS`, `L_ORGAN`, `L_SP` (checked
  against `kCategories` first, so a new category order fails with a clear message) and imports a "LIST ORDER v2" file to
  check that its lists are rebuilt (written back as v3 with the 22 TOP Sounds, adjusted preset and bank kept);
  `tests/vst3host/presets_spec.txt` is regenerated with `node tests/vst3host/make_presets.js` after any change of the
  factory order.
- macOS (`.github/workflows/mac.yml`, `macos-14`, Apple silicon + Rosetta for Intel): `dsp_render.cpp` + `dsp_compare.js` on
  both architectures, then `tests/machost/machost <bundle> <outdir>` (built by `tests/machost/build.sh`): bundle and
  exports, sound, states, editor in a window (PNG screenshots, synthetic mouse events at logical points, Cmd-click), HIDE /
  browser, the zoom and preset menus (chosen through `NSMenuDidBeginTrackingNotification` + `performActionForItemAtIndex`),
  SAVE PRESET / TO BANK / DELETE / undelete / EXPORT / IMPORT (903, `WS_PRESETS_IMPORT`) through `wsTestCommand:` with the NSAlert windows answered by a timer
  (`stopModalWithCode`). The presets file's header quotes "Adjusted: yes" / "Deleted: yes": look for them at a line start.
  Results: the run's page in the repository's Actions tab, or the Actions REST API (artifacts `OktoMultiWaveSynth-mac`
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
- **New preset, beta 0.2 and later**: the 300 of `presets_super.js` (beta 0.2) and the 600 of `presets_lfo3.js` (beta 0.3) are generated: `MW_NO_LFO3=1 node tools/gen_spec.js` (the builder compares its candidates
  with the 330 presets that exist without them), `node tools/supermod/calib.js tools/out/calib03.json` (their measures), then `node tools/supermod/build.js --per 5 --procs 22 --pool --keep [--cats "Bass,Pad"]`
  (several runs add up in `tools/out/lfo3_pool.json`; `--select-only` re-selects; `--report` shows what was written) and `node tools/gen_spec.js` without the variable. The generated
  files are never edited by hand; the old presets (001-200) are never regenerated. A candidate costs about 10 s of one core (22 processes: 800 candidates in 11 minutes); about half of them pass.

- **New preset** (the 200 of beta 0.1 were generated this way; the recipes stay as the record): add a `P(...)` line to the right `tools/recipes_*.js`, run `node tools/make_presets.js -v`
  (it numbers the presets, matches the loudness to the TOP Sounds' median ≈ −13.9 dB — a short sound is measured over 50 ms and
  3 dB lower —, raises oscillator levels before it would need more than +3 dB of master, limits the peak to 0.98, flags QUIET /
  SILENT sounds and the closest pairs; `--sheets` writes the contact sheets to `tools/out/`), then `node tools/gen_spec.js`. Never
  edit `presets_new.js`. A noise oscillator is a 2048-sample cycle band-limited at the note's pitch: play it low (octave −2 / −3)
  and use high band cutoffs, or it is silent. The demo sequence is `TOUR_PICKS` in `tools/spec.js`: add a preset there only on purpose.
- **DSP change**: both engines (same operations, same order), cross-check (§3.6), `regress_v07`, `idle_skip`, the VST3 host and the
  web suite. The 22 TOP Sounds must keep matching beta 0.7.
- **Release**: version in `tools/spec.js` (APP) **and** `vst/src/version.rc` (DLL version info), build, manuals, tests (muted), release zip (`OktoMultiWaveSynth.vst3` + `INSTALL.txt`, made with
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
- **Layout rule: nothing overlaps** (the owner, 2026-10-21, "for the future implementations"). In every card no two widgets may overlap, none may leave its card, no two cards may overlap. A knob counts as its
  ring (the disc + 4 px of ring + the stroke: about 49 px across for a 38 px knob, its top 4.5 px above the widget box) and its label (the text under it), a card's title counts as its text. When a new widget (or a moved one) would
  touch another, move or shrink the widgets (the picture, the selector), never let them cross. Two checks keep it: `tests/quick.js` (`layout`: the spec's numbers, web app and plug-in, without the text) and
  `tests/web/smoke.js` with `tests/web/overlap.js` (the page: rings, label and title texts, in every view, LFO 2 / 3, ARAB / TURK, CHORD MODE). Both must stay green.
