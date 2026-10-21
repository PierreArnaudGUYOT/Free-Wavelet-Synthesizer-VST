// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The building blocks of the SuperModulation / beta 0.2 presets (tools/supermod/compose.js): oscillator "layers". A layer is one
// oscillator's sound in the language of tools/preset_dsl.js (wave, wavelet, filter, window, own envelope ...), with what the composer
// needs to put two of them together: its mode (A subtractive / B additive), its role (body: the sustained sound; color: a second
// sustained sound of another character; attack: a percussive transient with its own envelope; sub: the low support; air: noise or
// shimmer), a family, a brightness (1 dark .. 5 bright), the words it lends to the preset's name and its description.
//   make(r) returns the oscillator's values; r is the seeded generator (tools/supermod/rng.js).
'use strict';

const W_ROUGH = ['haar', 'db2'], W_MID = ['db4', 'coif3', 'sym8'], W_CLEAN = ['db8', 'db20'];
const wclass = (w) => (W_ROUGH.includes(w) ? 'rough' : W_MID.includes(w) ? 'mid' : 'clean');

// drawbar sets of the additive layers (the eleven bands, 1 = the fundamental)
const BARS = {
  organ: [1, 0.8, 0.9, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0, 0],
  flute: [1, 0.3, 0.15, 0.05],
  hollow: [1, 0, 0.7, 0, 0.5, 0, 0.35, 0, 0.2, 0, 0.1],
  choir: [1, 0.6, 0.8, 0.5, 0.3, 0.2, 0.1],
  bell: [0.2, 0.5, 0.9, 1, 0.8, 0.6, 0.4, 0.3, 0.15],
  shimmer: [0, 0, 0.2, 0.4, 0.7, 1, 1, 0.8, 0.5],
  stepped: [1, 0.7, 0.5, 0.4, 0.3, 0.2, 0.1],
  pluck: [1, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2],
  bass: [1, 0.8, 0.7, 0.5, 0.25, 0.1],
  brass: [1, 0.9, 1, 0.8, 0.7, 0.55, 0.4, 0.3, 0.2, 0.1],
  mallet: [0.3, 1, 0.5, 0.3, 0.2, 0.1],
  clang: [0, 0.3, 0.7, 1, 1, 0.9, 0.7, 0.5, 0.3],
  air: [0, 0, 0, 0.1, 0.3, 0.6, 0.9, 1, 0.8],
  full: [1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
};
const jit = (r, bars, amt) => bars.map((b, i) => Math.max(0, Math.min(1, b + (b > 0 ? r.f(-amt, amt) : 0))));

const A = [
  // ---- bodies: the sustained sound
  { id: 'warmsaw', role: 'body', fam: 'saw', bright: 2, words: ['Amber', 'Velvet', 'Cedar', 'Honey'], desc: 'a warm saw',
    make: (r) => ({ wave: 'saw', wavelet: r.pick(['db8', 'sym8', 'db20']), fcut: r.f(4.4, 7.2), fres: r.f(0, 3), fenv: r.p(0.4) ? r.f(0.8, 2.8) : 0 }) },
  { id: 'hollowsq', role: 'body', fam: 'square', bright: 2, words: ['Hollow', 'Reed', 'Cavern', 'Woodwind'], desc: 'a hollow square',
    make: (r) => ({ wave: 'square', wavelet: r.pick(['db4', 'db8', 'sym8']), fcut: r.f(4, 6.4), fres: r.f(1, 5) }) },
  { id: 'reedpulse', role: 'body', fam: 'pulse', bright: 3, words: ['Nasal', 'Reed', 'Oboe', 'Taper'], desc: 'a nasal pulse',
    make: (r) => ({ wave: 'pulse', width: r.f(0.12, 0.4), wavelet: r.pick(['db4', 'sym8', 'coif3']), fcut: r.f(5, 8), fres: r.f(2, 6) }) },
  { id: 'softtri', role: 'body', fam: 'tri', bright: 1, words: ['Soft', 'Flute', 'Moss', 'Milk'], desc: 'a soft triangle',
    make: (r) => ({ wave: 'tri', width: r.f(0.35, 0.65), wavelet: r.pick(['db20', 'db8']), fcut: r.f(6, 9) }) },
  { id: 'sinepure', role: 'body', fam: 'sine', bright: 1, words: ['Pure', 'Pearl', 'Moon', 'Opal'], desc: 'a pure sine',
    make: (r) => ({ wave: 'sine', wavelet: r.pick(['db20', 'sym8']), fcut: 12 }) },
  { id: 'sparsesaw', role: 'body', fam: 'sparse', bright: 1, words: ['Faint', 'Thread', 'Ghost', 'Silk'], desc: 'a saw thinned to a few atoms',
    make: (r) => ({ wave: 'saw', wavelet: r.pick(['db8', 'db4', 'sym8']), sparsity: r.f(0.5, 0.78), fcut: 12 }) },
  { id: 'buzzsaw', role: 'color', fam: 'buzz', bright: 4, words: ['Hornet', 'Static', 'Brass', 'Wasp'], desc: 'a buzzing band-passed saw',
    make: (r) => ({ wave: 'saw', wavelet: 'db2', sparsity: r.f(0.05, 0.25), ftype: 'bp', fcut: r.f(5.5, 8), fres: r.f(3, 7) }) },
  { id: 'gritsaw', role: 'color', fam: 'grit', bright: 4, words: ['Slate', 'Gravel', 'Chrome', 'Pixel'], desc: 'a gritty Haar saw',
    make: (r) => ({ wave: 'saw', wavelet: 'haar', sparsity: r.f(0.25, 0.6), fcut: r.f(7, 10), fres: r.f(0, 3) }) },
  { id: 'glassqs', role: 'color', fam: 'glass', bright: 5, words: ['Glass', 'Quartz', 'Crystal', 'Ice'], desc: 'a glassy square',
    make: (r) => ({ wave: 'square', wavelet: r.pick(['coif3', 'db2']), fcut: r.f(7.5, 10), fres: r.f(2, 5) }) },
  { id: 'pulsar', role: 'color', fam: 'pulsar', bright: 3, words: ['Pulsar', 'Beam', 'Lantern', 'Orbit'], desc: 'a saw whose filter works in one part of the cycle',
    make: (r) => ({ wave: 'saw', wavelet: r.pick(['sym8', 'coif3', 'db4']), pdep: r.f(0.65, 1), pwid: r.f(0.18, 0.4), pcen: r.f(0, 1), fcut: r.f(3.5, 5.5), fres: r.f(2, 6) }) },
  { id: 'phasesaw', role: 'color', fam: 'phase', bright: 3, words: ['Shifted', 'Prism', 'Mirage', 'Drift'], desc: 'a Haar saw read from the middle of its cycle',
    make: (r) => ({ wave: 'saw', wavelet: r.pick(['haar', 'db2']), phase: r.f(0.08, 0.92), fcut: r.f(4.5, 7.5), fres: r.f(0, 3) }) },
  { id: 'phasepulse', role: 'color', fam: 'phase', bright: 3, words: ['Pinch', 'Weave', 'Kite', 'Fold'], desc: 'a narrow pulse shifted inside its cycle',
    make: (r) => ({ wave: 'pulse', width: r.f(0.15, 0.35), wavelet: r.pick(['haar', 'db2', 'db4']), phase: r.f(0.1, 0.9), fcut: r.f(5, 8), fres: r.f(1, 4) }) },
  { id: 'trigrit', role: 'color', fam: 'grit', bright: 3, words: ['Fold', 'Origami', 'Chalk', 'Flint'], desc: 'a jagged Haar triangle',
    make: (r) => ({ wave: 'tri', width: r.f(0.15, 0.85), wavelet: 'haar', sparsity: r.f(0.1, 0.45), fcut: r.f(6, 9), fres: r.f(0, 3) }) },
  { id: 'noisewash', role: 'air', fam: 'noise', bright: 4, words: ['Breath', 'Mist', 'Salt', 'Dust'], desc: 'a veil of band-passed noise',
    make: (r) => ({ wave: 'noise', wavelet: r.pick(['db4', 'db8']), ftype: 'bp', fcut: r.f(6, 9), fres: r.f(2, 6) }) },
  // ---- attacks: a transient with its own envelope
  { id: 'ticknoise', role: 'attack', fam: 'tick', bright: 5, words: ['Tick', 'Click', 'Snap', 'Spark'], desc: 'a tick of noise',
    make: (r) => ({ wave: 'noise', wavelet: r.pick(['db4', 'haar']), ftype: r.pick(['hp', 'bp']), fcut: r.f(6, 9), fres: r.f(0, 4), env: [0.001, r.f(0.02, 0.07), 0, r.f(0.03, 0.1)] }) },
  { id: 'pinghaar', role: 'attack', fam: 'ping', bright: 5, words: ['Ping', 'Bright', 'Sparkle', 'Needle'], desc: 'a bright Haar ping',
    make: (r) => ({ wave: 'saw', wavelet: 'haar', fcut: r.f(8, 11), fres: r.f(0, 3), env: [0.001, r.f(0.08, 0.22), 0, r.f(0.1, 0.25)] }) },
  { id: 'zapsine', role: 'attack', fam: 'zap', bright: 2, words: ['Zap', 'Drop', 'Dive', 'Plink'], desc: 'a sine that dives in pitch',
    make: (r) => ({ wave: 'sine', wavelet: 'db20', fcut: 12, penv: [r.f(12, 34), r.f(0.03, 0.12)], env: [0.001, r.f(0.1, 0.3), 0, r.f(0.08, 0.2)] }) },
  { id: 'thumptri', role: 'attack', fam: 'thump', bright: 1, words: ['Thump', 'Knock', 'Heart', 'Drum'], desc: 'a soft thump',
    make: (r) => ({ wave: r.pick(['tri', 'sine']), width: 0.5, wavelet: 'db20', fcut: 12, penv: [r.f(6, 18), r.f(0.04, 0.1)], env: [0.001, r.f(0.12, 0.3), 0, r.f(0.08, 0.2)] }) },
  { id: 'knockpulse', role: 'attack', fam: 'knock', bright: 3, words: ['Wood', 'Knock', 'Tap', 'Marimba'], desc: 'a woody knock',
    make: (r) => ({ wave: 'pulse', width: r.f(0.1, 0.25), wavelet: r.pick(['db2', 'haar']), ftype: 'bp', fcut: r.f(5, 7.5), fres: r.f(3, 8), env: [0.001, r.f(0.05, 0.14), 0, r.f(0.06, 0.15)] }) },
  { id: 'chiff', role: 'attack', fam: 'chiff', bright: 3, words: ['Chiff', 'Breath', 'Wind', 'Pipe'], desc: 'a breath chiff',
    make: (r) => ({ wave: 'noise', wavelet: 'db8', ftype: 'bp', fcut: r.f(7, 8.8), fres: r.f(2, 5), env: [0.01, r.f(0.08, 0.16), 0, r.f(0.08, 0.16)] }) },
  { id: 'pluckcoif', role: 'attack', fam: 'pluckA', bright: 4, words: ['Pluck', 'Harp', 'Lute', 'Thorn'], desc: 'a quick filtered pluck',
    make: (r) => ({ wave: 'saw', wavelet: r.pick(['coif3', 'db4']), fcut: r.f(3, 5), fenv: r.f(3.5, 6.5), fres: r.f(1, 4), env: [0.001, r.f(0.18, 0.5), r.f(0, 0.1), r.f(0.1, 0.3)] }) },
  // ---- the low support
  { id: 'subsine', role: 'sub', fam: 'sub', bright: 1, words: ['Deep', 'Basalt', 'Abyss', 'Root'], desc: 'a sine sub',
    make: (r) => ({ wave: 'sine', wavelet: 'db20', fcut: 12 }) },
  { id: 'subtri', role: 'sub', fam: 'sub', bright: 1, words: ['Deep', 'Cellar', 'Keel', 'Lowland'], desc: 'a round triangle sub',
    make: (r) => ({ wave: 'tri', width: 0.5, wavelet: 'db20', fcut: r.f(5, 8) }) },
  { id: 'subsq', role: 'sub', fam: 'sub', bright: 2, words: ['Round', 'Cellar', 'Stone', 'Anvil'], desc: 'a rounded square sub',
    make: (r) => ({ wave: 'square', wavelet: 'db20', fcut: r.f(3.2, 4.4), fres: r.f(0, 2) }) },
];

const B = [
  { id: 'organ', role: 'body', fam: 'organ', bright: 3, words: ['Pipe', 'Drawbar', 'Choir', 'Gallery'], desc: 'wavelet drawbars like an organ',
    make: (r) => ({ pattern: r.pick(['ramp', 'alt']), wavelet: r.pick(['db20', 'db8']), tilt: r.f(-8, -3), bars: jit(r, r.pick([BARS.organ, BARS.full]), 0.15), atk: r.f(0.005, 0.03), sus: 1, body: 20, bright: 20 }) },
  { id: 'choir', role: 'body', fam: 'choir', bright: 2, words: ['Choir', 'Voices', 'Chorale', 'Nave'], desc: 'mirrored atoms that sing like a choir',
    make: (r) => ({ pattern: 'mirror', wavelet: r.pick(['db20', 'sym8']), tilt: r.f(-6, -3), bars: jit(r, BARS.choir, 0.15), atk: r.f(0.3, 1.1), spread: r.f(0.2, 0.6), sus: 1 }) },
  { id: 'hollowbars', role: 'body', fam: 'hollow', bright: 2, words: ['Hollow', 'Clarinet', 'Cave', 'Odd'], desc: 'only the odd scales, hollow as a clarinet',
    make: (r) => ({ pattern: r.pick(['ramp', 'mirror']), wavelet: r.pick(['db8', 'db20', 'sym8']), tilt: r.f(-6, -2), bars: jit(r, BARS.hollow, 0.12), atk: r.f(0.01, 0.08), sus: 1 }) },
  { id: 'bellbar', role: 'attack', fam: 'bell', bright: 4, words: ['Bell', 'Chime', 'Gong', 'Temple'], desc: 'a ringing bell of single atoms',
    make: (r) => ({ pattern: 'impulse', wavelet: r.pick(['db8', 'sym8', 'db20']), tilt: r.f(-4, 0), bars: jit(r, BARS.bell, 0.1), atk: 0.002, body: r.f(1.5, 5), bright: r.f(0.3, 1.2), sus: 0,
      env: [0.001, r.f(1.5, 4), 0, r.f(0.5, 1.5)] }) },
  { id: 'glassrand', role: 'color', fam: 'glassB', bright: 5, words: ['Shard', 'Glint', 'Prism', 'Crystal'], desc: 'random atoms that glitter',
    make: (r) => ({ pattern: 'random', seed: r.i(0, 99), wavelet: r.pick(['db8', 'sym8', 'coif3']), tilt: r.f(-5, -1), bars: jit(r, BARS.shimmer, 0.15), atk: r.f(0.01, 0.25), sus: r.f(0.5, 1), body: 20, bright: 20 }) },
  { id: 'walsh', role: 'color', fam: 'walsh', bright: 3, words: ['Step', 'Stair', 'Grid', 'Mosaic'], desc: 'stepped Walsh atoms',
    make: (r) => ({ pattern: 'walsh', wavelet: r.pick(['db4', 'db8', 'haar']), tilt: r.f(-7, -3), bars: jit(r, BARS.stepped, 0.15), atk: r.f(0.005, 0.1), sus: r.f(0.6, 1) }) },
  { id: 'pluckscale', role: 'attack', fam: 'pluckB', bright: 4, words: ['Pluck', 'Pick', 'Strum', 'Wire'], desc: 'scales that die from the top, like a pluck',
    make: (r) => ({ pattern: r.pick(['ramp', 'alt']), wavelet: r.pick(['db20', 'db4']), tilt: r.f(-5, -1), bars: jit(r, BARS.pluck, 0.1), atk: 0.002, body: r.f(0.4, 1.4), bright: r.f(0.08, 0.3), sus: 0 }) },
  { id: 'airpad', role: 'air', fam: 'airB', bright: 4, words: ['Air', 'Halo', 'Haze', 'Veil'], desc: 'a halo of high random atoms',
    make: (r) => ({ pattern: 'random', seed: r.i(0, 99), wavelet: r.pick(['db8', 'db20']), tilt: r.f(-3, 0), bars: jit(r, BARS.air, 0.1), atk: r.f(0.5, 1.4), sus: r.f(0.6, 0.9), body: 20, bright: 20 }) },
  { id: 'bassmirror', role: 'body', fam: 'bassB', bright: 1, words: ['Low', 'Bedrock', 'Timber', 'Cello'], desc: 'low mirrored atoms',
    make: (r) => ({ pattern: 'mirror', wavelet: 'db20', tilt: r.f(-5, -2), bars: jit(r, BARS.bass, 0.1), atk: r.f(0.004, 0.03), sus: 1 }) },
  { id: 'brassramp', role: 'body', fam: 'brassB', bright: 4, words: ['Horn', 'Brass', 'Trumpet', 'Fanfare'], desc: 'ramp atoms that open like a horn',
    make: (r) => ({ pattern: 'ramp', wavelet: r.pick(['db4', 'sym8']), tilt: r.f(-5, -2), bars: jit(r, BARS.brass, 0.1), atk: r.f(0.03, 0.1), spread: r.f(0.3, 0.8), sus: 1 }) },
  { id: 'mallet', role: 'attack', fam: 'malletB', bright: 3, words: ['Mallet', 'Marimba', 'Vibes', 'Kalimba'], desc: 'alternating atoms struck like a mallet',
    make: (r) => ({ pattern: 'alt', wavelet: r.pick(['db8', 'db20']), tilt: r.f(-6, -2), bars: jit(r, BARS.mallet, 0.1), atk: 0.002, body: r.f(0.6, 1.6), bright: r.f(0.1, 0.35), sus: 0,
      env: [0.001, r.f(0.5, 1.4), 0, r.f(0.2, 0.6)] }) },
  { id: 'clang', role: 'color', fam: 'clangB', bright: 5, words: ['Clang', 'Anvil', 'Scrap', 'Rust'], desc: 'rough random atoms that clang and fade',
    make: (r) => ({ pattern: 'random', seed: r.i(0, 99), wavelet: r.pick(['db2', 'haar', 'db4']), tilt: r.f(-3, 1), bars: jit(r, BARS.clang, 0.1), atk: 0.002, body: r.f(0.6, 1.6), bright: r.f(0.1, 0.4), sus: 0,
      env: [0.001, r.f(0.6, 1.6), 0, r.f(0.2, 0.6)] }) },
  { id: 'impulseorg', role: 'body', fam: 'impulseB', bright: 3, words: ['Atom', 'Spark', 'Quanta', 'Fibre'], desc: 'an organ made of single wavelet atoms',
    make: (r) => ({ pattern: 'impulse', wavelet: r.pick(['db20', 'db8', 'sym8']), tilt: r.f(-6, -2), bars: jit(r, BARS.organ, 0.15), atk: r.f(0.005, 0.06), sus: 1 }) },
];

module.exports = { A, B, BARS, wclass, W_ROUGH, W_MID, W_CLEAN };
A.forEach(l => { l.mode = 'A'; });
B.forEach(l => { l.mode = 'B'; });
