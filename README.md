# Okto Fractal Wavelet (OktoWave)

**A free synthesizer plug-in that builds its sounds from wavelets**, by Pierre Arnaud GUYOT ("OktoPierre"). Windows and Mac (VST3). Free for any use, including your music.

## 🎃 New in 2.1: the Halloween Special Edition
**An improved new sound engine, a new interface, and new sounds to communicate with the ghosts** 👻
- **The Halloween look** 🎃: choose a sound of the **Halloween** list and the synth turns Halloween (the plug-in and the web app); any other list keeps the usual look. The synth opens on **Grave Digger**.
- **New metal knobs**, **full screen** (Windows: double-click the title bar, or F11) and **two screens** (Windows: the plug-in takes the size of the screen it is on).
- **A new sound bank**: 332 sounds, 32 in the Halloween list.
- The web app is updated: same look, same sounds, a new welcome page.

## ▶ Watch the demo
**https://www.youtube.com/watch?v=hWzu-LVZM8I**

## ▶ Play it online, nothing to install
**https://pierrearnaudguyot.github.io/Free-Wavelet-Synthesizer-VST/web/** (Chrome or Edge; a MIDI keyboard plays it directly; the web version is updated separately from the plug-in).

## ⬇ Download the plug-in (Windows VST3 / VST2, macOS VST3)
1. Open the **[latest release](https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST/releases/latest)**.
2. Under **Assets**, click the zip for **Windows** (`…-win64.zip`) or **macOS** (`…-mac.zip`).
3. Unzip it and copy the whole folder **OktoMultiWaveSynth.vst3** into your VST3 folder (Windows `C:\Program Files\Common Files\VST3` · macOS `~/Library/Audio/Plug-Ins/VST3`), or on Windows into your VST2 plug-in folder. `INSTALL.txt` (`INSTALL-mac.txt`) in the zip says more.
4. Rescan the plug-ins in your DAW (Ableton Live: *Preferences → Plug-ins → Rescan*), then open *Plug-ins → OktoPierre → Okto Fractal Wavelet*.

## What it is
- **A research instrument** to hear what the wavelet transform does to sound: the discrete wavelet transform splits each tone into 11 octave-spaced bands, and the synthesizer rebuilds it band by band instead of shaping it with Fourier filters.
- **Three wavelet oscillators**: two subtractive ones (A1, A2) that shape a source wave band by band (a WINDOW, a WAVELET FILTER, **TABLES** that moves the timbre through each note), and an additive one (B1) that builds a tone from wavelet atoms with eleven drawbars.
- **A wide palette**: OSC2 can modulate OSC1 (**FM**, ring, AM), many source waves, hard **SYNC**, a source **DRIVE** and **BITS**, a continuous **ANGLE** wavelet and **ENCRE**, **ENV / VEL → TABLES** (the timbre travels inside each note), a random start per note and a true **NOISE**.
- **An arpeggiator** (plug-in): **ARP** and **HOLD** in the PLAY card with RATE, PATTERN, OCT and GATE; MOTION, SWING and CHANCE in the Wavelet Lab. It follows your DAW's tempo and its settings are saved with each preset.
- **The Wavelet Lab**: the **MORPH LFO**, the **TONE ENVELOPE**, the WAVELET SHAPER, **POLARITY** (chosen bands turned down through silence to inverted), band punch and start phase.
- **Compare the wavelets**: seven of them (Haar, Daubechies 2, 4, 8 and 20, Symlet 8, Coiflet 3), WAVELET MORPH between two, and LFOs that move the wavelet itself (SuperModulation).
- **A complete synthesizer around it**: a real filter (OTA), three LFOs, envelopes, chorus, delay, reverb and punch, a chord mode, oriental tunings, VINTAGE and 332 presets (the opening sound is Grave Digger, the Halloween look), all as loud as one another.
- **Your sounds are kept from one version to the next**: each new version reads and converts your presets file and your projects; if your file holds presets of yours in the factory bank, the plug-in asks once whether you keep your bank or use the new one, after a backup copy of your file.
- **Free to use**: the plug-in and the web app, free of charge for any use, including your music productions.

## Licence
Okto Fractal Wavelet is **free to use (freeware)**, © 2026 Pierre Arnaud GUYOT (OktoPierre), all rights reserved: see [LICENSE.txt](LICENSE.txt). Its source code is private.

The source code of the **Wavelet Synthesizer beta 0.1**, the first version (2026-10-15), stays public under the GNU GPL v3 in the folder [`beta-0.1-source`](beta-0.1-source) (and in the release `v0.1-beta`). The versions up to 1.0.18 were published under the GNU GPL v3; the copies of those versions keep that licence.

## Credits
- Demo music: MIDI from the [Mutopia Project](https://www.mutopiaproject.org): Beethoven's Piano Sonata No. 23 *Appassionata*, Op. 57 III, public domain.
- VST3 interface headers: Steinberg Media Technologies, MIT licence. VST is a registered trademark of Steinberg Media Technologies GmbH.
- Wavelet filter coefficients: generated with PyWavelets, MIT licence.
- Cite the Wavelet Synthesizer: DOI [10.5281/zenodo.23431760](https://doi.org/10.5281/zenodo.23431760).

## Acknowledgments
Thanks to Jérémie Palmigiani, aka **Soul Machine** ([Instagram](https://www.instagram.com/djsoulmachine)), and Flo (aka Go Tiger) for testing the Wavelet Synthesizer and providing valuable feedback and improvement suggestions, and to Arnaud Grignard for the technical review of the concept.

Feedback, a bug, an idea: [a short form](https://docs.google.com/forms/d/e/1FAIpQLSdqkWNwanzcDDURcKepEK_U1P8b_HyR8B5_Gk48xtuQOYHqgQ/viewform) (no account needed).
