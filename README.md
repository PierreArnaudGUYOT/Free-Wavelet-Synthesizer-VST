# OktoWave — Okto MultiWave Synth

# ⬇ DOWNLOAD THE PLUG-IN (Windows, VST3 / VST2)

1. Open the **[latest release](https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST/releases/latest)** (or, on this page: **Releases** in the right-hand column, then **v1.0.5**).
2. Scroll down to **Assets** and click **OktoMultiWaveSynth-1.0.5-win64.zip**.
3. Unzip it and copy the whole folder **OktoMultiWaveSynth.vst3** into `C:\Program Files\Common Files\VST3` (VST3; needs administrator rights) or into your VST2 plug-in folder. `INSTALL.txt` in the zip says more.
4. In your DAW, rescan the plug-ins (Ableton Live: *Preferences → Plug-ins → Rescan*), then open *Plug-ins → OktoPierre → Okto MultiWave Synth*.

# ▶ PLAY IT ONLINE (nothing to install)

**https://pierrearnaudguyot.github.io/Free-Wavelet-Synthesizer-VST/web/** (Chrome or Edge; a MIDI keyboard plays it directly, no DAW needed).

---

*Created by **Pierre Arnaud GUYOT** ("OktoPierre") — **version 1.0.5**, the final version with its fixes (2026-10-20), see
[RELEASE_HISTORY.md](RELEASE_HISTORY.md). Architecture and maintenance notes: [CLAUDE.md](CLAUDE.md).*

Okto MultiWave Synth is the [Wavelet Synthesizer](https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST/releases/tag/v0.7.1-beta)
(beta 0.7.1) with **three oscillators instead of two engines**: two subtractive wavelet oscillators (**A1, A2**) and one
additive wavelet oscillator (**B1**). It is a polyphonic synthesizer that shapes sound with the **discrete wavelet
transform** instead of Fourier filters: one cycle of each tone is split into 11 octave-spaced wavelet bands and resynthesised
band by band. It comes as a **web application** and a **VST3 / VST2 instrument** for Windows x64 (Ableton Live and other
hosts).

The listening test of the earlier betas (**EVALUATE SOUNDS**, which asked for 1 to 10 stars for each new preset) was removed in the final
version, and so were the extra demo songs, the song menu next to DEMO and the loading of a MIDI file: the ratings it collected shaped
the preset list (see the notes of the betas below), and the demo is one piece, Beethoven's *Appassionata*.

The web app also works offline: download the repository and open `web/index.html`. The same web app is at https://pierrearnaudguyot.github.io/Okto-MultiWave-Synth/ too (the development repository).
The Wavelet Synthesizer beta 0.7.1 that this repository carried until version 1.0.3 stays in its history and in the Releases (tag `v0.7.1-beta`, with its macOS plug-in);
this version is built for Windows and the web (the code is portable, but no macOS build is made or tested here).

## Web app update of 2026-10-21 (the plug-in stays 1.0.5)

- **The demo opens on A · Wavelet Lead**, and a change of preset in the demo no longer clicks or buzzes (the output dips for 35 ms, the continuous parameters travel in 64 ms, the first preset is loaded before the first note).
- **Nothing overlaps on the panel any more** (the envelope pictures and the knobs under them, the selectors of the filter cards ...); a rule, with two tests.
- The plug-in takes the layout and the other sources with its next release (1.0.6).

## What version 1.0.5 changes

- **A trail of light around the oscillators**: the tab of the oscillator shown and the plate under it are outlined as one shape, bright at the tab and fading along the plate. **PLAY**: ARAB is sand-gold, TURK carmine red, with the same oriental pattern.

## What version 1.0.4 changes

- **A new tour for the demo**: the best presets of the last list plus eight sounds of the old tour, spread over the piece, each at a volume that does not saturate; **Flint Ripple Haze comes first** (first of TOP Sounds, the opening sound, first of the demo).

## What version 1.0.3 changes

- **The seven best-rated presets (10 stars) lead TOP Sounds**, in every section the starred sounds come first, and **the web app shows the author's stars (1 to 10), read only**.
- **KeyAttac**: a new folder of the plug-in's USER BANK with the 36 starred presets retouched to be very percussive (attacks at the minimum, a short decay, a long release).

## What version 1.0.2 changes

- **After the third listening**: the sounds OktoPierre starred come first in their section, SuperModulation keeps only the starred ones (the 90 others are in a new section, **Other**), the preset he adjusted takes his values, and the demo starts on two of his latest favourites.

## What version 1.0.1 changes

- **Every preset is quieter on a big chord struck hard** (volumes only: 183 of the 237 went down by 1 to 12 dB; no preset reaches the limiter on a ten-note chord at maximum velocity), and in CHORD MODE **the key of the left hand lights up while it is held**.

## What version 1.0 changes

- **237 presets: the ones OktoPierre rated 3 or more out of 10** (21 of the 22 TOP Sounds of beta 0.7 and 216 numbered ones; the 19 he adjusted carry his values; no new preset).
  Every list is **sorted from the best to the least rated**, and the synth **opens on the first TOP Sound**, *A · Wave Brass*.
- **Sections of the preset browser**: TOP Sounds, **Pad** (second), SuperModulation, Bass, Lead, **Keyboard** (Keys and Pluck together), Organ, Strings, Brass & Wind,
  Bells & Mallets, FX, Drums & Perc.
- **Names by type, no numbers**: A, AA, AB, AAB, B and a title (A yellow, B blue); **the stars start at zero** (the rating system stays); **OKTOWAVE / FRACTAL WAVELET SYNTHESIZER** at the top left.
- **Removed**: EVALUATE SOUNDS, the seven extra demo songs, the song menu next to DEMO and the loading of a MIDI file in the web app.
- **The interface of the chosen mock-ups** (P6, Q1, R6): the wave selector of LFO 1 underlined beside its title; LFO 2 and LFO 3 as two tabs of one card with a stepped SHAPE
  knob; the VOICE knobs on the line of the other cards; smaller, better centred WIDTH / SPARSITY knobs and a larger SOURCE CYCLE; an oriental colour code and pattern in the PLAY
  card while TUNING is ARAB or TURK. The panel is 1100 x 944.
- **The manual** opens on "What this synthesizer is, and what wavelets are", and lists the 237 presets.
- **The engine**: 35 to 39 % less CPU (bit-identical output) and no crackle on a loud chord (beta 0.3.2), calibrated again for the final list.

## What beta 0.3.3 changes

- **A lower panel** (the owner's choice "V1" among five mock-ups on a 1920 x 1080 screen with the taskbar). The panel is **966 px tall** (1050 before; the bottom of the keyboard was out of sight on a 1080-pixel screen): the oscillator block, the three
  rows of cards and the keyboard are a little shorter (the knobs keep their size), the **titles of EFFECTS and PLAY are vertical, in a strip at the left of the card** (those two cards are 98 px tall), and, while CHORD MODE is on, the **CHORD KEYBOARD card is in the preset
  browser, under the list of presets** (the list is that much shorter and the panel keeps its height). With the browser hidden the card is under the keyboard as before (the panel is 120 px taller). The web app has the same panel, with the chord card under the keyboard.
- **The new presets are 2 dB lower** (every preset numbered 501 and up; `NEW_TRIM_DB` in `tools/spec.js`, on top of the loud-chord calibration of beta 0.3.2) while the good ones have not been chosen yet; the 22 TOP Sounds and the older presets are unchanged. Set the constant to 0 to take it off.

## What beta 0.3.2 changes

Beta 0.3.2 answers two remarks of OktoPierre on beta 0.3.1 (plug-in only: the web app has the same engine, no new page):

- **No more crackle on a loud chord.** OktoPierre's test: a C major chord at the maximum MIDI velocity crackled in many presets, and lowering VOLUME cured it. The cause is the output stage: the soft limiter (knee at 0.7)
  flattens the peaks of a chord that sums to twice its knee or more into a buzz. Three changes (a chord of up to three notes that stays under 0.9 is bit-identical with beta 0.3.1):
  (1) the voice sum is scaled by sqrt(3 / n) when n > 3 voices sound (n weighted by their energy, so release tails count little; the same compensation as the Wavelet Synthesizer's beta 0.7.1; the chord keyboard keeps its own level, `chordTrim`);
  (2) a **peak guard** rides the output gain in front of the soft limiter so that the signal never reaches the limiter above 0.9 (exactly 1 below it: bit-identical; attack 0.3 ms, hold 15 ms, release 150 ms);
  (3) the master volume of **321 of the 900 newest presets** was lowered by 1 to 6 dB (mean 2.2 dB) where the loudest chords (triads at C4, C5 and C6, a five- and a six-note chord, all at velocity 1) peaked above 1.0 before the output stage (`tools/supermod/loud.js`;
  the 22 TOP Sounds and the 308 older presets keep their values). Measured by `tools/crackle.js` on all 1182 presets (the waveform change the output stage causes on the chord, against the same chord 18 dB lower, per 20 ms): presets above 1 %: triad at C6 58 -> 1, five notes 226 -> 7, six notes 351 -> 15;
  above 2 %: 27 -> 0, 82 -> 0, 163 -> 1 (the remaining ones are old presets, not touched).
- **The window fits the screen.** The panel is 1050 px tall (1170 with the chord card): on a 1080-pixel screen the bottom of the keyboard was out of sight. The new default zoom is **FIT** (the box at the top left shows "FIT 90 %"): the window is scaled
  down so that the whole panel is on the screen of the host window, the taskbar left out and 100 px kept for the window's bar (never above 100 %, never below 50 %; it follows CHORD MODE, which makes the panel taller). A size chosen in the menu (50 to 150 %) stays; the same menu has "Fit the window to the screen". A project saved by an older beta holds 100 % = FIT.

## What beta 0.3.1 changes

Beta 0.3.1 applies the first ratings of OktoPierre (80 of the new presets rated 1 to 10 in EVALUATE SOUNDS) and what he asked for after:

- **The list follows his ratings**: the presets rated below 5 stars are left out (their numbers are not used again), the others keep their stars, those rated above 7 and his six favourites are in **TOP Sounds**.
  The presets he had not rated were **remade** to look more like the ones he liked (wide, roomy, slowly moving sounds: unison, chorus, reverb, a gentle release; smooth warm waves), and there are
  **300 new SuperModulation presets** (`1101`–`1400`) that move the wavelets themselves (sparsity, source phase and width, morph, window, additive scales).
- **Stars in the preset browser**: five stars (half stars: 1 to 10) at the right of every sound; the ratings are saved in the presets file and **EXPORT carries them** (IMPORT reads them back).
- **EVALUATE SOUNDS**: a **Skip to vote** button ends the music at once; the music is shorter (3.5 s of Beethoven and a 2 s chord).
- **No more saturation on a long chord**: the volume of the presets that saturated on the evaluation passage was lowered (`tools/supermod/gain.js`).
- **The scope and the scalogram move again** (beta 0.3 had made them static): they show the live gains and windows of the oscillators that play.

## What beta 0.3 changes

- **The second additive oscillator (B2) is gone.** Okto MultiWave Synth now has three oscillators: **A1 and A2** (subtractive) and **B1**
  (additive). The 192 presets that played B2 (67 of the 200 of beta 0.1, 125 of the 300 of beta 0.2) left the list; **their numbers are
  not used again**, so the ratings you already gave to the others stay valid. 308 presets of the earlier betas are left to rate (175 of beta 0.2,
  `202`–`500`, and 133 of beta 0.1, `001`–`200`), plus the 22 TOP Sounds. The 22 TOP Sounds and the sounds of the presets that stay did not change.
  The plug-in's parameters are numbered differently (B2's 41 parameters are gone, then LFO 3 and the filter are added): sounds saved by beta 0.1 or 0.2
  in a Live Set or in the user presets file are not read correctly any more.
- **A new panel.** One strip of three **folder tabs** under the header — **OSC1 A1 · SUBTRACTIVE** and **OSC2 A2 · SUBTRACTIVE** (yellow),
  **OSC3 B1 · ADDITIVE** (blue) — chooses the oscillator whose cards are shown on a soft coloured plate; a lit dot says the oscillator is heard
  (its level in OSC MIX is above 0). **OSC MIX** and the **SCOPE** are common to every oscillator, so they sit at the top right, outside the plate,
  and the scope and the scalogram now draw the **whole sound** (every oscillator that plays, and the sub oscillator). The ENGINE tabs left the
  header, the preset box is narrower, and a **PLAY** card holds CHORD MODE, BASS, TUNING and the oriental scale. The panel is 190 px taller (860 → 1050).
- **LFO 3**, a second LFO of the kind of LFO 2 (the same targets), in a second sub-tab of the same card (the small **2 | 3** switch). LFO 1 did not
  change. LFO 2 and LFO 3 each move one control — in every oscillator that has it — and their moves add up when they aim at the same control.
- **FILTER**: a conventional four-pole (24 dB per octave) resonant low-pass in every voice, before the amp envelope, with two characters,
  **LADDER** and **OTA**, CUTOFF, RESO, DRIVE, KEY TRK, ENV AMT (up to ± 8 octaves) and its own small ADSR; LFO 2 and LFO 3 can move its cutoff and its
  resonance (two new targets). It is **open by default**, and an open filter is not even computed: every older sound is exactly what it was.
- **600 new presets** (`501`–`1100`: 50 in each of the 12 categories, Drums & Perc included), composed and measured like those of beta 0.2, now with
  LFO 2 and / or LFO 3 moving wavelet controls in every one of them (mostly of the subtractive oscillators: sparsity, source phase and width, the window,
  the scale cutoff and resonance, the morph …) and the new filter, with its envelope, in about two in three. They come **first in the list**:
  908 presets to rate in all.
- **EVALUATE SOUNDS** now ends each passage with a **long C minor chord** (4 s) so that sustained sounds can be judged too; the sounds come in
  **sets of 40**, each set with **its own file** (`sound 501 to sound 540.txt`), and **Start at…** asks for the number of the first sound to rate.


## What beta 0.2 adds

- **SuperModulation**. What makes this synthesizer different is that every timbre control acts on the *scales* of one wave
  cycle — and now both LFOs reach all of them. **LFO 1** gets three more amounts: **SPARSITY** (the atoms that are kept come
  and go), **RESO** (the resonance of the scale filter pulses) and **ENV>WAV** (how far each note's envelope pushes the
  wavelet morph, swinging with the LFO). **LFO 2** can move every control of the wavelet oscillators and of the scale filter: its
  TARGET menu now also offers **SPARSITY, SRC WIDTH, TILT, ODD BARS, EVEN BARS, SCALE SUS and MORPH** after the cutoff, slope,
  resonance, key tracking, envelope and velocity amounts, the position window and the source phase. (SPARSITY, SRC WIDTH and
  PHASE build the oscillator's tables at several values — 9, 9 and 12 — and each voice crossfades between the two nearest.)
- **300 new presets** (`201`–`500`), composed from oscillator layers that are *very different from each other* (a saw of
  Haar atoms against a Daubechies 20 sine, a noise tick against a mirrored-atom choir, …) and a library of LFO recipes, then
  measured one by one: no crackle (the chord with its bass stays under the limiter), a spectrum that really moves, loudness of
  the TOP Sounds. The new **SuperModulation** category (120 presets, the first one in the lists) holds the sounds whose life is
  the LFOs moving the wavelet controls. The 22 TOP Sounds and the 200 presets of beta 0.1 are unchanged (**Wobble Bass** is now
  the first of the Bass list).
- **Chord mode**: **BASS** (the button under CHORD MODE, on by default) plays the root two octaves below with the chord, a little
  louder; a chord keeps the level of a triad whatever its size. **The chord follows your left hand**: change the chord on the
  selector octave while the right-hand note is held and the held chord changes at once (only the notes of the current chord
  sound); the left hand remembers its last chord.
- **Oriental keyboard**: a three-position switch **TUNING** (Western · Arabic · Turkish) under CHORD MODE retunes the keys with
  **quarter tones** (Arabic, 24 tones to the octave) or **commas** (Turkish makams, 53 to the octave), by scale (**Rast, Bayati,
  Hijaz, Saba, Nahawand**) and tonic; the keys it moves are marked on the keyboard. The demo stays in equal
  temperament.
- The **preset browser at the right follows the preset box**: step with ◀ ▶ or the menu and it shows the sound's category and the
  sound itself.

## What is new compared with the Wavelet Synthesizer

- **Three oscillators**, **A1 A2 B1**, chosen with the folder tabs under the header. Every oscillator has its **own** tone
  (subtractive: source wave, atom shape, wavelet, sparsity, phase; additive: atom pattern, drawbars, tilt, band envelopes),
  **scale filter**, **position window**, **tuning** (octave, semitones, cents), **own envelope** (it multiplies the AMP
  ENVELOPE, so one oscillator can be a short attack and another a long pad) and **pitch envelope** (a fall or rise in
  semitones over a time: kicks, plucks, zaps). Only one oscillator's cards are shown at a time, so the panel stays as clear as
  the original's.
- **OSC MIX** (the card next to the scope): three level knobs, one per oscillator, replace the A/B MIX knob. A1 plays at 100 %
  on a new patch, the others at 0. The sub oscillator is in the same card.
- **237 presets** (version 1.0: the ones OktoPierre kept; earlier betas had 930 and then 1182): **21 TOP Sounds** (unchanged: they sound exactly as in beta 0.7) and 216 numbered ones
  (`020`–`1374`, from the betas 0.1 to 0.3.4), in 11 sections (Pad, SuperModulation, Bass, Lead, Keyboard, Organ, Strings, Brass & Wind, Bells & Mallets, FX, Drums & Perc). Every new preset uses at least two
  oscillators; the letters of its name say which (`A1A2`, `A1B1`, `A1A2B1` …); an oscillator is often the attack (a click, a
  breath, a pluck) of another.

- **CHORD MODE** (button of the PLAY card, above the keyboard): the panel grows and a *chord harp* card appears (twelve chord pads, the chord
  name, KEYS OCT, STACKED / FOLDED voicing, BASS, STRUM and a strum plate): one octave of the keyboard chooses the chord type, one
  finger plays the whole chord. With CHORD MODE off the panel is the plain synthesizer and none of it is shown.
- **LFO 2** moves its target in **every** oscillator at once (and the wavelet morph and the phase LFO act on each oscillator).
- **Lighter on the CPU**: playing the same 22 TOP Sounds with twelve held notes takes about **20 % less time** than in the Wavelet
  Synthesizer beta 0.7 (JavaScript engine, measured: 2.65 s → 2.15 s for 3 s of audio each). The review of its load (`Revue.md` of the CPU study) is applied: `exp`
  instead of `pow(10, ·)`, a two-sine chorus, no `%` in the wavelet transform, idle instances skip their silent blocks, the
  smoothing constants no longer depend on the host's sample rate, table builds run in a Web Worker, the plug-in's builder
  thread and library are safer. What was left out, and why, is in [RELEASE_HISTORY.md](RELEASE_HISTORY.md).

## Use it

### Web app
Open `web/index.html` in Chrome, Edge or Firefox (double-click; no server or install needed). A welcome window offers **Run
the demo**, **Play the synth** or **Download the VST**. **MANUAL** (header) opens the manual of the oscillator shown.
- Play with the mouse on the keyboard, a MIDI keyboard (Web MIDI), or the computer keyboard: digits **1 2 3 4 5 6 7 8 9 0** =
  C D E F G A B C D E; the letter rows A W S E D F T G Y H U J K O L P = a chromatic piano; **Z** / **X** = octave down / up.
- **MIDI**: notes, pitch bend, mod wheel, sustain; Program Change selects a preset; **MIDI learn** by a right-click on a control.
- Presets: the **preset browser** at the right of the panel (TOP Sounds and the categories, ↑ ↓ ← → keys), ◀ ▶ and the
  preset name's menu. **Save preset / Export / Import** are in the status bar.
- **▶ DEMO** plays Beethoven's *Appassionata* (III), in equal temperament, while touring the presets (the TOP Sounds mixed with new ones that show
  the oscillators at work), a new one about every 4 seconds; **■ STOP** (or Esc) ends it and gives back your sound.

### VST3 / VST2 in Ableton Live (Windows)
1. Build the plugin (see below), or take the zip of the Releases page.
2. Copy the **whole** `OktoMultiWaveSynth.vst3` folder into **either** your VST3 folder `C:\Program Files\Common Files\VST3`
   (`vst\install.bat` does this and asks for administrator rights) **or** your VST2 plug-in folder (no administrator rights).
3. In Live: *Preferences → Plug-ins* → enable **Use VST3 Plug-in System Folders** (or **Use VST2 Plug-in Custom Folder**) →
   **Rescan**. Drag *Plug-ins → Okto MultiWave Synth* onto a MIDI track.

The plugin is a single self-contained DLL that only needs Windows system libraries: a VST3 plug-in
(`Contents\x86_64-win\OktoMultiWaveSynth.vst3`) and, as a copy next to it, a VST2 plug-in (`OktoMultiWaveSynth.dll`).
Pitch bend, mod wheel, sustain pedal and **tempo SYNC** (delay and LFOs in note values of the host's tempo) are supported,
and every sound parameter can be automated. The chord harp's six settings are plug-in parameters too (saved with the Live Set,
never in a preset). In the plug-in, **SAVE PRESET**, **DELETE**, ▲ ▼ and a **user bank** keep your adjustments in one
readable text file, `OKTOMULTIWAVE presets.txt`, next to the plug-in folder.

It installs next to the Wavelet Synthesizer: its own name, class IDs and VST2 ID, its own presets file.

## Build the VST3

Requirements: the portable [llvm-mingw](https://github.com/mstorsjo/llvm-mingw/releases) toolchain
(`llvm-mingw-<date>-ucrt-x86_64.zip`, extract it anywhere; no admin rights, no Visual Studio, no CMake). Node.js is optional:
if present, the build regenerates the C++ parameter table from `tools/spec.js`.

```bat
set LLVM_MINGW=C:\Users\<you>\tools\llvm-mingw   (default: %USERPROFILE%\tools\llvm-mingw)
vst\build.bat
```
Output: `build\OktoMultiWaveSynth.vst3\Contents\x86_64-win\OktoMultiWaveSynth.vst3` + `Contents\Resources\manual\`. The build
uses `-ffp-contract=off`, so that the C++ and JavaScript engines do the same floating-point operations.

## Project layout

```
tools/spec.js          single source of truth: parameters, the three oscillators, panel layout, presets
tools/gen_spec.js      generates web/js/spec.js and vst/src/generated/spec.h
tools/presets_top.js   the 22 TOP Sounds;  tools/presets_new.js  the 200 presets of beta 0.1;  tools/presets_super.js  the 300 of beta 0.2;  tools/presets_lfo3.js  the 600 of beta 0.3
tools/make_presets.js  builds the presets of beta 0.1 from tools/recipes_*.js (tools/preset_dsl.js, preset_lab.js: loudness
                       matching, distinctness check, contact sheets)
tools/supermod/        composes the presets of beta 0.2 and 0.3 from oscillator layers, drums and LFO 2 / LFO 3 recipes, measures and selects them
tools/dsp_selftest.js  engine self-test;  tools/dsp_compare.js  C++ engine against the JavaScript reference
tools/manual/          generator of the user manuals
web/                   web application (vanilla JS, Web Audio AudioWorklet, no libraries)
  js/core.js           DSP reference implementation (also runs inside the AudioWorklet and the table-building Worker)
  js/ui.js, app.js     panel UI, presets, MIDI, computer keyboard
  js/demo.js           demo player (a tour of the presets on Beethoven's Appassionata; js/demo_data.js holds its notes)
vst/                   VST3 / VST2 plugin (C++17)
  src/dsp.h            C++ port of core.js;  src/plugin.cpp  processor, controller, factory
  src/editor.cpp       the panel window (draws through editor_platform.h; editor_win.cpp is its Windows side)
  src/bank.h, platform.h   the presets file and the operating-system calls
tests/                 test tools (VST3 host, browser driver, regression against beta 0.7, idle-skip rule)
```

## How the engine works (short)

- Each note plays one **cycle of 2048 samples** per oscillator, analysed with a periodic orthogonal DWT into **11 bands**.
  Band *b* has 2^(b−1) atoms and covers roughly harmonics 2^(b−2)…2^(b−1): one band ≈ one octave of harmonics. Because the
  analysis is pitch-synchronous, the bands follow the note.
- Every band is resynthesised into its own layer and stored as **band-limited mip tables**, so the oscillator stays
  alias-free. A voice mixes the layers of each oscillator with per-band gains at audio rate, then the oscillators with their
  levels (smoothed over 20 ms); filter sweeps and envelopes are smooth. An oscillator whose level is 0 costs nothing.
- Structural changes (wavelet, source, sparsity, pattern, seed, an oscillator switched on or off) rebuild the tables on a
  background thread (a Worker in the web app) and crossfade over about 10 ms.

## Development checks

```bash
node tools/gen_spec.js            # after editing tools/spec.js or the presets
node tests/quick.js               # 20 s: syntax, engine, VST3 host sections, web smoke test
node tests/supermod.js            # beta 0.2: the SuperModulation destinations, the chord layer, the oriental tunings
node tests/filter.js              # beta 0.3: the voice FILTER (LADDER and OTA, resonance, drive, key tracking, envelope, LFO targets, open = bypassed)
node tests/regress_v07.js         # the 22 TOP Sounds against the published beta 0.7 engine (within 1.5e-7)
node tests/idle_skip.js           # the idle rule does not cut a delay echo or a reverb tail
node tests/web/smoke.js           # the three oscillator views, the folder tabs and CHORD MODE in headless Edge
```
To cross-check the C++ engine, compile `vst/devtest/dsp_render.cpp` (with `-ffp-contract=off`) and run
`node tools/dsp_compare.js <dir>`: all 1000 cases (the 930 presets and 70 variants of every feature) agree within 2e-6 of full scale (worst: 3.6e-7). `vst/devtest/vote_session.cpp`
drives the plug-in's window like a player in an off-screen window (folder tabs, CHORD MODE, fit to the screen, preset browser and its stars).

## Licence

Copyright (C) 2026 Pierre Arnaud GUYOT ("OktoPierre").

Okto MultiWave Synth (web app, VST3 plugin, tools and tests) is free software: you can redistribute it and/or modify it
under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
Public License in the file `LICENSE` for more details.

If you share the compiled plugin (`OktoMultiWaveSynth.vst3`) or the web app, share the source code with it as well (for
example a link to the project's repository), as the GPL requires.

Parts that keep their own licence:
- `vst/external/pluginterfaces/`: Steinberg VST3 interface headers, MIT licence (compatible with the GPL; its licence text is
  kept in the folder and copied into the plugin bundle).
- `tools/demo/appassionata3.mid` and `web/js/demo_data.js`: the demo music, Beethoven's *Appassionata* III from the Mutopia Project,
  public domain. This music data is not covered by the GPL (see `tools/demo/SOURCE.md`).

## Credits

Created by Pierre Arnaud GUYOT ("OktoPierre"), on the basis of his
[Wavelet Synthesizer](https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST)
(DOI [10.5281/zenodo.23431760](https://doi.org/10.5281/zenodo.23431760)). The chord keyboard comes from his WaveChord work.

- Demo music: MIDI from the [Mutopia Project](https://www.mutopiaproject.org): Beethoven's Piano Sonata No. 23 *Appassionata*, Op. 57 III — public domain.
- VST3 interface headers: Steinberg Media Technologies, MIT licence.
- Wavelet filter coefficients were generated with PyWavelets (MIT licence) and are stored in `tools/wavelets.json`.

## Acknowledgments

Thanks to Jeremi Palmigani (aka Saoul Machine) and Flo (aka Go Tiger) for testing the Wavelet Synthesizer and providing
valuable feedback and improvement suggestions, and to Arnaud Grignard for the technical review of the concept.
