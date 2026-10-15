// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Manual A — Engine A · Wavelet Subtractive
'use strict';
const L = require('./lib.js');
const S = require('./shared.js');
const { ctl, kbd, P, controls, table, tip, note, warn, deep, fig, figInline, annotated, C, SPEC } = L;
const E = 'a';

// ---------------------------------------------------------------- computed facts (from core.js)
// Sparsity as implemented by core.js: K = round(nz^(1 - s)), nz = non-zero atoms of the source.
function sparse(wave, wavelet, s, width) {
  const p = C.defaults(); const Q = C.P;
  p[Q.engine] = 0; p[Q.a_wave] = wave; p[Q.wavelet] = wavelet; p[Q.a_sparsity] = s || 0; p[Q.a_width] = width == null ? 0.5 : width;
  const t = C.buildTables(p, false);
  return { K: t.kept, nz: t.nonzero };
}
function sparsityFacts() {
  const waves = [['SAW', 0, 0.5], ['SQUARE', 1, 0.5], ['PULSE 35 %', 2, 0.35], ['TRI', 3, 0.5], ['SINE', 4, 0.5], ['NOISE', 5, 0.5]];
  const head = ['Wave', ...SPEC.WAVELETS.map(w => w.name.replace('Daubechies ', 'DB').replace('Symlet ', 'Sym').replace('Coiflet ', 'Coif'))];
  const rows = waves.map(([n, w, wd]) => [ctl(n), ...SPEC.WAVELETS.map((_, wi) => String(sparse(w, wi, 0, wd).nz))]);
  return table(head, rows, 'compact num');
}
function sparsityExamples() {
  const ss = [0, 0.25, 0.5, 0.75, 0.9, 1];
  const ex = [['SAW + Daubechies 2', 0, 1], ['SAW + Daubechies 8', 0, 3], ['SAW + Daubechies 20', 0, 6], ['NOISE (any wavelet)', 5, 2]];
  return table(['Source', ...ss.map(s => `${Math.round(s * 100)} %`)],
    ex.map(([n, w, wi]) => [n, ...ss.map(s => { const r = sparse(w, wi, s); return `${r.K} / ${r.nz}`; })]), 'compact num');
}
const KEYS_S = (() => { const pr = SPEC.PRESETS.find(p => p.name === 'A · Sparse Keys'); return pr.values[C.P.a_sparsity]; })();
const KEYS = Object.assign(sparse(0, 1, KEYS_S), { pct: Math.round(KEYS_S * 100) });   // A · Sparse Keys (DB2 saw)
const DB8HALF = sparse(0, 3, 0.5);        // screenshot: DB8 saw at 50 %

// ---------------------------------------------------------------- hero
const hero = `<header class="hero">
<p class="eyebrow">WAVELET SYNTHESIZER · USER MANUAL A</p>
<h1><span class="tag">ENGINE A</span>Wavelet Subtractive</h1>
<p class="lead">Engine A is a subtractive synthesizer with a twist. Like a classic analogue-style instrument it starts from a bright waveform — saw, square, pulse, triangle, sine or a noise cycle — and shapes it with a filter, envelopes and an LFO. The twist is the filter: instead of cutting frequencies it cuts <em>scales</em>. Every waveform cycle is broken down by a wavelet transform into 2047 small building blocks, the atoms, arranged in 11 octave bands. The SCALE FILTER turns those bands up and down, SPARSITY throws away all but the most important atoms, and the POSITION window can confine the filter to one part of the cycle — only the falling edge of a square, say — leaving the rest untouched. The WAVELET you choose sets the shape of the atoms and therefore the character of every sweep: blocky and digital with Haar, smooth and analogue-like with Daubechies 20.</p>
<div class="hero-meta"><span class="pill">For the web app and the VST3 plugin for Ableton Live (Windows)</span><span class="pill">Version ${SPEC.APP.version} · ${SPEC.APP.date}</span><a class="pill other-b" href="manual-b.html">Engine B · Wavelet Additive — read Manual B</a></div>
</header>`;

// ---------------------------------------------------------------- 1. idea
const idea = `<h3 id="fourier">Partials versus atoms</h3>
<p>A classic synthesizer thinks in <b>partials</b>. A sawtooth is a stack of sine-wave harmonics at 1, 2, 3, 4 … times the note frequency, each quieter than the one before, and a low-pass filter turns down the harmonics above its cutoff. Every harmonic lasts for the whole cycle, so this description says <em>how much</em> of each frequency there is — but nothing about <em>where</em> in the waveform it happens. The saw’s sharp reset and its smooth ramp are mixed into the same partials.</p>
<p>A <b>wavelet transform</b> describes the same cycle with <b>atoms</b>: short wiggles that all have the same shape — the wavelet — and come in sizes an octave apart. The largest atom spans the whole cycle; the next size has two atoms, each half a cycle long; then four, eight … down to 1024 tiny atoms spaced two samples apart. All atoms of one size form a <b>band</b>. Because each atom sits at a definite place in the cycle, the transform tells you both <em>which octave</em> and <em>when</em>.</p>
${figInline('tiling-a', '<b>Figure 1.</b> Left: in the Fourier view each harmonic spans the whole cycle. Right: the 11 bands of one cycle (B1 at the bottom, B11 at the top), shaded by the atoms of a SAW analysed with Daubechies 4. The panel’s SCALOGRAM draws the same picture live.')}
<ul>
<li>One cycle = 2048 samples = 2047 atoms (1 + 2 + 4 + … + 1024) plus the average, which is removed.</li>
<li>Band <i>b</i> has 2<sup><i>b</i>−1</sup> atoms. Band 1 is about the fundamental, band 2 the 2nd harmonic, band 3 harmonics 3–4, band 4 harmonics 5–8 … each band is about <b>one octave of harmonics</b>.</li>
<li>Smooth stretches of a wave need almost no fine atoms; sharp edges need many. That is why only the reset edge of the saw lights up the fine rows in Figure 1 — and why the POSITION window can treat edges separately.</li>
</ul>
<p>Engine A analyses your source wave once, splits it into <b>11 band layers</b> — the part of the wave carried by each band — and plays them back together, each multiplied by its own gain. Setting those gains is the job of the SCALE FILTER.</p>

<h3 id="bands">Where the bands are</h3>
<p>The cycle is analysed once and played back at the pitch of each note (it is <em>pitch-synchronous</em>), so the bands are relative to the note: band 4 is always about harmonics 5–8, whatever key you press. Key tracking is built in. In hertz, the bands move with the note:</p>
${S.bandMap(E)}
<p>To keep high notes free of aliasing, each band layer is stored in eleven band-limited versions, one per octave, and every note uses the version whose harmonics stay below the sample rate minus 19 kHz (about 25 kHz at 44.1 kHz, 29 kHz at 48 kHz) — anything that folds back lands above 19 kHz. The consequence is musical: <b>the finest bands only exist on low notes</b>. Every octave down adds one band. At 48 kHz, band 7 is the highest band played for notes from about A♯3 to A4, band 8 an octave lower, band 9 two octaves lower; band 10 needs notes below about 57 Hz and band 11 below 28 Hz. (At 44.1 kHz the limits are about a whole tone lower.)</p>
${tip(`<p>At middle C, ${P('f_cutoff')} values between 8 and 12 all sound the same with ${P('f_keytrk')} at 100 %: there is nothing above band 7 to remove. Do your fine-band sweeps on low notes, or keep the cutoff below 7.</p>`)}

<h3 id="wavelets">The wavelet chooses the atom</h3>
<p>The ${ctl('WAVELET')} selector (shared by both engines) decides what the atoms look like. Seven classic wavelets are available, from the 2-tap Haar step to the 40-tap Daubechies 20:</p>
${fig('atoms-a.svg', '<b>Figure 2.</b> One atom of each wavelet, as drawn by the ATOM SHAPE display. “Taps” is the length of the wavelet filter.')}
${S.waveletTable(E)}
<p>The trade-off is the classic one between time and frequency. Short wavelets are precise in time — edges stay sharp and the POSITION window has crisp borders — but their bands overlap, so each band also contains some neighbouring octaves. Long wavelets separate the octaves cleanly but each atom is spread over more of the cycle. For subtractive sweeps that sound like a conventional filter, choose Daubechies 8 or longer; for stepped, digital colours choose Haar or Daubechies 2.</p>

<h3 id="flow">Signal flow</h3>
${figInline('flow-a', '<b>Figure 3.</b> Engine A, from source wave to output. Teal boxes are the wavelet-specific stages.')}
<ul>
<li><b>Table building</b> happens only when you change ${P('a_wave')}, ${P('a_width')}, ${P('a_sparsity')} or ${P('wavelet')}: the source cycle is transformed, thinned out by SPARSITY, and split into 11 band layers plus a “dry” layer (their sum, i.e. the unfiltered wave). The switch to new tables is crossfaded, so you can change these controls while playing.</li>
<li><b>Every voice</b> plays these layers at its own pitch and mixes them with the SCALE FILTER gains, which are recalculated continuously from CUTOFF, the envelopes, the LFO and velocity. The POSITION window then decides, point by point within the cycle, how much of the filtered sound replaces the dry one.</li>
<li><b>All voices</b> are summed and pass through the saturation, delay and reverb, a DC blocker, the master volume and a soft limiter that keeps the output below 0 dBFS.</li>
</ul>

<div class="callout feature" id="haar-square"><span class="ttl">A BEAUTIFUL CONSEQUENCE</span>
<h3>The square wave that will not filter</h3>
<p>With the Haar wavelet, the band-1 atom <em>is</em> one cycle of a square wave: high for the first half, low for the second. So when you analyse a ${ctl('SQUARE')} with Haar, the whole cycle is described by exactly <b>one atom</b> — the other 2046 are zero. The SCALOGRAM shows it: only the bottom row lights up.</p>
<p>The low-pass filter therefore has nothing to remove. ${P('f_cutoff')} does nothing until it reaches band 1; below that the sound simply gets quieter. For progressive subtractive sweeps on a square, choose a smooth wavelet — Daubechies 8, Symlet 8 or Daubechies 20: their atoms do not match the square, so its edges spread over all bands and the filter has something to work on. Or use the effect on purpose: Haar + SQUARE is a tone no filter can dull. The same happens, almost, with ${ctl('PULSE')} at 25 % or 75 %: the edges fall on quarter-cycle boundaries and Haar needs only two atoms.</p>
${fig('haar-square.png', '<b>Haar + SQUARE:</b> the SCALOGRAM shows a single atom, in band 1. Nothing above it to filter.', 'shot')}
${fig('db20-square.png', '<b>Daubechies 20 + SQUARE:</b> atoms in every band, clustered at the two edges (0° and 180°). Now the filter has work to do.', 'shot')}
</div>`;

// ---------------------------------------------------------------- 3. panel tour
const pins = [
  { x: 218, y: 8, title: '▶ DEMO ▾ (web app)', desc: '▶ DEMO plays the default demo, a tour of the presets; ▾ opens the list of demo pieces.', href: 'demo' },
  { x: 286, y: 5, title: 'ENGINE', desc: 'switches between engine A (teal) and engine B (amber).', href: 'header-controls' },
  { x: 562, y: 5, title: 'Preset browser', desc: '◀ ▶ step through the presets; click the name for the list.', href: 'saving' },
  { x: 872, y: 5, title: 'MANUAL A / B', desc: 'open this manual or the engine B manual.', href: 'header-controls' },
  { x: 1024, y: 2, title: 'VOLUME and meter', desc: 'master level and stereo peak meter.', href: 'effects' },
  { x: 13, y: 102, title: 'WAVE', desc: 'the source waveform of engine A.', href: 'source' },
  { x: 13, y: 146, title: 'ATOM SHAPE', desc: 'one atom of the selected wavelet.', href: 'wavelets' },
  { x: 13, y: 285, title: 'WAVELET', desc: 'chooses the atom shape (seven wavelets).', href: 'wavelets' },
  { x: 281, y: 146, title: 'SOURCE CYCLE', desc: 'the wave before (grey) and after sparsity, with “K / nz ATOMS KEPT”.', href: 'sparsity' },
  { x: 298, y: 198, title: 'WIDTH', desc: 'pulse width or triangle symmetry (greyed out for other waves).', href: 'source' },
  { x: 418, y: 198, title: 'SPARSITY', desc: 'keeps only the largest atoms.', href: 'sparsity' },
  { x: 568, y: 104, title: 'SCOPE', desc: 'one cycle of the output; grey = the dry wave.', href: 'displays' },
  { x: 568, y: 216, title: 'SCALOGRAM', desc: 'the atoms of the 11 bands; dashed line = window.', href: 'displays' },
  { x: 130, y: 337, title: 'SCALE FILTER', desc: 'per-band filter with resonance, key tracking, envelope and velocity.', href: 'filter' },
  { x: 451, y: 337, title: 'POSITION', desc: 'confines the filter to part of the cycle.', href: 'position' },
  { x: 675, y: 337, title: 'AMP ENVELOPE', desc: 'loudness ADSR and velocity sensitivity.', href: 'amp-env' },
  { x: 969, y: 337, title: 'MOD ENVELOPE', desc: 'ADSR that moves the cutoff.', href: 'mod-env' },
  { x: 70, y: 485, title: 'LFO', desc: 'one global LFO for pitch, cutoff and position.', href: 'lfo' },
  { x: 376, y: 485, title: 'VOICE', desc: 'portamento mode, octave, tuning, polyphony, glide and unison, with voice LEDs.', href: 'voice' },
  { x: 785, y: 485, title: 'EFFECTS', desc: 'saturation, ping-pong delay and reverb.', href: 'effects' },
  { x: 8, y: 616, title: 'Wheels', desc: 'pitch bend and modulation (vibrato).', href: 'kbd-screen' },
  { x: 169, y: 633, title: 'SUB OSC', desc: 'LEVEL, OCT and SHAPE of the sub oscillator.', href: 'sub' },
  { x: 212, y: 616, title: 'Keyboard', desc: 'five octaves; click lower on a key to play louder.', href: 'kbd-screen' },
  { x: 2, y: 751, title: 'Status bar (web app)', desc: 'audio and MIDI status, key help, Save preset / Export / Import.', href: 'saving' },
];
const ann = annotated('panel-a.png', 'The whole instrument in engine A mode, showing the A · Edge Pluck preset', pins);
const panel = `<p>The panel is the same in the web app and the plugin. In engine A mode the accent colour is teal and the upper-left section shows the ENGINE A controls. The screenshot shows the factory preset <b>A · Edge Pluck</b>; click a number to jump to its description.</p>
<figure>${ann.image}<figcaption>The web app in engine A mode. The status bar at the bottom exists only in the web app.</figcaption></figure>
${ann.legend}
<h3 id="header-controls">The header</h3>
<ul>
<li>${ctl('▶ DEMO')} (web app only) plays the default demo, a piece during which the factory presets change every few seconds; the ${ctl('▾')} beside it opens the other demo pieces and lets you load your own MIDI file — see <a href="#demo">Demo</a>.</li>
<li>${ctl('A · SUBTRACTIVE')} / ${ctl('B · ADDITIVE')} switches the engine. Only the upper-left section and the accent colour change; the filter, position, envelopes, LFO, voice and effects are shared and keep their settings.</li>
<li>The preset browser shows the current preset; a dot after the name means it has been modified. See <a href="#saving">Browsing and saving presets</a>.</li>
<li>${ctl('MANUAL A')} and ${ctl('MANUAL B')} open the manuals — in the web app as an overlay (close it with ✕, ${kbd('Esc')} or a click outside; “Open in new tab” pops it out), in the plugin in your web browser.</li>
<li>The small knob at the right is the master ${ctl('VOLUME')} (−36 to +6 dB, default −3 dB), followed by the stereo output meter. In the plugin, a size button next to the logo opens a menu of window sizes (70–150 %).</li>
</ul>
<h3 id="handling">Working with the controls</h3>
${S.controlsHowTo(E)}`;

// ---------------------------------------------------------------- 4. engine A controls
const engRows = [
  [{ key: 'a_wave', range: 'SAW · SQUARE · PULSE · TRI · SINE · NOISE' }, 'The waveform that is analysed. One cycle of 2048 samples is drawn, its average removed and its peak normalised, then it is transformed into atoms.', 'SAW and NOISE have detail in every band: the most to filter.'],
  ['a_width', `${ctl('PULSE')}: the part of the cycle spent high (pulse width). ${ctl('TRI')}: where the peak sits — 50 % is a symmetric triangle, low values lean towards a falling ramp, high values towards a rising ramp. Greyed out for the other waves.`, 'With Haar, WIDTH 25 %, 50 % or 75 % leaves almost nothing to filter (edges on quarter-cycle boundaries).'],
  ['a_sparsity', `Keeps only the K largest of the cycle’s non-zero atoms and silences the rest. The range is relative to the wave: 0 % keeps all nz atoms the current wave and wavelet need, 50 % about √nz, 100 % a single atom. The SOURCE CYCLE display reads “K / nz ATOMS KEPT”.`, 'Acts over its whole range for every wave. Waves that need few atoms (a Daubechies 2 SAW has 20) change in bigger steps.'],
  [{ key: 'wavelet', range: 'Haar · DB2 · DB4 · DB8 · Sym8 · Coif3 · DB20' }, 'The shape of the atoms — see <a href="#wavelets">The wavelet chooses the atom</a>. Shared with engine B.', 'Change it while holding a note: the switch is crossfaded.'],
];
const engineA = `<p>The ENGINE A section creates the raw material: a source wave, its analysis into atoms, and an optional thinning-out of those atoms.</p>
${controls(engRows)}
<h3 id="source">Source waves</h3>
${table(['Wave', 'One cycle', 'Character in engine A'], [
  [ctl('SAW'), 'Ramps down across the cycle and jumps back up at the cycle start.', 'All harmonics; fine atoms only at the jump. The classic subtractive source.'],
  [ctl('SQUARE'), 'High for the first half, low for the second.', 'Odd harmonics, hollow. With Haar it is a single atom — see the box above.'],
  [ctl('PULSE'), `High for ${ctl('WIDTH')} of the cycle, then low.`, 'Thinner and more nasal as WIDTH moves away from 50 %.'],
  [ctl('TRI'), `Rises from the lowest point at 0° to the peak at ${ctl('WIDTH')} × 360°, then falls.`, 'Soft and flute-like when symmetric; WIDTH skews it towards a ramp.'],
  [ctl('SINE'), 'One sine cycle.', 'Little to filter; useful with SPARSITY or as a pure reference.'],
  [ctl('NOISE'), 'One fixed cycle of random values, identical every time.', 'Played at the note’s pitch, so it is a buzzy, pitched timbre rather than hiss. Detail in every band.'],
], 'compact')}

<h3 id="sparsity">Sparsity: a lossy codec as a timbre control</h3>
<p>${P('a_sparsity')} ranks the atoms of the cycle by size and keeps only the K largest; the rest are set to zero. This is exactly what wavelet-based lossy codecs such as JPEG 2000 do to save bits — here it is a sound-design tool. At moderate settings the cycle simplifies into a handful of atoms and their shape becomes audible: glassy, slightly “digital” tones; at 100 % only one atom is left.</p>
<p>The range is <b>relative to the source</b>. A smooth wave needs far fewer than the 2047 possible atoms — a saw analysed with Daubechies 8 has only 96 non-zero atoms, because a straight ramp needs no fine atoms — only the jump does. SPARSITY counts from that number, nz: K = nz<sup>1 − SPARSITY</sup>, rounded. So 0 % keeps every atom the wave needs, 50 % keeps about √nz, 100 % keeps one, and the knob does something over its whole range for every wave.</p>
${fig('sparsity-a.svg', `<b>Figure 4.</b> A SAW analysed with Daubechies 8 (${DB8HALF.nz} non-zero atoms) at five SPARSITY settings (grey = original). At 30 % the jump is still drawn sharply; from 50 % on only coarse atoms remain and the saw turns into a smooth, wavy approximation of itself.`)}
${sparsityExamples()}
<p class="small muted">Atoms kept for a few sources, as “K / nz” exactly as the SOURCE CYCLE display shows them.</p>
<ul>
<li><b>Coarse or fine steps.</b> Sources that need few atoms change in clear jumps — a Daubechies 2 SAW has only 20, and Haar + ${ctl('SQUARE')} has a single atom, so there is nothing to remove at all. ${ctl('NOISE')}, and any slope analysed with Haar, use all 2047 atoms and change almost continuously.</li>
<li>SPARSITY acts before the filter, and the dry signal used by the POSITION window is the sparse version too.</li>
<li>Each change rebuilds the tables (crossfaded), so turning the knob while playing gives a stepped morph rather than a smooth sweep.</li>
</ul>
${fig('sparse-saw.png', `SAW + Daubechies 8 at SPARSITY 50 %: “${DB8HALF.K} / ${DB8HALF.nz} ATOMS KEPT”. Only large, coarse atoms survive (bands 1–5 in the SCALOGRAM), so the ramp becomes a smooth, wavy approximation of itself.`, 'shot')}
${deep(`<p>K = round(nz<sup>1 − SPARSITY</sup>), never more than nz. Atoms smaller than a billionth of the largest one count as zero. The table gives nz — the number after the slash in the display — for every wave (WIDTH 50 % unless stated) and wavelet.</p>${sparsityFacts()}`, 'UNDER THE HOOD — HOW MANY ATOMS DOES A WAVE NEED?')}`;

// ---------------------------------------------------------------- 12. recipes
function recipe(id, title, from, steps, listen) {
  return `<article class="recipe" id="${id}"><header><h3>${title}</h3><span class="from">${from}</span></header><div class="body"><ol class="steps">${steps.map(s => `<li>${s}</li>`).join('')}</ol><p class="listen">${listen}</p></div></article>`;
}
const recipes = `<p>Each recipe starts from a factory preset and uses only the controls on the panel. Values are what the panel shows when you hover over a knob.</p>
${recipe('r-sweep', 'Classic filter sweep with a wavelet character', 'Start from: A · Init', [
  `${P('a_wave')} ${ctl('SAW')}, ${P('wavelet')} Daubechies 8.`,
  `SCALE FILTER: ${ctl('LOW-PASS')}, ${P('f_slope')} 24 dB/band, ${P('f_cutoff')} 3.0, ${P('f_res')} 9 dB.`,
  `${P('f_env')} +5 bands. MOD ENVELOPE: ATTACK 3 ms, DECAY 600 ms, SUSTAIN 20 %, RELEASE 500 ms.`,
  'Play a few notes: each one opens to band 8 (3 + 5) and settles near band 4 (3 + 5 × 20 %).',
  'Step through the wavelets while playing: Haar turns the sweep into gritty staircases, Daubechies 2 adds lopsided ringing, Daubechies 20 is the smoothest.',
], '<b>Listen for:</b> the resonance colours a whole octave of harmonics rather than a single frequency, and with KEY TRK at 100 % the sweep has the same colour on every key.')}
${recipe('r-decimator', 'Pitch-locked decimator (Haar staircase)', 'Start from: A · Init', [
  `${P('a_wave')} ${ctl('SAW')}, ${P('wavelet')} Haar.`,
  `${ctl('LOW-PASS')}, ${P('f_slope')} 96 dB/band, ${P('f_res')} 0 dB.`,
  `Set ${P('f_cutoff')} to 4.5, 3.5, 2.5 and 1.5 in turn: the ramp becomes a staircase of 16, 8, 4 and finally 2 steps (a square). Halfway values between bands give the cleanest steps.`,
  `For random step changes: ${ctl('LFO')} ${P('lfo_shape')} ${ctl('S&amp;H')}, ${P('lfo_rate')} 6 Hz, ${P('lfo_cut')} 2 bands.`,
  `Add ${P('fx_drive')} 30 % for grit.`,
], '<b>Listen for:</b> a bit-crusher-like reduction that is locked to the note: the steps are a whole number per cycle, so the pitch stays clean, and the band-limited tables keep it free of aliasing.')}
${fig('staircase-a.svg', '<b>Figure 5.</b> Haar SAW through a 96 dB/band low-pass: each removed band halves the number of steps per cycle.')}
${recipe('r-edge', 'Edge pluck: filter only the falling edge', 'Start from: A · Edge Pluck (or A · Init)', [
  `${P('a_wave')} ${ctl('SQUARE')}, ${P('wavelet')} Symlet 8.`,
  `${P('f_cutoff')} 2.5, ${P('f_slope')} 24 dB/band, ${P('f_env')} +6 bands. MOD ENVELOPE: DECAY 350 ms, SUSTAIN 0 %.`,
  `POSITION: ${P('p_center')} 180°, ${P('p_width')} 40 %, ${P('p_depth')} 100 %. The WINDOW display shows a bump in the middle and the SCOPE shades it.`,
  `AMP ENVELOPE: DECAY 1.2 s, SUSTAIN 0 %, RELEASE 400 ms. ${P('fx_rmix')} 25 %.`,
  `Play, then set ${P('p_depth')} to 0 % to hear the same filter on the whole cycle — duller and rounder.`,
], `<b>Try next:</b> ${P('p_center')} 0° softens the rising edge instead; ${P('p_width')} 100 % with ${P('p_depth')} 50 % gives a gentle blend. Because the rising edge stays raw, the note keeps a bright core however low the cutoff goes.`)}
${recipe('r-sparse', 'Lossy keys (sparsity)', 'Start from: A · Init', [
  `${P('a_wave')} ${ctl('SAW')}, ${P('wavelet')} Daubechies 2.`,
  `${P('a_sparsity')} ${KEYS.pct} %: the SOURCE CYCLE display reads “${KEYS.K} / ${KEYS.nz} ATOMS KEPT”.`,
  `${P('f_cutoff')} 9. AMP ENVELOPE: DECAY 1.5 s, SUSTAIN 30 %, RELEASE 500 ms.`,
  `${P('fx_rmix')} 20 %, ${P('fx_dmix')} 12 %.`,
  `Hold a chord and move ${P('a_sparsity')} between 30 % and 90 %: with only ${KEYS.nz} atoms to begin with, they drop out one by one and the timbre changes in clear jumps, like a low-bit-rate codec.`,
], `<b>Try next:</b> Daubechies 8 or 20 give the saw more atoms (${sparse(0, 3, 0).nz} and ${sparse(0, 6, 0).nz}) and finer steps; ${ctl('TRI')} with SPARSITY 70–95 % for bell-like tones built from a handful of atoms; Haar with high sparsity for blocky, chip-like steps.`)}
${recipe('r-brass', 'Noise brass', 'Start from: A · Noise Brass (or A · Init)', [
  `${P('a_wave')} ${ctl('NOISE')} — a fixed random cycle, so it is pitched, not hiss. ${P('wavelet')} Coiflet 3.`,
  `${P('f_cutoff')} 3, ${P('f_res')} 6 dB, ${P('f_env')} +5 bands.`,
  'MOD ENVELOPE: ATTACK 80 ms, DECAY 600 ms, SUSTAIN 40 %.',
  `AMP ENVELOPE: ATTACK 50 ms, SUSTAIN 90 %. ${P('v_unison')} 2, ${P('v_detune')} 8 cents. ${P('fx_rmix')} 18 %.`,
  `For dynamics, set ${P('f_vel')} +3 bands and play softly and hard: soft notes stay darker.`,
], '<b>Listen for:</b> the noise cycle has energy in every band, so the opening envelope sounds like a brassy “blat”.')}
${recipe('r-scan', 'Scanning edge (LFO → POSITION)', 'Start from: A · Scanning Edge (or A · Init)', [
  `${P('a_wave')} ${ctl('SAW')}, ${P('wavelet')} Daubechies 8. ${P('f_cutoff')} 3, ${P('f_res')} 6 dB.`,
  `POSITION: ${P('p_center')} 0°, ${P('p_width')} 25 %, ${P('p_depth')} 100 %.`,
  `LFO: ${ctl('SINE')}, ${P('lfo_rate')} 0.25 Hz, ${P('lfo_pos')} ±180°. AMP ${P('amp_s')} 100 %.`,
  'Hold a note and watch the dashed window travel through the SCALOGRAM: whenever it covers the saw’s jump at 0°/360° the tone darkens; elsewhere the raw saw shines through.',
  `${P('fx_dmix')} 20 %, ${P('fx_rmix')} 20 %.`,
], `<b>Try next:</b> ${ctl('SQR')} at 2 Hz for a rhythmic open/closed edge, or ${ctl('S&amp;H')} for random scanning.`)}
${recipe('r-notch', 'Octave notch phaser', 'Start from: A · Init', [
  `${P('a_wave')} ${ctl('SAW')}, ${P('wavelet')} Daubechies 20 (the cleanest octaves).`,
  `${P('f_type')} ${ctl('BAND-REJ')}, ${P('f_cutoff')} 4, ${P('f_slope')} 24 dB/band.`,
  `LFO: ${ctl('TRI')}, ${P('lfo_rate')} 0.3 Hz, ${P('lfo_cut')} 1.5 bands.`,
  'Hold a chord: the notch sweeps from band 2.5 to 5.5, hollowing out one octave of harmonics at a time.',
  `Lower ${P('f_slope')} to 6 for a wide, soft notch; raise it to 96 for a narrow notch that only bites as it crosses each band.`,
], '<b>Listen for:</b> a phaser-like motion whose notches stay musically aligned to octaves of the note.')}
${recipe('r-bass', 'Expressive mono bass', 'Start from: A · Haar Bass', [
  `${P('a_wave')} ${ctl('PULSE')}, ${P('a_width')} 35 %, ${P('wavelet')} Haar, ${P('v_oct')} −1.`,
  `${P('f_cutoff')} 3.5, ${P('f_slope')} 36 dB/band, ${P('f_res')} 6 dB, ${P('f_env')} +4 bands. MOD ENVELOPE: DECAY 250 ms, SUSTAIN 0 %.`,
  `${P('v_voices')} 1 (mono), ${P('v_glide')} 40 ms, ${P('fx_drive')} 30 %. ${ctl('SUB OSC')} ${P('sub_level')} 45 % (−1 octave, sine) for weight.`,
  `${P('f_vel')} +3 bands: soft notes stay up to three bands darker, hard notes open fully.`,
  `${P('f_keytrk')} 50 %: higher notes get relatively darker, like an analogue bass.`,
], `<b>Try next:</b> ${P('a_width')} 25 % — the edges land on quarter-cycle boundaries, Haar needs only two atoms and the filter suddenly has almost nothing to remove (see <a href="#haar-square">the square wave that will not filter</a>).`)}
${recipe('r-legato', 'Expressive legato lead', 'Start from: A · Wavelet Lead', [
  `The preset is already mono (${P('v_voices')} 1) with a short glide. In the VOICE section, set the portamento selector to ${ctl('LEGATO')}.`,
  `${P('v_glide')} 120 ms, so that the slides are clearly audible.`,
  'Play a melody with detached notes: each one starts right on pitch, with a fresh filter envelope.',
  'Now connect two notes — press the next key before releasing the previous one: the pitch slides and the envelopes carry on. Release the upper note while still holding the lower one, and the pitch slides back down.',
  'Push the mod wheel up on long notes for extra vibrato.',
], `<b>Listen for:</b> the “fingered portamento” of classic monophonic synthesizers — you decide note by note whether to slide, simply by how you play. With ${ctl('POLY')} every note would glide; with ${ctl('OFF')} none would.`)}
${recipe('r-polyglide', 'Polyphonic glide pad', 'Start from: A · Warm Pad (the default sound)', [
  `Keep the portamento selector on ${ctl('POLY')} (the default) and set ${P('v_glide')} to 300 ms — the preset’s glide is off.`,
  'Play a chord, release it, then play the next one: C–E–G, then F–A–C. Each voice glides from its own previous note: G slides down to F, E up to A, and C stays where it is.',
  'Try other changes — Am to F, C to Em — and listen to the inner voices crossing smoothly.',
  'Play single notes: each new note slides from the previous one while the release tails of the older notes keep sounding.',
  `Switch to ${ctl('LEGATO')}: chords now glide only when you keep a key down while playing the next notes; ${ctl('OFF')} turns portamento off.`,
], '<b>Listen for:</b> chord changes that bend into each other voice by voice, like a string section sliding between chords — something a mono portamento cannot do.')}
${recipe('r-sub', 'Infra sub bass', 'Start from: A · Infra Sub Bass', [
  `${P('a_wave')} ${ctl('SQUARE')}, ${P('wavelet')} Symlet 8, ${P('v_oct')} −1, ${P('v_voices')} 1, ${P('v_glide')} 30 ms.`,
  `${P('f_cutoff')} 3, ${P('f_slope')} 30 dB/band, ${P('f_env')} +2.5 bands. MOD ENVELOPE: DECAY 300 ms, SUSTAIN 20 %.`,
  `${ctl('SUB OSC')}: ${P('sub_level')} 85 %, ${P('sub_oct')} −2 octaves, ${P('sub_shape')} ${ctl('SIN')}.`,
  `AMP ENVELOPE: ATTACK 3 ms, DECAY 600 ms, SUSTAIN 80 %, RELEASE 150 ms. ${P('fx_rmix')} 5 %, ${ctl('VOLUME')} −4 dB.`,
  'Play between C3 and C4 on a system with a subwoofer: the filtered square gives each note its definition, the sub (16–33 Hz) adds pressure you feel. Below about E3 the sub is under 20 Hz.',
], `<b>Try next:</b> ${P('sub_shape')} ${ctl('TRI')} to hear the sub on headphones; ${P('sub_oct')} −1 octave for a punchier, audible sub; ${P('fx_drive')} 30 % adds harmonics that small speakers can play.`)}`;

// ---------------------------------------------------------------- 13. presets
const presetDesc = {
  'A · Init': ['none', 'Neutral starting point: a Daubechies 4 SAW through a low-pass at CUTOFF 7 — almost open at middle C (only band 7 is softened, by 4 dB), darker on low notes, where bands 8–9 exist and are cut.'],
  'A · Wavelet Lead': ['medium', 'Mono legato lead with 60 ms glide: a resonant Daubechies 8 low-pass that the mod envelope opens by 4 bands on every attack, two detuned unison copies, 5.5 Hz vibrato, delay and reverb.'],
  'A · Haar Bass': ['medium', 'Gritty mono bass one octave down: a Haar PULSE (35 %) through a steep 36 dB/band resonant low-pass with a fast envelope snap, saturation, and a sine sub one octave below at 45 %.'],
  'A · Edge Pluck': ['light', 'A pluck in which only the falling edge of a Symlet 8 SQUARE is filtered (window at 180°, depth 100 %): the envelope opens and closes that edge while the rest of the square stays raw.'],
  'A · Sparse Keys': ['light', `Glassy, lo-fi keys: a Daubechies 2 SAW reduced to ${KEYS.K} of its ${KEYS.nz} atoms (SPARSITY ${KEYS.pct} %), with a long decay, reverb and a touch of delay.`],
  'A · Glass Pad': ['medium', 'Slow pad: a Daubechies 20 triangle with a 12 dB resonant peak that a 0.3 Hz LFO sweeps ±1.5 bands, three-copy unison and plenty of reverb.'],
  'A · Noise Brass': ['light', 'A brassy swell from the fixed NOISE cycle: a resonant Coiflet 3 low-pass opened by a mod envelope with an 80 ms attack, soft amp attack and two unison copies.'],
  'A · Scanning Edge': ['medium', 'A 25 %-wide filter window on a Daubechies 8 SAW, swept all the way around the cycle by a 0.25 Hz LFO: the tone darkens each time the window crosses the saw’s jump.'],
  'A · Clean Keys': ['light', 'Clean, velocity-sensitive keys: a symmetric Daubechies 8 triangle with a gentle envelope opening (+2 bands) and a touch of small-room reverb.'],
  'A · Square Mod': ['medium', 'By OktoPierre, from Warm Pad (same envelopes, three-copy unison, delay and reverb): Haar atoms through a very resonant low-pass (CUTOFF 3.06, RESO 17.75 dB) that the slow LFO still moves ±0.8 band — a stepped, resonant “square-ish” pad with a light 5-cent vibrato. Chords drive the strong resonance into the output limiter.'],
  'A · Square Mod 2': ['medium', 'By OktoPierre, from Warm Pad (same envelopes, three-copy unison, delay and reverb): Daubechies 20 atoms through a resonant BAND-PASS around band 5.4 (RESO 17.75 dB) that the 0.4 Hz LFO sweeps ±3.75 bands up and down, with a light 5-cent vibrato. Chords drive the strong resonance into the output limiter.'],
  'A · Warm Pad': ['medium', 'Warm, wide pad: a Coiflet 3 sawtooth breathing through a slow ±0.8-band LFO filter movement, three detuned copies spread wide, reverb and soft echoes.'],
  'A · Infra Sub Bass': ['medium', 'Mono bass one octave down with a strong sine sub two octaves below it (85 %): below about E3 the sub falls under 20 Hz — felt rather than heard, so use a system with a subwoofer.'],
  'A · Dub Echo Lead': ['heavy', 'Resonant PULSE lead drowned in long ping-pong echoes (375 ms, 72 % feedback, 55 % mix): dub-style repeats that keep bouncing.'],
  'A · Fuzz Bass': ['heavy', 'Aggressive mono bass: a Haar sawtooth one octave down through 85 % saturation, with a square sub an octave below.'],
  'A · Cathedral Saw': ['extreme', 'A soft Daubechies 20 sawtooth in an enormous hall: maximum reverb size at 85 % mix, slow attack and a 2.5 s release.'],
  'A · Laser Sweep': ['extreme', 'Sci-fi zaps: a very resonant (20 dB), steep Daubechies 2 filter swept ±4 bands by a 6 Hz saw LFO that also moves a narrow position window, with drive and fast echoes.'],
};
const presetCount = SPEC.PRESETS.filter(p => p.values[C.P.engine] === 0).length;
const presets = `<p>${presetCount} factory presets show what engine A can do, from clean sounds to extreme effects. Load one, play, then look at the panel to see how it is made — the table lists every setting that differs from the defaults. In the instrument’s preset menu the engine A and engine B presets alternate; this table shows engine A’s only. The <b>Effects</b> column rates how much each preset relies on effects and movement (delay, reverb, saturation, unison, LFO, sub oscillator): <span class="fxl fxl-none">none</span> <span class="fxl fxl-light">light</span> <span class="fxl fxl-medium">medium</span> <span class="fxl fxl-heavy">heavy</span> <span class="fxl fxl-extreme">extreme</span>.</p>
${S.presetTable(E, presetDesc)}
${S.presetsSaving(E)}`;

// ---------------------------------------------------------------- extra troubleshooting
const extraTrouble = [
  ['The WIDTH knob is greyed out', `<p>${P('a_width')} only affects ${ctl('PULSE')} (pulse width) and ${ctl('TRI')} (symmetry). For the other waves it has no effect.</p>`],
  ['SPARSITY does nothing, or jumps', '<p>Only Haar + SQUARE (a single atom) cannot change at all. For other sources, watch the “K / nz ATOMS KEPT” readout: when nz is small — 20 for a Daubechies 2 SAW — the knob moves in coarse steps and neighbouring positions can give the same K. Choose a longer wavelet for finer steps.</p>'],
];

const sections = [
  { id: 'idea', num: '1', title: 'The idea in one minute', html: idea, subs: [{ id: 'fourier', title: 'Partials versus atoms' }, { id: 'bands', title: 'Where the bands are' }, { id: 'wavelets', title: 'The wavelet chooses the atom' }, { id: 'flow', title: 'Signal flow' }, { id: 'haar-square', title: 'The square that will not filter' }] },
  { id: 'quick-start', num: '2', title: 'Quick start', html: S.quickStart(E) },
  { id: 'panel', num: '3', title: 'Panel tour', html: panel, subs: [{ id: 'header-controls', title: 'The header' }, { id: 'handling', title: 'Working with the controls' }] },
  { id: 'engine-a', num: '4', title: 'Engine A: source and sparsity', html: engineA, subs: [{ id: 'source', title: 'Source waves' }, { id: 'sparsity', title: 'Sparsity' }] },
  { id: 'filter', num: '5', title: 'Scale filter', html: S.filterSection(E), subs: [{ id: 'filter-types', title: 'The four types in numbers' }] },
  { id: 'position', num: '6', title: 'Position window', html: S.positionSection(E), subs: [{ id: 'edges', title: 'Where the edges are' }, { id: 'window-high', title: 'High notes and modulation' }] },
  { id: 'envelopes', num: '7', title: 'Envelopes', html: S.envelopesSection(E), subs: [{ id: 'amp-env', title: 'Amp envelope' }, { id: 'mod-env', title: 'Mod envelope' }] },
  { id: 'lfo', num: '8', title: 'LFO', html: S.lfoSection(E) },
  { id: 'voice', title: 'Voice', html: S.voiceSection(E) },
  { id: 'sub', title: 'Sub oscillator', html: S.subSection(E) },
  { id: 'effects', num: '10', title: 'Effects and master', html: S.fxSection(E) },
  { id: 'displays', num: '11', title: 'Displays', html: S.displaysSection(E) },
  { id: 'recipes', num: '12', title: 'Sound-design recipes', html: recipes, subs: [{ id: 'r-sweep', title: 'Classic sweep' }, { id: 'r-decimator', title: 'Pitch-locked decimator' }, { id: 'r-edge', title: 'Edge pluck' }, { id: 'r-sparse', title: 'Lossy keys' }, { id: 'r-brass', title: 'Noise brass' }, { id: 'r-scan', title: 'Scanning edge' }, { id: 'r-notch', title: 'Octave notch phaser' }, { id: 'r-bass', title: 'Expressive mono bass' }, { id: 'r-legato', title: 'Expressive legato lead' }, { id: 'r-polyglide', title: 'Polyphonic glide pad' }, { id: 'r-sub', title: 'Infra sub bass' }] },
  { id: 'presets', num: '13', title: 'Factory presets', html: presets, subs: [{ id: 'saving', title: 'Browsing and saving' }] },
  { id: 'playing', num: '14', title: 'Playing', html: S.playingSection(E), subs: [{ id: 'demo', title: 'Demo' }, { id: 'demo-tour', title: 'Default demo: preset tour' }, { id: 'kbd-screen', title: 'On-screen keyboard' }, { id: 'kbd-computer', title: 'Computer keyboard' }, { id: 'midi', title: 'MIDI' }, { id: 'poly', title: 'Polyphony, mono, glide' }] },
  { id: 'vst', num: '15', title: 'The VST3 plugin in Live', html: S.vstSection(E), subs: [{ id: 'vst-install', title: 'Installation' }, { id: 'vst-diff', title: 'Differences' }, { id: 'automation', title: 'Automation' }] },
  { id: 'trouble', num: '16', title: 'Tips & troubleshooting', html: S.troubleshooting(E, extraTrouble) },
  { id: 'glossary', title: 'Glossary', html: S.glossary(E) },
  { id: 'about', title: 'About & release history', html: S.aboutSection(E), subs: [{ id: 'release-history', title: 'Release history' }] },
];

const footer = `<footer class="foot"><span>Wavelet Synthesizer · Manual A — Engine A · Wavelet Subtractive</span><span>${SPEC.APP.name} — ${SPEC.APP.credit} (${SPEC.APP.author}). Version ${SPEC.APP.version} (${SPEC.APP.date}). ${SPEC.APP.copyright}. Free software under the GNU General Public License v3 or later, without any warranty.</span><a href="manual-b.html">Manual B — Engine B · Wavelet Additive →</a></footer>`;

module.exports = {
  engine: E,
  title: 'Engine A · Wavelet Subtractive — Wavelet Synthesizer manual',
  description: 'User manual for engine A (wavelet subtractive) of the Wavelet Synthesizer web app and VST3 plugin.',
  hero, sections, footer,
};
