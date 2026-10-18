# Wavelet Synthesizer

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23431760.svg)](https://doi.org/10.5281/zenodo.23431760)

*Created by **Pierre Arnaud GUYOT** ("OktoPierre") — version **beta 0.6** (2026-10-17), see [RELEASE_HISTORY.md](RELEASE_HISTORY.md).
Architecture and maintenance notes: [CLAUDE.md](CLAUDE.md).*

A polyphonic synthesizer that shapes sound with the **discrete wavelet transform** instead of Fourier filters.
It comes as a **web application** and a **VST3 / VST2 instrument for Ableton Live** (Windows x64), also as a **VST3 for
macOS** (Apple silicon and Intel). They share
the same engine, panel layout and 150 factory presets (beta 0.5: OktoPierre's sort of the 253 of beta 0.4): his 37 **TOP
Sounds** first, then the others sorted by category like a hardware synthesizer (Source Phase, Bass, Lead, Keys, Organ, Pad,
Strings, Brass & Wind, Pluck, Bells & Mallets, FX, Drums & Perc); both open on "A · Warm Pad".
Its two engines can play **alone or mixed** (the **A/B MIX** knob), and a **string-machine triple chorus** widens pads,
strings and organs. The **WAVELET MORPH** (beta 0.3) builds the sound with a second wavelet too and moves between the two
with a knob, the LFO or the envelope. Each category lists its presets in OktoPierre's order.
A second LFO (**LFO 2**) moves any parameter of the scale filter or the position window. **SOURCE PHASE** (beta 0.4) moves
engine A's source wave inside the cycle before the wavelet transform: because the transform is shift-variant, the scale
filter then acts on other atoms and the timbre changes — something no Fourier filter can do; LFO 2 can sweep it, and the
44 presets of the Source Phase section are built on it. In the VST plug-in, a **preset
browser** (TOP Sounds and the sound types) sits at the right of the panel; **SAVE PRESET** adjusts a factory preset,
**DELETE** clears out the ones you do not want, ▲ ▼ reorder the lists, a sound **dragged onto a category** moves there (or
joins TOP Sounds), the **arrow keys** choose sounds, and a **user bank** keeps your own sounds — all in one readable text
file, `OKTOWAVE presets.txt`, kept next to the plug-in; EXPORT / IMPORT share it.
beta 0.6 rearranges the panel (SUB OSC beside the oscillator, LFO 1 and LFO 2 side by side, the chorus inside EFFECTS,
one MANUAL button) and adds **tempo SYNC** to the plug-in: the delay and both LFOs can follow the DAW's tempo in note
values (1/4, 1/8 D, 1/16 T…); the web app opens with a welcome window (run the demo, play the synth, download the VST).
A **sub oscillator** (sine, triangle or square, one or two octaves below) adds low end and infra-bass, and a
**polyphonic portamento** selector (Off / Poly / Legato, Poly by default) works with the GLIDE time: in Poly mode every voice
glides from its own previous note, so chord changes glide voice by voice.

**Play online:** https://pierrearnaudguyot.github.io/Free-Wavelet-Synthesizer-VST/ (Chrome or Edge; with Web MIDI,
a hardware keyboard, sequencer or controller plays it directly, no DAW needed).
**Download the plugin**: see the
[Releases](https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST/releases) page of the
[GitHub repository](https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST) —
*V0.6 (beta)*, this version, with one zip for **Windows** 64-bit (VST3 / VST2) and one for **macOS** 10.13 or later (VST3,
one universal plug-in for Apple silicon and Intel Macs; `INSTALL-mac.txt` in the zip explains the first start). The
earlier versions (V0.5, V0.4, V0.3, V0.3 for Mac…) stay on the same page. The web app also works offline:
download the repository and open `web/index.html`.

**MIDI without a DAW (web app):** all inputs, notes, pitch bend, mod wheel, sustain; a channel selector in the status
bar (all or 1–16); Program Change selects a preset; **MIDI learn**: right-click a panel control, then move a knob or
fader on your controller (Esc cancels, Delete unlinks; links are kept in the browser).

| Engine | Idea | Manual |
|---|---|---|
| **A · Wavelet Subtractive** | One cycle of a classic waveform is split into 11 wavelet bands (one per octave of harmonics). A *scale filter* attenuates bands, optionally only in one part of the cycle (position window), and a sparsity control keeps only the strongest atoms. | [web/manual/manual-a.html](web/manual/manual-a.html) |
| **B · Wavelet Additive** | The cycle is built from wavelet atoms: a pattern writes the coefficients, 11 drawbars set the band levels, and every band has its own envelope (scale envelope). | [web/manual/manual-b.html](web/manual/manual-b.html) |

Wavelets available: Haar, Daubechies 2/4/8/20, Symlet 8, Coiflet 3.

## Use it

### Web app
Open `web/index.html` in Chrome, Edge or Firefox (double-click; no server or install needed). A welcome window offers **Run the demo**, **Play the synth** (MIDI
supported; it starts the sound, then play) or **Download the VST** (the GitHub releases page, also the header's
DOWNLOAD VST). **MANUAL** (header) opens the manual of the engine shown.
- Play with the mouse on the keyboard, a MIDI keyboard (Web MIDI), or the computer keyboard:
  - digits **1 2 3 4 5 6 7 8 9 0** (or the numeric keypad) = C D E F G A B C D E (do ré mi…)
  - letter rows = chromatic piano (A W S E D F T G Y H U J K O L P)
  - **Z** / **X** = octave down / up
- Presets: the **preset browser** at the right of the panel (as in the VST): TOP Sounds and the sound types, one click
  plays a sound, the **arrow keys** too (↑ ↓ sounds, ← → categories; HIDE folds the browser away and a click on the preset
  name brings it back). ◀ ▶ and the preset name's menu work as before. **Save preset / Export / Import** are in the status bar.
- Works directly from the file (no web server needed).
- **▶ DEMO** (header, web app, or *Run the demo* in the welcome window) plays Beethoven's *Appassionata* (III) from the phrase after its opening chords while touring 30 presets:
  a new preset about every 4 s, on a change of chord, starting with "B · Clarinet", then OktoPierre's TOP Sounds, then the beta 0.2
  chorus / sub / A + B presets (played polyphonic at their normal octave); the preset browser shows the preset being played. **▾** opens the list: J. S. Bach's *Toccata in D minor* or one of the virtuoso Beethoven piano works
  (*Appassionata* III, *Moonlight* III, *Rage over a Lost Penny*, Symphony No. 5 I (piano), *Pathétique* I, *The Tempest* I, Sonata Op. 111 I) —
  or **Load a MIDI file…** of your own. The demo animates the important parameters and a small window explains in English
  which parameter is changing. Stop it with ■ STOP or Esc; your sound is restored afterwards.
  (Copyrighted songs are not bundled; load your own files for those.)

### VST3 / VST2 in Ableton Live
1. Build the plugin (see below), or use an existing `build\WaveletSynthesizer.vst3` folder.
2. Copy the **whole** `WaveletSynthesizer.vst3` folder into **either**
   - your VST3 folder `C:\Program Files\Common Files\VST3` (`vst\install.bat` does this and asks for administrator rights), **or**
   - your VST2 plug-in folder (the one set as *VST2 Plug-in Custom Folder* in Live; no administrator rights needed).
3. In Live: *Preferences → Plug-ins* → enable **Use VST3 Plug-in System Folders** (VST3) or
   **Use VST2 Plug-in Custom Folder** (VST2) → **Rescan**.
4. Drag *Plug-ins → Wavelet Synthesizer* onto a MIDI track.

The plugin is a single self-contained DLL. It depends only on Windows system libraries, so nothing else
needs to be installed. The same DLL is both a VST3 plug-in (`Contents\x86_64-win\WaveletSynthesizer.vst3`) and a VST2
plug-in (the copy `WaveletSynthesizer.dll` next to it, found by hosts that scan a VST2 folder). The VST2 entry point
(`vst/src/vst2.cpp`) hosts the same processor, controller and editor in-process; its declarations are written from
the public VST 2.4 binary layout (Steinberg no longer licenses the VST2 SDK). The **MANUAL** button opens
the manual of the engine shown, bundled inside the `.vst3` folder.
**Tempo SYNC** (beta 0.6, plug-in only): the SYNC buttons of the delay, LFO 1 and LFO 2 make TIME / RATE a note value
of the host's tempo (delay 1/32 … 1/1, up to 4 s; LFOs 4/1 … 1/32; T = triplet, D = dotted; 120 BPM when the host
gives no tempo).
Pitch bend, the mod wheel (vibrato) and the sustain pedal are supported. All parameters can be automated.

### VST3 on a Mac
1. Copy `WaveletSynthesizer.vst3` into your own plug-in folder `~/Library/Audio/Plug-Ins/VST3` (Finder: *Go → Go to
   Folder…*): the presets file `OKTOWAVE presets.txt` is written next to the plug-in.
2. First start: the plug-in is free and not signed with a paid Apple developer certificate, so macOS blocks it once.
   In Terminal: `xattr -dr com.apple.quarantine ~/Library/Audio/Plug-Ins/VST3/WaveletSynthesizer.vst3`
   (or *System Settings → Privacy & Security → Open Anyway*).
3. In Live: *Settings → Plug-ins* → **Use VST3 Plug-in System Folders** → **Rescan**. Other VST3 hosts (Cubase, Bitwig,
   Reaper, Studio One…) work too; Logic Pro and GarageBand only load Audio Units.

Same panel, sound and presets as on Windows (one universal binary for Apple silicon and Intel). On a Mac, Cmd-click resets
a knob and Control-click on the preset name opens the preset menu.

## Build the VST3

Requirements: the portable [llvm-mingw](https://github.com/mstorsjo/llvm-mingw/releases) toolchain
(`llvm-mingw-<date>-ucrt-x86_64.zip`, extract it anywhere; no admin rights, no Visual Studio, no CMake).
Node.js is optional: if present, the build regenerates the C++ parameter table from `tools/spec.js`.

```bat
set LLVM_MINGW=C:\Users\<you>\tools\llvm-mingw   (default: %USERPROFILE%\tools\llvm-mingw)
vst\build.bat
```
Output: `build\WaveletSynthesizer.vst3\Contents\x86_64-win\WaveletSynthesizer.vst3` + `Contents\Resources\manual\`.

**macOS**: with the Xcode command line tools (`xcode-select --install`), run `vst/build_mac.sh`: one universal VST3 bundle
in `build/mac/WaveletSynthesizer.vst3` (signed ad hoc). GitHub's Macs build and test it on every push
(`.github/workflows/mac.yml`: the sound against the web engine on both architectures, then `tests/machost`, a small
macOS host that plays notes and drives the editor); the release zip is one of the workflow's artifacts.

## Project layout

```
tools/spec.js          single source of truth: parameters, panel layout, factory presets
tools/gen_spec.js      generates web/js/spec.js and vst/src/generated/spec.h from it
tools/wavelets.json    wavelet filter coefficients
tools/dsp_selftest.js  engine self-test (perfect reconstruction, band-limiting, presets, aliasing)
tools/dsp_compare.js   checks that the C++ engine matches the JavaScript reference sample by sample
tools/make_demo.js     demo converter (tools/demo/*.mid -> web/js/demo_data.js); MIDI reader in web/js/midi.js
tools/manual/          generator of the two user manuals (node tools/manual/build.js a b)
web/                   web application (vanilla JS, Web Audio AudioWorklet, no libraries)
  js/core.js           DSP reference implementation (also runs inside the AudioWorklet)
  js/ui.js, js/app.js  panel UI, presets, MIDI, computer keyboard
  js/demo.js           demo player: songs, scene templates, the demo window, user MIDI files
  manual/              user manuals A and B (also bundled into the VST)
vst/                   VST3 plugin (C++17)
  src/dsp.h            C++ port of core.js
  src/plugin.cpp       processor, controller, factory (written directly on the VST3 interfaces)
  src/editor.cpp       plugin window: the panel, the same on every system (draws through src/editor_platform.h)
  src/editor_win.cpp   its Windows side (Win32 + GDI+, both part of Windows)
  src/editor_mac.mm    its macOS side (Cocoa, Core Graphics, Core Text)
  src/platform.h       files, folders and text conversion on Windows and macOS
  external/pluginterfaces  Steinberg VST3 interface headers 3.8.1 (MIT licence)
tests/                 independent test tools (VST3 test hosts for Windows and macOS, browser test driver)
```

## How the engine works (short)

- Each note plays one **cycle of 2048 samples**, analysed with a periodic orthogonal DWT into **11 bands**.
  Band 1 is a single atom that spans the whole cycle (≈ the fundamental); band *b* has 2^(b−1) atoms and covers
  roughly harmonics 2^(b−2)…2^(b−1) (band 11 = harmonics 513–1024), so 1 band ≈ 1 octave of harmonics.
  Only the bands below the audio limit are played: at C4 that is bands 1–7, at C2 bands 1–9.
  Because the analysis is pitch-synchronous, the bands follow the note.
- Every band is resynthesised into its own layer and stored as **band-limited mip tables** (11 octave levels),
  so the oscillator stays alias-free. Voices mix the layers with per-band gains at audio rate, so filter sweeps and envelopes are smooth.
- Structural changes (wavelet, source, sparsity, pattern, seed) rebuild the tables on a background thread
  (the main thread in the web app) and crossfade over about 10 ms.

## Development checks

```bash
node tools/gen_spec.js           # after editing tools/spec.js
node tools/dsp_selftest.js --wav # engine self-test; --wav writes build/test-audio/*.wav
```
To cross-check the C++ port, compile `vst/devtest/dsp_render.cpp` and run `node tools/dsp_compare.js <dir>`.
To check the VST2 entry point like a VST2 host, compile and run `vst/devtest/vst2_smoke.cpp` (build line at its top).
The difference between the two engines is below 3.4e-7 for all 150 presets.

## How to cite

Guyot, P. A. (2026). *Wavelet Synthesizer* [Computer software]. Zenodo. https://doi.org/10.5281/zenodo.23431760
(Zenodo record: https://zenodo.org/records/23431760; all versions: https://doi.org/10.5281/zenodo.23431759).
GitHub shows the same reference under **Cite this repository** (`CITATION.cff`).

## Licence

Copyright (C) 2026 Pierre Arnaud GUYOT ("OktoPierre").

Wavelet Synthesizer (web app, VST3 plugin, tools and tests) is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3
of the License, or (at your option) any later version. It is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU General Public License in the file `LICENSE` for more details.

If you share the compiled plugin (`WaveletSynthesizer.vst3`) or the web app, share the source code with it as well
(for example a link to the project's repository), as the GPL requires.

Parts that keep their own licence:
- `vst/external/pluginterfaces/`: Steinberg VST3 interface headers, MIT licence (compatible with the GPL; its
  licence text is kept in the folder and copied into the plugin bundle).
- `tools/demo/*.mid` and `web/js/demo_data.js`: demo music from the Mutopia Project, public domain except the
  *Moonlight* Sonata III (CC BY-SA 2.5, Stewart Holmes). This music data is not covered by the GPL
  (see `tools/demo/SOURCE.md`).

## Credits

Created by Pierre Arnaud GUYOT ("OktoPierre").

- Demo music: MIDI from the [Mutopia Project](https://www.mutopiaproject.org) (details in `tools/demo/SOURCE.md`): J. S. Bach *Toccata in D minor*
  BWV 565 and Beethoven's Op. 57 III, Op. 129, Op. 67 I (piano), Op. 13 I, Op. 31/2 I, Op. 111 I — **public domain**;
  Beethoven *Moonlight* Sonata Op. 27/2 III typeset by Stewart Holmes — **CC BY-SA 2.5**.
- VST3 interface headers: Steinberg Media Technologies, MIT licence (`vst/external/pluginterfaces/LICENSE.txt`).
- Wavelet filter coefficients were generated with PyWavelets (MIT licence) and are stored in `tools/wavelets.json`.

## Acknowledgments

Thanks to Jeremi Palmigani (aka Saoul Machine) and Flo (aka Go Tiger) for testing the synth and providing valuable
feedback and improvement suggestions.

Thanks to Arnaud Grignard for the technical review of the concept.
