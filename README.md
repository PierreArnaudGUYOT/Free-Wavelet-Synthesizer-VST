# Okto Fractal Wavelet (OktoWave)

**A research synthesizer for the sound of the wavelet transform**, by Pierre Arnaud GUYOT ("OktoPierre").

## ▶ Watch the demo
**https://www.youtube.com/watch?v=hWzu-LVZM8I**

## ▶ Play it online, nothing to install
**https://pierrearnaudguyot.github.io/Free-Wavelet-Synthesizer-VST/web/** (Chrome or Edge; a MIDI keyboard plays it directly)

## ⬇ Download the plug-in (Windows VST3 / VST2, macOS VST3)
1. Open the **[latest release](https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST/releases/latest)**.
2. Under **Assets**, click the zip for **Windows** (`…-win64.zip`) or **macOS** (`…-mac.zip`).
3. Unzip it and copy the whole folder **OktoMultiWaveSynth.vst3** into your VST3 folder (Windows `C:\Program Files\Common Files\VST3` · macOS `~/Library/Audio/Plug-Ins/VST3`), or on Windows into your VST2 plug-in folder. `INSTALL.txt` (`INSTALL-mac.txt`) in the zip says more.
4. Rescan the plug-ins in your DAW (Ableton Live: *Preferences → Plug-ins → Rescan*), then open *Plug-ins → OktoPierre → Okto Fractal Wavelet*.

## What it is
- **A research instrument** to hear what the wavelet transform does to sound: the discrete wavelet transform splits each tone into 11 octave-spaced bands, and the synthesizer rebuilds it band by band instead of shaping it with Fourier filters.
- **Three wavelet oscillators**: two subtractive ones (A1, A2) that filter a source wave band by band (WAVELET FILTER, WINDOW), and an additive one (B1) that builds a tone from wavelet atoms with eleven drawbars.
- **Compare the wavelets**: seven of them (Haar, Daubechies 2, 4, 8 and 20, Symlet 8, Coiflet 3), WAVELET MORPH between two, and LFOs that move the wavelet itself (SuperModulation), to hear how each one colours the same sound.
- **20 morph macros**: sliders that each move several controls of the subtractive oscillators together (BRIGHTEN, WAVELET MORPH, HOLLOW, SPARSE GRAIN, NOISE AIR, SHIMMER, GLASS …), to vary a sound without opening every card.
- **A complete synthesizer around it**: a real filter (ladder / OTA), three LFOs, envelopes, chorus, delay, reverb and punch, a chord mode, oriental tunings, VINTAGE and 229 presets.
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
