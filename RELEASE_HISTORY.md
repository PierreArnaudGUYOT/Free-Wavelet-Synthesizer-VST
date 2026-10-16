# Wavelet Synthesizer — Release history

Created by **Pierre Arnaud GUYOT** ("OktoPierre").

## beta 0.3 — 2026-10-15

**Presets by category**: 107 factory presets (51 new), organised like the banks of a hardware synthesizer. OktoPierre's 15 favourite sounds stay first, in his order; all the others follow by category: Bass (15), Lead (11), Keys (10), Organ (8), Pad (17), Strings (8), Brass & Wind (8), Pluck (7), Bells & Mallets (7), FX (8), Drums & Perc (6), Init (2).
- New: A · Ladder Bass, B · Pluck Bass, AB · Wobble Bass, A · Rubber Bass, A · Octave Bass; A · Saw Lead, A · Whistle Lead, A · Pulse Lead, AB · Hybrid Lead; A · Tine Piano, AB · Electric Piano, B · Reed Piano, A · Clavi, B · Toy Piano, A · Lo-Fi Piano; B · Jazz Organ, B · Gospel Organ, B · Church Organ, B · Reed Organ, B · Flute Organ; A · Analog Pad, A · Dark Pad, B · Halo Pad, AB · Evolving Pad; A · Chamber Strings, A · Pizzicato, A · Slow Strings, AB · Analog Strings; A · Synth Brass, A · Brass Stab, B · Clarinet, AB · Breathy Flute; A · Harp, B · Koto, A · Synth Pluck, AB · Arp Pluck; B · Glockenspiel, B · Vibraphone, B · Marimba, B · Tubular Bells, AB · Crystal Bell; A · Wind, B · Sci-Fi Burble, AB · Robot Voice, A · Alarm; AB · Sub Kick, A · Noise Snare, A · Closed Hat, A · Open Hat, B · Wood Block, A · Synth Tom (the drums are pitched: play them on different keys). Levels matched to the favourites.
- Preset menus: in the web app ★ FAVOURITES on top, then one folding group per category (with its number of presets), then the user presets; in the VST the favourites on top and one submenu per category. ◀ ▶ and Program Change follow the same order. Live Sets keep their preset (stored by name).

**Demo**: the default demo now starts with the phrase that follows the opening chords of the *Appassionata* (7.8 s cut, 1:59 instead of 2:07), on "A · Square Mod 2"; every later preset change is unchanged (same presets, same chords). The demo's preset sequence is written out, so new presets do not change it.

**Quality**: the C++ engine matches the JavaScript reference within 2.4e-7 for all 107 presets; test expectations updated for the A/B MIX (VST host) and the new tour (demo test).

## beta 0.2 — 2026-10-15

**Engines A and B mixed**
- New **A/B MIX** knob (at the right of both engine sections): engine A alone, engine B alone, or both at once (linear crossfade, smoothed over 20 ms). Each voice then renders engine A's filtered source and engine B's atoms at the same pitch, through the same envelopes, scale filter, position window and effects; the sub oscillator is added once.
- The **A · SUBTRACTIVE / B · ADDITIVE** tabs now only choose the panel shown; switching them neither changes the sound nor marks the preset as modified.
- Compatibility: presets, user presets and Live Sets saved before beta 0.2 get A/B MIX = their engine and sound exactly as before (the 32 beta 0.1 factory presets render bit-identically).

**Triple chorus (string machine)**
- New **CHORUS** section (amount, RATE, DEPTH) next to the SUB OSC: three delay lines (6–12 ms) swept by a slow and a fast LFO (about 9.7 × the rate), 120° apart, spread left / centre / right; after DRIVE, before DELAY and REVERB. The keyboard is a little narrower to make room (still C2–C7).

**Presets**: 56 factory presets. OktoPierre's 15 favourites stay first, followed by 24 new presets using the chorus (A · String Machine, A · Solina Cellos, A · Poly Chorus Pad, A · Chorus Square Lead, B · Ensemble Organ, B · Glass Ensemble, B · Chorus Flute), the sub oscillator (A · Sub Saw Bass, A · Reese Sub, A · Acid Sub, A · Deep Sub Pluck, B · Sub Organ Bass) and the A + B mix ("AB · …": Hybrid Strings, Dream Pad, Bell Pad, Wavelet Choir, Hybrid Keys, Organ Lead, Space Strings, Sub Hybrid Bass, Glass Keys, Wide Brass, Chip Hybrid, Shimmer Pluck); then the other beta 0.1 presets. In the preset list "AB" is shown in both engine colours.

**Quality**: the C++ engine still matches the JavaScript reference within 2.4e-7 for all 56 presets. `CLAUDE.md` describes the architecture for maintenance and code reviews.

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
- Online on GitHub Pages (https://pierrearnaudguyot.github.io/Free-Wavelet-Synthesizer-VST/). MIDI for hardware without a DAW: input channel selector (all or 1–16), Program Change selects a preset, MIDI learn (right-click a control, move a controller knob; Esc cancels, Delete unlinks; kept in the browser).

**Quality**
- Independent test suites (`tests/`): VST3 test host (DAW-like call order, state, automation, offline rendering, editor), browser tests (UI, audio, presets, demo).

**Licence**: free software under the GNU General Public License v3 or later (`LICENSE`), Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre). The panel credit, the manuals, the DLL version information and every source file carry the notice; the plugin bundle contains the licence texts. The demo music keeps its own licences (see `tools/demo/SOURCE.md`).

**Security fixes** (code review of 2026-10-14)
- Oscillator: a fundamental above the sample rate (e.g. note 127 with OCTAVE +2, or notes from G8 up with OCTAVE +3) made the VST read outside its wavetable and crash the host; in the web app it made the sound NaN until reload. The phase now always stays inside the cycle, and voices (and the sub oscillator) whose fundamental is above Nyquist are silent. Normal playing is bit-identical.
- MIDI file reader (web "Load a MIDI file…"): lengths read from the file are limited to the data really present, so a damaged or hostile file can no longer freeze the page; tempo lookup is now fast for files with many tempo changes.
- VST3 message attributes: null arguments and too-small string buffers from the host are rejected.
- `vst/install.bat`: the folder path is no longer pasted into an administrator command line (the elevated step runs the same file again), so folder names containing `'`, `&` or parentheses are safe.
