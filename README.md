Wavelet Synthesizer beta 0.1: a new kind of synthesis (web app + VST3)

Wavelet Synthesizer is a new way to make sound: wavelet synthesis.
Classic synthesizers build sound from sine waves (additive) or carve
harmonics out of a waveform with a frequency filter (subtractive).
Wavelet Synthesizer works in the wavelet domain instead. One cycle of
the sound is split by a discrete wavelet transform into 11 octave
bands (scales) made of short "atoms". Sound is then shaped by scale
and by position inside the cycle, not only by frequency. The shape of
the wavelet itself (Haar, Daubechies 2/4/8/20, Symlet 8, Coiflet 3)
becomes part of the timbre.

Two engines:
- Engine A, Wavelet Subtractive: a source wave is decomposed into
  atoms. Only the strongest atoms are kept (sparsity), the cycle goes
  through a scale filter (low-pass, high-pass, band-pass, band-reject
  across scales, with slope and resonance) and a position window, and
  is then resynthesised.
- Engine B, Wavelet Additive: the sound is built directly from wavelet
  atoms, with 6 atom patterns, 11 drawbars (one per scale), a tilt and
  a per-band scale envelope.

Every band is played from band-limited tables, so there is no
aliasing. Also included: 16 voices, unison, sub oscillator,
polyphonic portamento, LFO, envelopes, drive, delay and reverb.

Two products, one engine:
- Web app in plain JavaScript (Web Audio AudioWorklet). It runs from a
  local file with no installation and no external library.
- VST3 instrument for Ableton Live (Windows x64): a self-contained
  DLL with a native editor. Its C++ engine matches the JavaScript
  reference within 2.4e-7.

Also: 32 factory presets (the author's favourite sounds first), user
manuals for both engines, a demo that plays Beethoven's
"Appassionata" through a tour of the presets, and independent test
suites for the plugin and the web app.

Written by Pierre Arnaud GUYOT ("OktoPierre"), 15 October 2026
Licence: GNU GPL v3 or later (see LICENSE).
