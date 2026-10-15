# Wavelet Synthesizer — Release history

Created by **Pierre Arnaud GUYOT** ("OktoPierre").

## beta 0.1 — 2026-10-14 (first release)

**Products**
- Web application (`web/index.html`, vanilla JavaScript + Web Audio AudioWorklet, works from file://).
- VST3 and VST2 instrument for Ableton Live on Windows x64 (`build/WaveletSynthesizer.vst3`, one self-contained DLL with both entry points and a native Win32/GDI+ editor; the folder can be copied into a VST3 folder or a VST2 folder).
- User manuals A (Wavelet Subtractive) and B (Wavelet Additive), also bundled inside the VST3.

**Sound engine**
- Engine A, Wavelet Subtractive: 6 source waves, 7 wavelets (Haar, Daubechies 2/4/8/20, Symlet 8, Coiflet 3), sparsity, scale filter (LP/HP/BP/BR, cutoff 0–12 bands, slope, resonance, key tracking), position window.
- Engine B, Wavelet Additive: 6 atom patterns, 11 drawbars, tilt, per-band scale envelope.
- Sub oscillator (sine / triangle / square, −1 or −2 octaves) for extra low end.
- Shared: amp and mod envelopes, LFO, 16 voices with mono/legato, polyphonic portamento (Off / Poly / Legato only, Poly by default: every voice glides from its own previous note; Legato glides from the held note) with glide time, unison, saturation, ping-pong delay, reverb, DC blocker, soft limiter.
- Band-limited (alias-free) playback; the C++ engine matches the JavaScript reference within 2.4e-7.

**Presets**: 32 factory presets (17 for engine A, 15 for engine B), from clean sounds to heavy effects, ordered with OktoPierre's 15 favourite sounds first (Square Mod 2, Wavelet Lead, Haar Bass, Edge Pluck, Focus Sweep, Soft Flute, Infra Sub Bass, Dub Echo Lead, Fuzz Bass, Laser Sweep, Warm Pad, Mirror Sub Bass, Sparse Keys, Space Choir, Square Mod), then the others alternating A / B and the two Init presets last (the order of the DEMO preset tour too; the VST3 stores the preset shown in its browser by name, so Live Sets saved with the earlier order show the right preset), including "B · Mirror Sub Bass", "A · Square Mod" and "A · Square Mod 2" by OktoPierre; the app and new plugin instances open on "A · Warm Pad".

**Web app extras**
- ▶ DEMO plays Beethoven's *Appassionata* (III) with a tour of all the factory presets (a new preset about every 4 s, on a change of chord, shown in the preset browser: "A · Warm Pad" on the opening chords with its filter cutoff opening, then "A · Wavelet Lead", then the other presets in menu order, favourites first, without "A · Square Mod"); the ▾ menu offers J. S. Bach *Toccata in D minor* and seven virtuoso Beethoven piano works (*Appassionata* III, *Moonlight* III, *Rage over a Lost Penny*, Symphony No. 5 I in piano reduction, *Pathétique* I, *The Tempest* I, Sonata Op. 111 I; MIDI from the Mutopia Project, public domain except *Moonlight*: CC BY-SA 2.5, Stewart Holmes), or your own MIDI file, with animated parameters explained in a small window.
- Computer keyboard (digits 1–0 = C D E F G A B C D E, letter rows chromatic), Web MIDI, user presets (save / export / import).

**Quality**
- Independent test suites (`tests/`): VST3 test host (DAW-like call order, state, automation, offline rendering, editor), browser tests (UI, audio, presets, demo).

**Licence**: free software under the GNU General Public License v3 or later (`LICENSE`), Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre). The panel credit, the manuals, the DLL version information and every source file carry the notice; the plugin bundle contains the licence texts. The demo music keeps its own licences (see `tools/demo/SOURCE.md`).

**Security fixes** (code review of 2026-10-14)
- Oscillator: a fundamental above the sample rate (e.g. note 127 with OCTAVE +2, or notes from G8 up with OCTAVE +3) made the VST read outside its wavetable and crash the host; in the web app it made the sound NaN until reload. The phase now always stays inside the cycle, and voices (and the sub oscillator) whose fundamental is above Nyquist are silent. Normal playing is bit-identical.
- MIDI file reader (web "Load a MIDI file…"): lengths read from the file are limited to the data really present, so a damaged or hostile file can no longer freeze the page; tempo lookup is now fast for files with many tempo changes.
- VST3 message attributes: null arguments and too-small string buffers from the host are rejected.
- `vst/install.bat`: the folder path is no longer pasted into an administrator command line (the elevated step runs the same file again), so folder names containing `'`, `&` or parentheses are safe.
