# CLAUDE_DIFFERENCES.md — OktoWave (Okto MultiWave Synth 1.0) against the Wavelet Synthesizer it comes from

A file for Claude (and for anyone new to the code): what this repository is, how it differs from the initial project
**Free-Wavelet-Synthesizer-VST** (https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST, web app
https://pierrearnaudguyot.github.io/Free-Wavelet-Synthesizer-VST/web/index.html, release beta 0.7.1), and the design of the synthesizer.
The architecture and maintenance rules are in [CLAUDE.md](CLAUDE.md) (long, by topic); the history is in [RELEASE_HISTORY.md](RELEASE_HISTORY.md).
Read this file first, then CLAUDE.md for the part you are going to touch.

## 1. Two projects, one family

| | Wavelet Synthesizer (initial branch) | OktoWave = Okto MultiWave Synth 1.0 (this repository) |
|---|---|---|
| Repository | Free-Wavelet-Synthesizer-VST (public; its `main` carried the Wavelet Synthesizer up to beta 0.7.1, tag `v0.7.1-beta`, and carries OktoWave from 1.0.3) | Okto-MultiWave-Synth (public: source + web app on GitHub Pages, `main`, path `/web/`) |
| Plug-in zips | its Releases (Windows, macOS) | the **test** repository `Wavelet-Synthesizer-TEST`, release `multiwave-v1.0` (only the VST zip there: no web app, no code pushed) |
| Sound sources | two **engines**: A (subtractive wavelet) and B (additive wavelet), blended by `ab_mix` | three **oscillators**: A1, A2 (subtractive) and B1 (additive), each with its own tone, scale filter, window, tuning, envelope and pitch envelope; OSC MIX levels |
| Parameters | 88 | 175 (`tools/spec.js`, one definition for the web app, the plug-in and the manuals) |
| Filter | the *scale filter* only (it gains the 11 wavelet bands) | the scale filter **plus a real 4-pole resonant low-pass per voice** (LADDER or OTA) |
| LFOs | LFO 1, LFO 2 (one target) | LFO 1, LFO 2, LFO 3 (the last two share one card with two tabs; 17 targets each, "SuperModulation") |
| Playing | keyboard, MIDI | + **CHORD MODE** (a chord harp with bass), + **oriental tunings** (WEST / ARAB / TURK, maqam, tonic) |
| Presets | 150 (22 TOP Sounds, then the categories, an Init list and Source Phase) | **237**: 21 of the 22 TOP Sounds (identical sound) + 216 new ones, named by type (A, AA, AB, AAB, B), 11 sections |
| Panel | 1100 x 720 | 1100 x 944 (+120 with the chord card under the keyboard on the web) |
| Header | WAVELET SYNTHESIZER | **OKTOWAVE / FRACTAL WAVELET SYNTHESIZER** |
| Demo | 8 songs, a menu, MIDI file loading | **one** song (Beethoven, Appassionata III), the same tour as the initial web app, no menu, no MIDI loading |
| Stars | none | 1-10 stars (five stars with half stars) in the plug-in's browser, saved in the presets file, EXPORT / IMPORT; the web app shows the author's stars, read only |
| User bank | the player's own sounds | + a folder **KeyAttac** (the 36 starred presets retouched to be percussive), put there by `bank.h` while the presets file is older than `LIST ORDER v7` |
| Platforms | web, VST3/VST2 Windows, VST3 macOS | web, VST3/VST2 Windows (the macOS editor `editor_mac.mm` follows the Windows one but is not built or tested here) |

Rules that follow from the family tie (do not break them):
- **The TOP Sounds must sound exactly as in the Wavelet Synthesizer beta 0.7**: `tools/presets_top.js` keeps them in that version's parameters and `convertLegacy` (`tools/spec.js`) turns `ab_mix` / `engine` into the levels of A1 and B1. `tests/regress_v07.js` checks it (worst difference 8.8e-8 of the peak).
- **The demo tour is the initial web app's tour**: `tools/demo_presets.js` holds its 30 presets (values of beta 0.7.1, written by `tools/demo_presets_extract.js` from that web app), played by `WS_SPEC.DEMO_PRESETS` in no browser list. At the same notes the Okto engine renders them at the same RMS level (median difference 0.00 dB, never louder).
- The Free-Wavelet-Synthesizer-VST repository carries this version since 1.0.3 (a normal commit on top of beta 0.7.1, never a rewrite: the Wavelet Synthesizer is in its history and in its Releases, tag `v0.7.1-beta`); do not force-push it. Never push code to the test repository (zips only); never write the trademark "Omnichord" (the chord keyboard is "chord harp" / "CHORD MODE"); no brand names for the filter types (LADDER / OTA).

## 2. How the code is organised (the design of the program)

**One specification, three outputs.** `tools/spec.js` defines the parameters (key, range, curve, default), the panel (sections and widgets with
their coordinates), the presets, the categories and the demo tour. `tools/gen_spec.js` turns it into `web/js/spec.js` (the web app and the tests) and
`vst/src/generated/spec.h` (the plug-in). The manuals (`tools/manual/`) are built from the same data, so a change of a parameter, a preset or a
widget is made once and the screenshots and tables follow (`node tools/manual/shots.js`, then `node tools/manual/build.js a b`).

**One engine, two implementations.** `web/js/core.js` (JavaScript, runs in an AudioWorklet) and `vst/src/dsp.h` (C++) are the same algorithm.
`tools/dsp_compare.js` + `vst/devtest/dsp_render.cpp` render 323 cases in both and compare them (worst difference 2.1e-7): keep them in step and run
`node tests/quick.js --dsp`.
Signal path: oscillators (each: source wave or additive pattern -> one cycle split into 11 octave bands by the discrete wavelet transform ->
**scale filter** gains per band -> position window -> resynthesis; own envelope, pitch envelope, tuning) -> OSC MIX -> **filter** (LADDER / OTA, per voice,
bypassed while open) -> amp envelope -> voices summed (`polyComp`: x sqrt(3/n) above three voices) -> effects (saturation, chorus, ping-pong delay, reverb)
-> DC blocker -> master -> **peak guard** (rides the gain above 0.9) -> **soft limiter** (knee 0.7). LFO 1 has its own amount per target (pitch, cutoff, position, wavelet, sparsity, resonance, ENV>WAV); LFO 2 and LFO 3 move one control
in every oscillator at once (roles in `LFO2_ROLE`); the mod envelope moves the wavelet. The output stage is why a loud dense chord can sound saturated: the
presets' masters are calibrated per preset (`tools/master_adjust.js`, from `node tools/supermod/loud.js --spec --apply`) so that five loud chords stay under the guard.

**The panel (design).** 1100 x 944 design pixels, drawn the same way on the web (DOM, `web/js/ui.js`, CSS variables) and in the plug-in (own canvas
on GDI+, `vst/src/editor.cpp`), both from the widget list of `tools/spec.js`:
- Header (48 px): logo (OKTOWAVE / FRACTAL WAVELET SYNTHESIZER), zoom FIT (plug-in) or DEMO (web), the preset box (name with its type letters coloured, arrows, a click opens
  the browser), SAVE PRESET / DOWNLOAD VST, MANUAL, master knob and meter.
- Under it the **folder tabs** OSC1 A1 / OSC2 A2 / OSC3 B1: only one oscillator's cards are shown (WAVELET, SCALE FILTER, POSITION, TUNE / OWN ENVELOPE / PITCH ENVELOPE) on a plate in
  its colour; OSC MIX, SUB OSC, SCOPE and SCALOGRAM are common and sit at the top right.
- Rows of common cards: FILTER, AMP ENVELOPE, MOD ENVELOPE; LFO 1 (wave selector underlined beside its title), LFO 2 | LFO 3 (two tabs, a stepped SHAPE knob with the name
  of the wave under it, TARGET menu, SYNC in the plug-in), VOICE; EFFECTS and PLAY (CHORD MODE, TUNING WEST / ARAB / TURK, maqam, tonic) with their titles written vertically; the keyboard and the wheels.
- **Colour code**: subtractive oscillators and what belongs to them yellow, the additive one blue; while TUNING is ARAB or TURK the accent becomes terracotta / turquoise and the PLAY card
  takes an oriental tiling pattern (`ORIENT` in `tools/spec.js`). Knobs are drawn as a ring (accent) around a dark disc with a pointer; choices are segmented buttons or stepped knobs.
- **Preset browser** (at the right of the panel; the web app has the same browser, without the star rating): TOP Sounds first, then the sections Pad, SuperModulation, Bass, Lead, Keyboard (Keys + Pluck), Organ, Strings,
  Brass & Wind, Bells & Mallets, FX, Drums & Perc; FACTORY / USER BANK tabs; every row shows its type in colour (A yellow, B blue), the name and five stars; one click plays a sound, the arrow keys step.
  Each list is sorted from the best to the least rated by the owner's ratings (`tools/ratings_final.js`); the synth opens on the first TOP Sound.
- Window sizing: the plug-in window fits the screen (zoom FIT, 50-100 %), the web app scales to the page.

**Presets file and stars (plug-in).** `OKTOMULTIWAVE presets.txt` next to the `.vst3` folder (`vst/src/bank.h`): blocks of factory presets the player adjusted / deleted / rated
(`Preset:` / `Factory:` / `Adjusted:` / `Deleted:` / `Stars: N`), the USER BANK (sections by name), and `LIST ORDER v5` (what each list holds). Stars are 1-10 (half stars), set by a click
in the browser, kept in the file, carried by **EXPORT** (a readable copy of the whole file) and read back by **IMPORT**; version 1.0 has no built-in vote (every sound starts with none) and
ignores the stars of a file that does not say `LIST ORDER v5`. The tests: `vst/devtest/library_test.cpp` (the file), `vst/devtest/vote_session.cpp` (the window in a host, including the clicks on the stars).

## 3. Working here

- Build: `cmd //c "vst\build.bat"` (llvm-mingw, no installer); the web app is static (`web/index.html`).
- Checks: `node tests/quick.js [--dsp]` (30 s), `node tests/full.js --parallel` (two lanes, about 14 minutes) before an official release (pre-releases only need the quick checks).
- Release: zip `OktoMultiWaveSynth.vst3` + `INSTALL.txt` (Windows `tar.exe -a`), SHA-256 in the notes, GitHub REST API with the token of the Git Credential Manager (never printed); the web app = push `main` of the public repository.
- Pitfalls: several files are CRLF (edit with a script that keeps the line ends); bash heredocs lose backslashes (write scripts with the Write tool); in Git Bash set `MSYS_NO_PATHCONV=1` for API paths;
  headless Edge always with `--mute-audio` and closed afterwards; after a change of the spec run `node tools/gen_spec.js`, rebuild the plug-in and the manuals (`tests/quick.js` complains when they are older than their sources).
