# Wavelet Synthesizer

*Created by **Pierre Arnaud GUYOT** ("OktoPierre") — version **beta 0.1** (2026-10-14), see [RELEASE_HISTORY.md](RELEASE_HISTORY.md).*

A polyphonic synthesizer that shapes sound with the **discrete wavelet transform** instead of Fourier filters.
It comes as a **web application** and a **VST3 / VST2 instrument for Ableton Live** (Windows x64). Both share
the same engine, panel layout and 32 factory presets (OktoPierre's 15 favourite sounds first, then the others alternating engine A / engine B, from clean sounds to heavy effects); both open on "A · Warm Pad".
A **sub oscillator** (sine, triangle or square, one or two octaves below) adds low end and infra-bass, and a
**polyphonic portamento** selector (Off / Poly / Legato, Poly by default) works with the GLIDE time: in Poly mode every voice
glides from its own previous note, so chord changes glide voice by voice.

**Download the plugin** (Windows 64-bit, VST3 / VST2): see the
[Releases](https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST/releases) page of the
[GitHub repository](https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST). **Try the web app:** download
the repository and open `web/index.html` in Chrome or Edge.

| Engine | Idea | Manual |
|---|---|---|
| **A · Wavelet Subtractive** | One cycle of a classic waveform is split into 11 wavelet bands (one per octave of harmonics). A *scale filter* attenuates bands, optionally only in one part of the cycle (position window), and a sparsity control keeps only the strongest atoms. | [web/manual/manual-a.html](web/manual/manual-a.html) |
| **B · Wavelet Additive** | The cycle is built from wavelet atoms: a pattern writes the coefficients, 11 drawbars set the band levels, and every band has its own envelope (scale envelope). | [web/manual/manual-b.html](web/manual/manual-b.html) |

Wavelets available: Haar, Daubechies 2/4/8/20, Symlet 8, Coiflet 3.

## Use it

### Web app
Open `web/index.html` in Chrome, Edge or Firefox (double-click; no server or install needed), then click **Click to start audio**.
- Play with the mouse on the keyboard, a MIDI keyboard (Web MIDI), or the computer keyboard:
  - digits **1 2 3 4 5 6 7 8 9 0** (or the numeric keypad) = C D E F G A B C D E (do ré mi…)
  - letter rows = chromatic piano (A W S E D F T G Y H U J K O L P)
  - **Z** / **X** = octave down / up
- Presets: ◀ ▶ or click the preset name. **Save preset / Export / Import** are in the status bar.
- Works directly from the file (no web server needed).
- **▶ DEMO** (header, web app) plays Beethoven's *Appassionata* (III) while touring all the factory presets: a new preset about every 4 s, on a change of chord,
  starting with "A · Warm Pad" on the opening chords (its filter cutoff opening), then "A · Wavelet Lead", then the other presets in menu order, favourites first, without "A · Square Mod" (played polyphonic at its normal octave); the preset browser shows the preset being played. **▾** opens the list: J. S. Bach's *Toccata in D minor* or one of the virtuoso Beethoven piano works
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
the public VST 2.4 binary layout (Steinberg no longer licenses the VST2 SDK). The **MANUAL A / MANUAL B** buttons open
the manuals bundled inside the `.vst3` folder.
Pitch bend, the mod wheel (vibrato) and the sustain pedal are supported. All parameters can be automated.

## Build the VST3

Requirements: the portable [llvm-mingw](https://github.com/mstorsjo/llvm-mingw/releases) toolchain
(`llvm-mingw-<date>-ucrt-x86_64.zip`, extract it anywhere; no admin rights, no Visual Studio, no CMake).
Node.js is optional: if present, the build regenerates the C++ parameter table from `tools/spec.js`.

```bat
set LLVM_MINGW=C:\Users\<you>\tools\llvm-mingw   (default: %USERPROFILE%\tools\llvm-mingw)
vst\build.bat
```
Output: `build\WaveletSynthesizer.vst3\Contents\x86_64-win\WaveletSynthesizer.vst3` + `Contents\Resources\manual\`.

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
  src/editor.cpp       plugin window (Win32 + GDI+, both part of Windows)
  external/pluginterfaces  Steinberg VST3 interface headers 3.8.1 (MIT licence)
tests/                 independent test tools (VST3 test host, browser test driver)
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
The difference between the two engines is below 2.4e-7 for all 32 presets.

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
