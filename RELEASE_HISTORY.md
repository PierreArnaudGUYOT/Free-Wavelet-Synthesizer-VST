# Wavelet Synthesizer — Release history

Created by **Pierre Arnaud GUYOT** ("OktoPierre").

## beta 0.5 — 2026-10-17 (OktoPierre's sort)

**In short**
- **150 presets** instead of 253: OktoPierre went through all of them in the plug-in (his presets file "OKTOWAVE presets
  V4.txt") and kept 150; the 103 others are left out (listed below). His six adjustments are now the factory presets:
  B · Focus Sweep (unison 2), A · Laser Sweep (LFO 0.37 Hz, sub oscillator 26 %), A · Acid Sub (octave −2, unison 2),
  A · Wave Pulse Lead (octave −3, unison 4), A · Wavelet Lead Shift (octave −1), A · Focus Sweep Shift (octave −2).
- **TOP Sounds** (37): his TOP list and the first 15 sounds of Source Phase, one in two, the best first. They also open
  the factory order (◀ ▶, the plug-in's programs, the web app's preset list). Each category lists its sounds in his order.
- **Source Phase** is the second section of the browser and the menus, after TOP Sounds (44 sounds).
- **Moving presets** (plug-in): drag a sound of the browser onto another category — onto TOP Sounds it is added there — or
  right-click it: *Move to ▸*, *Back to* its own category, *Add to / Remove from TOP Sounds*. In the USER BANK tab a sound
  dragged onto a section moves to that section. All of it is kept in the presets file ("LIST ORDER v2") and travels with
  EXPORT / IMPORT; ★ marks the sounds that are in TOP Sounds.
- **Arrow keys** (plug-in and web app): ↑ ↓ play the sound above / below in the list shown, ← → show the category above /
  below; with the browser hidden, the previous / next preset. In the plug-in, click in the browser first so that it has
  the keyboard (other keys still go to the host).
- **Your projects and presets**: a Live Set keeps its sound (it is in the plug-in's state). One saved with a preset that is
  left out shows its name (SAVE PRESET then keeps it in the user bank). In your presets file the adjusted and deleted
  presets and the user bank are kept; the list order of a beta 0.3 / 0.4 file is not read (the lists were rebuilt).
- **The web app’s demo** (Appassionata): after B · Clarinet, the first eleven TOP Sounds; the five beta 0.2 sounds left out
  are replaced by kept ones of the same type (AB · Analog Strings, A · Ladder Bass, A · Wave Wobble Bass, AB · Silk Strings,
  AB · Wobble Bass).

**Checked**: the 144 presets kept unchanged are sample-identical with beta 0.4; the 6 adjusted ones differ only in the
values OktoPierre changed; every kept preset has exactly the values of his file. The plug-in matches the web engine on
all 150 presets.

**Left out** (103, beta 0.4 order): A · Square Mod 2; A · Haar Bass; A · Edge Pluck; B · Soft Flute; A · Infra Sub Bass; A · Fuzz Bass; A · Sparse Keys; A · Square Mod; A · Deep Saw Bass; A · Wave Morph Bass; A · Acid Line; A · Fat Unison Bass; A · Sub Saw Bass; B · Sub Organ Bass; A · Deep Sub Pluck; AB · Sub Hybrid Bass; B · Pluck Bass; A · Rubber Bass; A · Octave Bass; A · Screaming Lead; AB · Duo Lead; A · Wave Window Lead; B · Chip Walsh; B · Chip Echo; AB · Chip Hybrid; A · Pulse Lead; A · Dyno Keys; AB · Wurli Bark; AB · Gospel Mix Organ; A · Cathedral Saw; A · Dark Pad; A · Solo Violin; AB · Hybrid Strings; AB · Space Strings; A · Chamber Strings; A · Synth Brass; A · Brass Stab; AB · Breathy Flute; B · Impulse Pluck; AB · Shimmer Pluck; B · Koto; B · Walsh Bells; A · Wave Laser; B · Wave Random Computer; B · Wave Reverse Bands; A · Wave Glitch Morph; A · Scanning Edge; A · Haar Bass Shift; A · Edge Pluck Shift; A · Soft Flute Shift; A · Infra Sub Bass Shift; A · Dub Echo Lead Shift; A · Fuzz Bass Shift; A · Sparse Keys Shift; A · Screaming Lead Shift; A · Wave Attack Lead Shift; A · Dyno Keys Shift; A · Theatre Organ Shift; A · Deep Saw Bass Shift; A · Wave Morph Bass Shift; A · Duo Lead Shift; A · Wurli Bark Shift; A · Gospel Mix Organ Shift; A · Silk Strings Shift; A · Spiccato Strings Shift; A · Wave Brass Shift; A · Fat Unison Bass Shift; A · Wave S/H Lead Shift; A · Sweep Pad Shift; A · Phase Pair Bass 0°; A · Phase Pair Bass 67°; A · Shifted Reese; A · Haar Grit Bass; A · Rubber Phase Bass; A · Phase Sub Pluck; A · S&H Phase Bass; A · Phase Pair Lead 0°; A · Phase Pair Lead 2°; A · Phase Scream; A · Shift Lead; A · Phase Sync Lead; A · Morph Phase Lead; A · Chip Phase; A · Phase E-Piano; A · Shifted Clav; A · Phase Bell Keys; A · Glass Phase Keys; A · Tine Shift; A · Lo-Fi Phase Keys; A · Phase Organ; A · Rotary Phase Organ; A · Reed Phase Organ; A · Phase Choir; A · Phase Is The Sound; A · Shifted Cellos; A · Phase Viola; A · Phase Brass; A · Phase Pluck; A · Shift Harp; A · Phase Bells; A · Phase Mallet; A · Phase Hat; A · Phase Snare.

## beta 0.4 — 2026-10-17 (Source Phase)

**In short**
- **SOURCE PHASE** (engine A, new knob PHASE right of the SOURCE CYCLE display): the source wave is moved inside the cycle
  before the wavelet transform. The transform is shift-variant — band *b* only commutes with shifts by multiples of
  2^(12−b) samples — so the scale filter, the sparsity and the position window meet other atoms and the timbre changes:
  strongly with Haar and Daubechies 2/4, weakly with Daubechies 20. A Fourier filter cannot do this. It is the “source
  phase” control announced as future work in the author’s paper.
- **LFO 2 can move it** (TARGET PHASE, the last of the menu): the tables are then also built at 11 more phases, 30° apart,
  and each voice crossfades between the two nearest — a scan through the timbres of the cycle.
- **100 new presets** in a new last section, **Source Phase**: 50 phased versions of OktoPierre’s 15 favourites and 35 best
  voted sounds (“… Shift”; the 14 engine B and A+B ones rebuilt on engine A), 50 new sounds of every type, two pairs to
  compare (“A · Phase Pair Bass 0°” / “… 67°”, “A · Phase Pair Lead 0°” / “… 2°”: even 13 samples change it) and “A · Phase Is The Sound”, which
  is silent at 0°. They use the whole instrument (unison, chorus, delay, reverb, sub oscillator, glide, LFOs, WAVELET MORPH);
  23 of them move the phase with LFO 2. 253 factory presets in all.
- **Nothing older changes**: at PHASE 0 (the default) the source is the beta 0.3 one bit for bit; the 153 older presets were
  rendered with the beta 0.3 and beta 0.4 engines and are sample-identical; states, Live Sets, user presets and the presets
  file saved before beta 0.4 get PHASE 0. The older presets keep their place and number (the new section is last).

**From the testers’ reports** (the same beta 0.4, rebuilt)
- **Fixed: a note that never stopped.** A key held while a preset with another VOICES setting was loaded (mono ↔ poly) was
  then released on the wrong voice, and kept sounding until the plug-in was removed and reloaded. A note off now releases
  that note whatever VOICES is (plug-in and web app); the mono list of held keys forgets released keys; mono legato plays
  as before.
- **IMPORT…** in the preset browser (in place of FILE; “Show the presets file” is in the right-click menu, with the new
  “Import presets (.txt), replacing yours…”): an EXPORT copy or someone’s `OKTOWAVE presets.txt` replaces your adjusted and
  deleted presets, list order and user bank, after a question. Your previous file is kept next to it as
  `OKTOWAVE presets (backup <date> <time>).txt`; a file without presets is refused and nothing changes.
- **A wide scroll bar** for the long lists of the preset browser (12 px instead of a 3 px line): drag it or click the bar,
  easy with a trackpad, no mouse wheel needed. The web app’s list has the same wider bar.

**Measured** (`tools/phase_effect.js`: the preset’s cycle at middle C at phase 0 and at its phase, harmonics 1–64 within 50 dB
of the strongest): every phased preset changes some harmonic by 6 dB or more (lowest 6.1 dB, median 22.6 dB) and the loud
harmonics — within 20 dB of the strongest — by 4 dB or more (lowest 4.4 dB, median 17.8 dB). Loudness matched to the
favourites (loudest 200 ms of a held C major chord, median −13.8 dB; drums over 50 ms, 3 dB lower); a few resonant sounds stay
up to 5 dB quieter so that their peaks stay under 0 dBFS, the hat sits at −31 dB like the factory Closed Hat.

**The 100 presets of the Source Phase section** (name, phase, largest harmonic change against 0° / the same among the loud harmonics, ~ = LFO 2 also moves the phase):

*From the 15 favourites and the 35 best voted* (★ engine B / A+B sounds rebuilt on engine A): A · Square Mod 2 Shift 194° 25/25 dB; A · Wavelet Lead Shift 199° 12/7 dB ~; A · Haar Bass Shift 19° 17/17 dB; A · Edge Pluck Shift 92° 72/13 dB; A · Focus Sweep Shift 11° 66/56 dB ~ ★; A · Soft Flute Shift 44° 8/8 dB ★; A · Infra Sub Bass Shift 73° 8/6 dB; A · Dub Echo Lead Shift 298° 19/9 dB; A · Fuzz Bass Shift 165° 17/17 dB; A · Laser Sweep Shift 56° 34/34 dB ~; A · Warm Pad Shift 275° 29/8 dB ~; A · Mirror Sub Bass Shift 81° 38/5 dB ★; A · Sparse Keys Shift 275° 7/7 dB; A · Space Choir Shift 300° 31/25 dB ~ ★; A · Square Mod Shift 67° 29/29 dB; A · Wave Robot Shift 354° 52/52 dB ~; A · Screaming Lead Shift 87° 15/14 dB; A · Wave Attack Lead Shift 253° 10/10 dB; A · Wave Pulse Lead Shift 36° 35/34 dB; A · Dyno Keys Shift 348° 24/19 dB; A · Theatre Organ Shift 151° 19/19 dB ★; A · Noise Wash Pad Shift 185° 25/25 dB; A · Solo Violin Shift 11° 19/19 dB; A · Siren Sweep Shift 104° 20/19 dB; A · Wave Riser Shift 286° 22/22 dB; A · Wave Laser Shift 191° 10/6 dB; A · Deep Saw Bass Shift 19° 16/16 dB; A · Wave Morph Bass Shift 230° 19/10 dB; A · Duo Lead Shift 30° 29/12 dB ★; A · Flute Lead Shift 329° 9/6 dB ★; A · Wave Window Lead Shift 160° 43/26 dB; A · Wurli Bark Shift 28° 19/18 dB ★; A · Gospel Mix Organ Shift 143° 75/7 dB ★; A · Choir Pad Shift 11° 23/23 dB ~ ★; A · Glass Choir Shift 106° 21/21 dB ★; A · Cello Section Shift 143° 19/9 dB; A · Silk Strings Shift 143° 29/12 dB ★; A · Spiccato Strings Shift 185° 23/6 dB; A · Shimmering Strings Shift 320° 20/4 dB; A · Wave Brass Shift 134° 7/7 dB; A · Acid Line Shift 340° 26/25 dB ~; A · Fat Unison Bass Shift 44° 32/32 dB; A · Wave Wobble Bass Shift 134° 8/8 dB; A · Wave S/H Lead Shift 101° 6/6 dB; A · Full Drawbar Organ Shift 56° 13/13 dB ★; A · Sweep Pad Shift 95° 14/14 dB ~; A · Analog Brass Pad Shift 126° 14/14 dB; A · Wave Morph Pad Shift 64° 29/23 dB; A · Wave Atom Choir Shift 289° 26/26 dB ★; A · Ensemble Strings Shift 320° 20/4 dB.

*New sounds*: A · Phase Pair Bass 0° (0°, reference); A · Phase Pair Bass 67° 32/32 dB; A · Shifted Reese 11° 22/22 dB ~; A · Phase Wobble Bass 149° 19/19 dB ~; A · Haar Grit Bass 30° 18/18 dB; A · Rubber Phase Bass 331° 15/15 dB; A · Phase Sub Pluck 64° 92/62 dB; A · S&H Phase Bass 157° 18/18 dB ~; A · Phase Pair Lead 0° (0°, reference); A · Phase Pair Lead 2° 9/9 dB; A · Phase Scream 168° 99/69 dB ~; A · Shift Lead 50° 26/26 dB; A · Phase Sync Lead 168° 26/26 dB ~; A · Morph Phase Lead 101° 7/6 dB; A · Window Phase Lead 241° 42/42 dB; A · Chip Phase 67° 93/63 dB ~; A · Phase E-Piano 163° 21/21 dB; A · Shifted Clav 50° 19/19 dB; A · Phase Bell Keys 120° 102/72 dB; A · Glass Phase Keys 28° 28/28 dB; A · Tine Shift 53° 18/15 dB; A · Lo-Fi Phase Keys 157° 57/57 dB ~; A · Phase Organ 64° 23/23 dB; A · Rotary Phase Organ 165° 18/9 dB ~; A · Pipe Phase 36° 81/11 dB; A · Reed Phase Organ 154° 23/5 dB; A · Phase Drift Pad 275° 17/17 dB ~; A · Dawn Phase 281° 22/6 dB; A · Shifted Strings Pad 143° 29/12 dB; A · Phase Choir 177° 70/70 dB ~; A · Noise Phase Pad 53° 30/29 dB; A · Phase Glass Pad 42° 15/15 dB; A · Dark Phase Pad 165° 7/5 dB ~; A · Phase Is The Sound 177° 66/66 dB; A · Phase Ensemble 230° 24/8 dB; A · Shifted Cellos 185° 23/6 dB; A · Phase Tremolo Strings 143° 29/12 dB ~; A · Phase Viola 5° 16/14 dB; A · Phase Brass 168° 17/17 dB; A · Shifted Horns 104° 30/30 dB; A · Phase Stab 78° 26/26 dB; A · Phase Clarinet 36° 10/7 dB; A · Phase Pluck 157° 20/20 dB; A · Shift Harp 14° 19/15 dB; A · Phase Bells 44° 98/68 dB; A · Phase Mallet 84° 13/10 dB; A · Phase Scanner 157° 86/68 dB ~; A · Phase Glitch 64° 93/63 dB ~; A · Phase Hat 123° 32/32 dB; A · Phase Snare 14° 23/23 dB.

**Engine** (web and plug-in, bit parity kept): `sourceCycle(wave, width, phase)`; the phase sets of LFO 2 → PHASE (`PHASE_K = 12`,
`phaseModNeeded`, `renderTable`); the C++ engine matches the web engine on all 253 presets and 14 LFO 2 / phase variants
(worst 3.35e-7, on A · Space Choir Shift, whose long reverb gathers float rounding; 2.38e-7 elsewhere). Cost of LFO 2 → PHASE
(measured): 12 table sets per engine-A sound, 12.4 MB instead of 1.0 (24.8 MB with WAVELET MORPH); a table build of 38 ms in
the plug-in and 77 ms in the web app instead of 3 and 8 ms (68 / 159 ms with the morph); about 1.5 times the voice CPU.
Nothing of this when LFO 2 does not move the phase.

**Acknowledgments**
- Thanks to Jeremi Palmigani (aka Saoul Machine) and Flo (aka Go Tiger) for testing the synth and providing valuable
  feedback and improvement suggestions.
- Thanks to Arnaud Grignard for the technical review of the concept.

## beta 0.3 for macOS — 2026-10-17

**The first Mac version**: the beta 0.3 plug-in as a **VST3 for macOS 10.13 or later**, one universal binary for **Apple
silicon and Intel** Macs (Ableton Live, Cubase, Bitwig Studio, Reaper, Studio One…; not Logic Pro or GarageBand, which load
only Audio Units). Same sound, panel, 153 presets, preset browser, SAVE PRESET / DELETE / user bank and
`OKTOWAVE presets.txt` file as the Windows beta 0.3, which is not changed (its release stays as tested).
- **Install**: copy `WaveletSynthesizer.vst3` into `~/Library/Audio/Plug-Ins/VST3` (your own folder: the presets file is
  written next to it). The plug-in is signed "ad hoc" (no paid Apple developer certificate): macOS blocks it once; one
  Terminal line or *Privacy & Security → Open Anyway* allows it (`INSTALL-mac.txt` in the zip).
- **On a Mac**: Cmd-click (or double-click) resets a knob, Shift-drag adjusts finely, Control-click (or right-click) on the
  preset name opens the preset menu; the window sizes (70–150 %) are in points, so the panel is sharp on Retina screens.
- **Code**: the editor is now shared by both systems — `editor.cpp` draws the panel through `editor_platform.h`;
  `editor_win.cpp` keeps the Windows window (GDI+) unchanged, `editor_mac.mm` draws it with Core Graphics and Core Text.
  `platform.h` holds the file and folder calls of both systems. The Windows plug-in built from this code passes the same
  tests as the released one (VST3 host 254/254, presets library 37/37, VST2 38/0; its editor screenshots are identical).
- **Tests**: GitHub's Macs build the plug-in on every push (`.github/workflows/mac.yml`), check that its sound equals the
  web engine's on both architectures (153 presets + 9 LFO 2 variants, worst difference 2.38e-7, as on Windows) and run
  `tests/machost`, a small macOS host: notes, states, the editor's screenshots, mouse (browser, engine tab, knobs, HIDE),
  the menus, and SAVE PRESET / TO BANK / DELETE with their windows answered.

## beta 0.3 — 2026-10-17

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

**Web app** (update of 2026-10-17): the same **preset browser** as the plug-in at the right of the panel — TOP Sounds and
the sound types, ★ favourites and votes, FACTORY / USER PRESETS tabs, HIDE — to select sounds only (saving stays in the
status bar). The panel itself keeps its 1100 × 720 layout; "#nobrowser" in the address leaves the browser out.

**Plug-in**: version 0.3.0 everywhere (VST3 class info and DLL version info agree).

**How to cite**: the code has a DOI on Zenodo, https://doi.org/10.5281/zenodo.23431760 (record
https://zenodo.org/records/23431760): README "How to cite", `CITATION.cff` (GitHub's "Cite this repository") and the
manuals' "About" section.

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
