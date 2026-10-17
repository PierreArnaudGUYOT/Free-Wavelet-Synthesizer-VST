# Wavelet Synthesizer — Release history

Created by **Pierre Arnaud GUYOT** ("OktoPierre").

## beta 0.3 (pre-release) — 2026-10-16

Pre-release to test the integration in Ableton Live; the official page and release stay on beta 0.2.

**In short**
- **Presets**: **153 factory presets** (46 new). The new ones are OktoPierre's best candidates from his listening test of
  150 new sounds: every preset he rated **7 to 10 stars out of 10**, with the changes he recorded while listening. In each
  category they come **first, the best rated first**; his 15 favourites stay at the top of the list.
- **Sound engine**: new **WAVELET MORPH** — a second wavelet and a crossfade between the two, set by a knob, moved by the
  LFO or by the mod envelope — and a second LFO, **LFO 2**, on any parameter of the SCALE FILTER or the POSITION window.
- **Plug-in**: a **preset browser** at the right of the panel (TOP Sounds and the sound types, one click loads a sound,
  can be hidden), **SAVE PRESET** to adjust a factory preset (and rename it), **DELETE** to clear out the presets you do
  not want, **▲ ▼** to reorder every list, and a **user bank**; all of it in one readable text file, `OKTOWAVE presets.txt`,
  kept when Live is closed and read back to make the next version. The panel's name reads **OKTOWAVE** · Wavelet
  Synthesizer.

**WAVELET MORPH**
- The sound is also built with **WAVELET 2** and crossfaded with the main one, per voice: **MORPH** (0 % = WAVELET,
  100 % = WAVELET 2) + LFO × **LFO→WAVELET** + mod envelope × **ENV>WAV**. It is heard where the wavelet shapes the sound:
  the scale filter (CUTOFF, RESO), SPARSITY, the POSITION window, and all of engine B.
- Panel: WAVELET 2, MORPH and ENV>WAV in the engine A section (the atom display is a little smaller), LFO→WAVELET in the
  LFO section.
- Compatibility: four parameters appended (WAVELET 2, MORPH, LFO→WAVELET, ENV>WAV, default 0): presets, user presets and
  Live Sets saved before sound exactly as before (bit-identical: the WAVELET 2 tables are only built when the morph can
  move away from WAVELET).

**New presets** (★ = OktoPierre's vote, * = changed by him while listening; levels matched to the favourites):
Bass (5): A · Deep Saw Bass 8★*, A · Wave Morph Bass 8★, A · Acid Line 7★*, A · Fat Unison Bass 7★*, A · Wave Wobble Bass 7★*; Lead (7): A · Screaming Lead 9★, A · Wave Attack Lead 9★, A · Wave Pulse Lead 9★*, AB · Duo Lead 8★, B · Flute Lead 8★, A · Wave Window Lead 8★, A · Wave S/H Lead 7★*; Keys (2): A · Dyno Keys 9★, AB · Wurli Bark 8★; Organ (3): B · Theatre Organ 9★, AB · Gospel Mix Organ 8★, B · Full Drawbar Organ 7★; Pad (7): A · Noise Wash Pad 9★*, B · Choir Pad 8★*, AB · Glass Choir 8★*, A · Sweep Pad 7★, A · Analog Brass Pad 7★, A · Wave Morph Pad 7★, AB · Wave Atom Choir 7★*; Strings (8): A · Solo Violin 9★*, A · Cello Section 8★, AB · Silk Strings 8★, A · Spiccato Strings 8★, A · Shimmering Strings 8★*, A · Ensemble Strings 7★, B · Vox Strings 7★, A · Wave Tremolo Strings 7★*; Brass & Wind (3): A · Wave Brass 8★*, A · French Horn 7★, A · Brass Section Stab 7★; Pluck (1): A · Steel Pluck 7★*; Bells & Mallets (1): B · Xylophone 7★; FX (9): A · Wave Robot 10★, A · Siren Sweep 9★*, A · Wave Riser 9★*, A · Wave Laser 9★*, B · Wave Random Computer 7★, A · UFO 7★, A · Wave Atom Scanner 7★*, B · Wave Reverse Bands 7★, A · Wave Glitch Morph 7★*.

**LFO 2** (both products)
- A second free-running LFO in its own card next to CHORUS: SHAPE (the five shapes of LFO 1), RATE (0.05–20 Hz), AMOUNT
  (±100 % = ± half the target's range: ±6 bands of CUTOFF, ±180° of POSITION…) and the TARGET menu next to its title:
  CUTOFF, SLOPE, RESO, KEY TRK, ENV AMT, VEL AMT, POSITION, WIDTH or DEPTH. The on-screen keyboard is a little narrower
  (still C2–C7).
- Compatibility: four parameters appended (AMOUNT 0 by default): older presets and Live Sets sound exactly as before.

**Knobs with few positions** (both products): SUB OCT and the SHAPE knobs move with a short drag (24 px per step), and a
click goes to the next value.

**Presets in the plug-in**
- **Preset browser**, at the right of the panel: FACTORY and USER BANK tabs; the sound types with their count — first
  **TOP Sounds** (OktoPierre's 15 favourites, then the sounds he rated 8 to 10) — and the sounds of the type selected (a
  click loads one; engine letters, ★ for a favourite, his vote, "ADJ" for an adjusted preset). ▲ ▼ move the sound playing
  in its list. Buttons TO BANK…, RESTORE, DELETE, EXPORT…, FILE. **HIDE** folds it away (the window gets narrower); a
  click on the preset name brings it back; a right-click opens the classic menu. Live Sets remember whether it is open.
- **SAVE PRESET** (left of MANUAL A) overwrites the preset playing: a factory preset is **adjusted** in place (a small
  window proposes its name, which can be changed; RESTORE brings the original back), a sound of the user bank is
  replaced.
- **DELETE** takes a factory preset out of the lists and the ◀ ▶ arrows (the menu's "Deleted presets" brings it back).
- **User bank**: your own sounds in 12 sections (Bass … Bells & Mallets, **Chords**, FX, Drums & Perc), empty at first.
- **One text file**, `OKTOWAVE presets.txt`, next to the `WaveletSynthesizer.vst3` folder (kept when a new version
  replaces that folder), shared by every instance and read back when Live opens again: every factory preset ("Adjusted:
  yes" with its name now, "Deleted: yes"), the order of every list ("LIST ORDER"), and the user bank — each sound as the
  parameters that differ from the defaults. EXPORT… writes a copy. A folder that cannot be written (the VST3 system
  folder needs administrator rights) gives a clear message. The user bank of the first beta 0.3 build is taken over.

**Panel**: the name at the top left reads **OKTOWAVE** · WAVELET SYNTHESIZER (the plug-in keeps its name in Live).

**Plug-in**: version 0.3.0 everywhere (VST3 class info and DLL version info agree).

**Quality**: C++ = JavaScript within 2.38e-7 on the 153 presets and on LFO 2 driving each of its 9 targets; VST3 host
suite (its editor clicks now scale from the window height: the browser makes the window wider), VST2 smoke test,
`vst/devtest/bank_session.cpp` (the browser, SAVE PRESET, RESTORE, DELETE, ▲ ▼, the user bank, the presets file read
back after the plug-in is reloaded), web app suites.

## beta 0.2 — 2026-10-15

**In short**
- **Sound engine**: the two engines can now be **mixed** (new A/B MIX knob: subtractive engine A, additive engine B, or both together in one sound), and a new **triple chorus** gives the wide, lush ensemble sound of 1970s string machines.
- **Presets**: **107 factory presets** instead of 32 (75 new), **organised by type** like a hardware synthesizer — Bass, Lead, Keys, Organ, Pad, Strings, Brass & Wind, Pluck, Bells & Mallets, FX, Drums & Perc — with OktoPierre's 15 favourite sounds at the top of the list.
- **Demo** (web app): starts straight on the music's first fast phrase, on the Clarinet.

**Engines A and B mixed**
- New **A/B MIX** knob (at the right of both engine sections): engine A alone, engine B alone, or both at once (linear crossfade, smoothed over 20 ms). Each voice then renders engine A's filtered source and engine B's atoms at the same pitch, through the same envelopes, scale filter, position window and effects; the sub oscillator is added once.
- The **A · SUBTRACTIVE / B · ADDITIVE** tabs now only choose the panel shown; switching them neither changes the sound nor marks the preset as modified.
- Compatibility: presets, user presets and Live Sets saved with beta 0.1 get A/B MIX = their engine and sound exactly as before (the 32 beta 0.1 factory presets render bit-identically).

**Triple chorus (string machine)**
- New **CHORUS** section (amount, RATE, DEPTH) next to the SUB OSC: three delay lines (6–12 ms) swept by a slow and a fast LFO (about 9.7 × the rate), 120° apart, spread left / centre / right; after DRIVE, before DELAY and REVERB. The keyboard is a little narrower to make room (still C2–C7).

**Presets by category**: 107 factory presets (75 new), organised like the banks of a hardware synthesizer. OktoPierre's 15 favourite sounds stay first, in his order; all the others follow by category: Bass (15), Lead (11), Keys (10), Organ (8), Pad (17), Strings (8), Brass & Wind (8), Pluck (7), Bells & Mallets (7), FX (8), Drums & Perc (6), Init (2).
- With the chorus: A · String Machine, A · Solina Cellos, A · Poly Chorus Pad, A · Chorus Square Lead, B · Ensemble Organ, B · Glass Ensemble, B · Chorus Flute. With the sub oscillator: A · Sub Saw Bass, A · Reese Sub, A · Acid Sub, A · Deep Sub Pluck, B · Sub Organ Bass. Mixing both engines ("AB · …", shown in both engine colours): Hybrid Strings, Dream Pad, Bell Pad, Wavelet Choir, Hybrid Keys, Organ Lead, Space Strings, Sub Hybrid Bass, Glass Keys, Wide Brass, Chip Hybrid, Shimmer Pluck.
- A library by category: A · Ladder Bass, B · Pluck Bass, AB · Wobble Bass, A · Rubber Bass, A · Octave Bass; A · Saw Lead, A · Whistle Lead, A · Pulse Lead, AB · Hybrid Lead; A · Tine Piano, AB · Electric Piano, B · Reed Piano, A · Clavi, B · Toy Piano, A · Lo-Fi Piano; B · Jazz Organ, B · Gospel Organ, B · Church Organ, B · Reed Organ, B · Flute Organ; A · Analog Pad, A · Dark Pad, B · Halo Pad, AB · Evolving Pad; A · Chamber Strings, A · Pizzicato, A · Slow Strings, AB · Analog Strings; A · Synth Brass, A · Brass Stab, B · Clarinet, AB · Breathy Flute; A · Harp, B · Koto, A · Synth Pluck, AB · Arp Pluck; B · Glockenspiel, B · Vibraphone, B · Marimba, B · Tubular Bells, AB · Crystal Bell; A · Wind, B · Sci-Fi Burble, AB · Robot Voice, A · Alarm; AB · Sub Kick, A · Noise Snare, A · Closed Hat, A · Open Hat, B · Wood Block, A · Synth Tom (the drums are pitched: play them on different keys). Levels matched to the favourites.
- Preset menus: in the web app ★ FAVOURITES on top, then one folding group per category (with its number of presets), then the user presets; in the VST the favourites on top and one submenu per category. ◀ ▶ and Program Change follow the same order. Live Sets keep their preset (stored by name).

**Demo**: the default demo now starts with the phrase that follows the opening chords of the *Appassionata* (7.8 s cut, 1:59 instead of 2:07), opening on "B · Clarinet"; then a new preset about every 4 s on a change of chord: OktoPierre's favourites, then presets showing the chorus, the sub oscillator and the mix of both engines. The demo's preset sequence is written out, so new presets do not change it.

**Quality**: the C++ engine matches the JavaScript reference within 2.4e-7 for all 107 presets; test expectations updated for the A/B MIX (VST host) and the new tour (demo test). `CLAUDE.md` describes the architecture for maintenance and code reviews.

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
