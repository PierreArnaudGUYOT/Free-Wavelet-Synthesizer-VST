// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The TOP Sounds that come from the Wavelet Synthesizer, as its manuals described them: [effects load, text] (the manuals of Okto MultiWave Synth list those that are in the final list).
'use strict';
module.exports = {
  "A · Noise Wash Pad": ["extreme", "Resonant band-passed noise thinned to 24 % sparsity, drifting with a slow ±1.3-band filter LFO and a ±22-cent pitch wobble in a huge reverb; OktoPierre shortened the attack to 23 ms so it speaks at once."],
  "A · Siren Sweep": ["medium", "Resonant band-pass swept up and down by a triangle LFO; OktoPierre added ±18 cents of pitch movement, a held filter envelope, a strong sine sub (82 %) and a touch of delay."],
  "A · Wavelet Lead": ["medium", "Mono legato lead with 60 ms glide: a resonant Daubechies 8 low-pass that the mod envelope opens by 4 bands on every attack, two detuned unison copies, 5.5 Hz vibrato, delay and reverb."],
  "A · Wave Brass": ["medium", "Brass whose attack morphs the wavelet and opens the filter together; OktoPierre added a slow 0.6 Hz LFO (±7 cents, ±1.6 bands), a brighter cutoff (3.3) and 25 % delay."],
  "A · Wave Riser": ["medium", "Noise through a band-pass, a saw LFO on the WAVELET MORPH and the cutoff, in a big reverb; two unison copies (OktoPierre)."],
  "A · Warm Pad": ["medium", "Warm, wide pad: a Coiflet 3 sawtooth breathing through a slow ±0.8-band LFO filter movement, three detuned copies spread wide, reverb and soft echoes."],
  "A · Wave Attack Lead": ["medium", "Each note starts on Haar and slides to Daubechies 20, the filter follows."],
  "A · Dub Echo Lead": ["heavy", "Resonant PULSE lead drowned in long ping-pong echoes (375 ms, 72 % feedback, 55 % mix): dub-style repeats that keep bouncing."],
  "A · Wave Pulse Lead": ["light", "Lead that starts smooth (Coiflet 3) and turns to Haar as the envelope falls; OktoPierre’s slow 1.3 Hz LFO adds a ±1.3-band filter and a ±33° window movement; three octaves down with four unison copies."],
  "A · Cello Section": ["medium", "One octave down, vibrato, slight unison."],
  "AB · Silk Strings": ["medium", "A 70 · B 30: Saw (A) + mirror atoms (B), slow attack, deep chorus."],
  "A · Spiccato Strings": ["light", "Short bowed notes for fast lines."],
  "A · Shimmering Strings": ["medium", "Strings with chorus and reverb; OktoPierre slowed the LFO to 2.1 Hz and added ±7 cents of vibrato to the cutoff shimmer."],
  "A · Wave Robot": ["medium", "Sample and hold on the morph and a band-pass cutoff together, a talking robot."],
  "A · Laser Sweep": ["extreme", "Sci-fi zaps: a very resonant (20 dB), steep Daubechies 2 filter swept ±4 bands by a slow saw LFO (0.37 Hz, OktoPierre’s setting) that also moves a narrow position window, a sub oscillator at 26 %, drive and fast echoes."],
  "B · Theatre Organ": ["medium", "Mirror atoms, deep vibrato, chorus and hall."],
  "B · Space Choir": ["heavy", "Huge choir-like pad: odd-harmonic MIRROR bands opening over seconds (SPREAD +100 %), four detuned copies, a slowly moving focus window and a vast reverb."],
  "B · Focus Sweep": ["medium", "A Haar staircase whose detail lives only inside a 30 % window that a 0.5 Hz LFO sweeps around the cycle; two unison copies, delay and reverb."],
  "B · Flute Lead": ["light", "Breathy flute: almost only the fundamental band, soft attack, vibrato."],
  "B · Choir Pad": ["heavy", "Vowel-like drawbars on mirror atoms with unison and slow vibrato, chorus and a large reverb — edited by OktoPierre with an immediate attack and a very short release, so it speaks like a choir organ."],
  "AB · Glass Choir": ["heavy", "A 40 · B 60: Edited by OktoPierre: a sine (A) with random atoms (B: Daubechies 2, seed 61, tilt −8 dB/band, bands 10–11 off) through a steep low-pass at band 10.6, a fast attack and a 106 ms release — a glassy choir with chorus and a big hall."],
};
