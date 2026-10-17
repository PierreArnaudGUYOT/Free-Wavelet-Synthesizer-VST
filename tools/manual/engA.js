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
// SOURCE PHASE (beta 0.4): how much a SAW with band 6 removed changes when it is moved, per wavelet (largest change of a
// harmonic among harmonics 1-200, as tools/dsp_selftest.js and the paper measure it; a Fourier filter gives 0 dB)
function phaseFacts() {
  const shifts = [37, 300, 512, 1024];
  const spec = (wi, s) => {
    const f = C.FILTERS[wi], c = C.dwt(C.sourceCycle(0, 0.5, s / C.N), f);
    for (let i = 32; i < 64; i++) c[i] = 0;
    const re = C.idwt(c, f), im = new Float64Array(C.N);
    C.fft(re, im, false);
    return Array.from({ length: 201 }, (_, h) => Math.hypot(re[h], im[h]) / C.N);
  };
  const rows = SPEC.WAVELETS.map((w, wi) => {
    const a = spec(wi, 0);
    return [w.name, ...shifts.map(s => {
      const b = spec(wi, s);
      let worst = 0;
      for (let h = 1; h <= 200; h++) if (a[h] > 1e-4) worst = Math.max(worst, Math.abs(20 * Math.log10((b[h] + 1e-12) / a[h])));
      return worst < 0.05 ? '0' : worst.toFixed(1) + ' dB';
    })];
  });
  return table(['SAW, band 6 removed', ...shifts.map(s => `${(s * 360 / C.N).toFixed(1)}° (${s} samples)`)], rows, 'compact num') +
    '<p class="small muted">Largest change of a harmonic (1–200) against 0°, computed from the engine. 1024 samples is a multiple of band 6’s atom spacing (32 samples): band 6 slides onto its own atoms and nothing changes.</p>';
}
const KEYS_S = 0.35;   // the lossy-keys recipe (the sparsity of beta 0.4's A · Sparse Keys)
const KEYS = Object.assign(sparse(0, 1, KEYS_S), { pct: Math.round(KEYS_S * 100) });   // a DB2 saw
const DB8HALF = sparse(0, 3, 0.5);        // screenshot: DB8 saw at 50 %

// ---------------------------------------------------------------- hero
const hero = `<header class="hero">
<p class="eyebrow">WAVELET SYNTHESIZER · USER MANUAL A</p>
<h1><span class="tag">ENGINE A</span>Wavelet Subtractive</h1>
<p class="lead">Engine A is a subtractive synthesizer with a twist. Like a classic analogue-style instrument it starts from a bright waveform — saw, square, pulse, triangle, sine or a noise cycle — and shapes it with a filter, envelopes and an LFO. The twist is the filter: instead of cutting frequencies it cuts <em>scales</em>. Every waveform cycle is broken down by a wavelet transform into 2047 small building blocks, the atoms, arranged in 11 octave bands. The SCALE FILTER turns those bands up and down, SPARSITY throws away all but the most important atoms, and the POSITION window can confine the filter to one part of the cycle — only the falling edge of a square, say — leaving the rest untouched. The WAVELET you choose sets the shape of the atoms and therefore the character of every sweep: blocky and digital with Haar, smooth and analogue-like with Daubechies 20.</p>
<div class="hero-meta"><span class="pill">For the web app and the VST3 plugin for Ableton Live (Windows and macOS)</span><span class="pill">Version ${SPEC.APP.version} · ${SPEC.APP.date}</span><a class="pill other-b" href="manual-b.html">Engine B · Wavelet Additive — read Manual B</a></div>
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
<li><b>Table building</b> happens only when you change ${P('a_wave')}, ${P('a_width')}, ${P('a_phase')}, ${P('a_sparsity')} or ${P('wavelet')}: the source cycle is drawn (moved by SOURCE PHASE), transformed, thinned out by SPARSITY, and split into 11 band layers plus a “dry” layer (their sum, i.e. the unfiltered wave). The switch to new tables is crossfaded, so you can change these controls while playing.</li>
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
  { x: 286, y: 5, title: 'ENGINE', desc: 'chooses the engine panel shown, A (teal) or B (amber); A/B MIX sets what you hear.', href: 'header-controls' },
  { x: 562, y: 5, title: 'Preset browser', desc: '◀ ▶ step through the presets; click the name for the list.', href: 'saving' },
  { x: 872, y: 5, title: 'MANUAL A / B', desc: 'open this manual or the engine B manual.', href: 'header-controls' },
  { x: 1024, y: 2, title: 'VOLUME and meter', desc: 'master level and stereo peak meter.', href: 'effects' },
  { x: 13, y: 102, title: 'WAVE', desc: 'the source waveform of engine A.', href: 'source' },
  { x: 13, y: 146, title: 'ATOM SHAPE', desc: 'one atom of the selected wavelet.', href: 'wavelets' },
  { x: 13, y: 285, title: 'WAVELET', desc: 'chooses the atom shape (seven wavelets).', href: 'wavelets' },
  { x: 281, y: 146, title: 'SOURCE CYCLE', desc: 'the wave before (grey) and after sparsity, with “K / nz ATOMS KEPT”.', href: 'sparsity' },
  { x: 288, y: 198, title: 'WIDTH', desc: 'pulse width or triangle symmetry (greyed out for other waves).', href: 'source' },
  { x: 384, y: 198, title: 'SPARSITY', desc: 'keeps only the largest atoms.', href: 'sparsity' },
  { x: 434, y: 120, title: 'PHASE', desc: 'SOURCE PHASE: moves the wave inside the cycle before the analysis (beta 0.4).', href: 'phase' },
  { x: 469, y: 262, title: 'A/B MIX', desc: 'what you hear: engine A, engine B or both mixed.', href: 'mix' },
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
  { x: 305, y: 633, title: 'CHORUS', desc: 'string-machine triple chorus: amount, RATE and DEPTH.', href: 'chorus' },
  { x: 348, y: 616, title: 'Keyboard', desc: 'five octaves; click lower on a key to play louder.', href: 'kbd-screen' },
  { x: 2, y: 751, title: 'Status bar (web app)', desc: 'audio and MIDI status, key help, Save preset / Export / Import.', href: 'saving' },
];
const ann = annotated('panel-a.png', 'The whole instrument in engine A mode, showing the A · Mirror Sub Bass Shift preset', pins);
const panel = `<p>The panel is the same in the web app and the plugin. In engine A mode the accent colour is teal and the upper-left section shows the ENGINE A controls. The screenshot shows the factory preset <b>A · Mirror Sub Bass Shift</b> (a SOURCE PHASE sound, the first engine A sound of TOP Sounds); click a number to jump to its description.</p>
<figure>${ann.image}<figcaption>The web app in engine A mode. The status bar at the bottom exists only in the web app.</figcaption></figure>
${ann.legend}
<h3 id="header-controls">The header</h3>
<ul>
<li>${ctl('▶ DEMO')} (web app only) plays the default demo, a piece during which the factory presets change every few seconds; the ${ctl('▾')} beside it opens the other demo pieces and lets you load your own MIDI file — see <a href="#demo">Demo</a>.</li>
<li>${ctl('A · SUBTRACTIVE')} / ${ctl('B · ADDITIVE')} chooses which engine section is shown in the upper left (and the accent colour). What you hear is set by the ${P('ab_mix')} knob at the right of that section — engine A, engine B, or both mixed (see <a href="#mix">Mixing engines A and B</a>). The filter, position, envelopes, LFO, voice and effects are shared by both engines.</li>
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
  [{ key: 'a_phase', range: '0–360°' }, 'SOURCE PHASE (beta 0.4): moves the wave inside the cycle before it is analysed. The wavelet transform is not shift-invariant, so the same wave at another phase is built from other atoms: the scale filter, SPARSITY and the POSITION window then act on it differently and the timbre changes — something no Fourier filter can do. See <a href="#phase">Source phase</a>. LFO 2 can move it (TARGET PHASE).', 'Strong with Haar and Daubechies 2/4, weak with Daubechies 20. With the filter wide open and no sparsity it changes nothing you can hear.'],
  [{ key: 'wavelet', range: 'Haar · DB2 · DB4 · DB8 · Sym8 · Coif3 · DB20' }, 'The shape of the atoms — see <a href="#wavelets">The wavelet chooses the atom</a>. Shared with engine B.', 'Change it while holding a note: the switch is crossfaded.'],
  [{ key: 'wav2', range: 'Haar · DB2 · DB4 · DB8 · Sym8 · Coif3 · DB20' }, 'WAVELET MORPH (beta 0.3): a second wavelet. The sound is also built with WAVELET 2 and crossfaded with the main one by MORPH, the LFO (LFO→WAVELET) and the mod envelope (ENV>WAV). When WAVELET 2 is the same wavelet, or all three amounts are 0, nothing changes.', 'It is heard where the wavelet shapes the sound: the CUTOFF and RESO of the scale filter, SPARSITY, the POSITION window, and all of engine B. With the filter wide open and no sparsity engine A hardly changes.'],
  ['wmorph', 'The morph position: 0 % = WAVELET, 100 % = WAVELET 2, in between both crossfaded.', 'Haar ↔ Daubechies 20 is the biggest contrast: stepped bands against smooth, sine-like bands.'],
  ['env_wav', 'The MOD ENVELOPE moves the morph by up to ± this amount from the MORPH position, for each note on its own: positive towards WAVELET 2 at the attack peak, then back as the envelope falls to its sustain.', 'With a resonant filter: each note starts on one wavelet and settles on the other (preset “A · Wave Attack Lead”).'],
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
${deep(`<p>K = round(nz<sup>1 − SPARSITY</sup>), never more than nz. Atoms smaller than a billionth of the largest one count as zero. The table gives nz — the number after the slash in the display — for every wave (WIDTH 50 % unless stated) and wavelet.</p>${sparsityFacts()}`, 'UNDER THE HOOD — HOW MANY ATOMS DOES A WAVE NEED?')}

<h3 id="phase">Source phase: moving the wave inside the cycle</h3>
<p>${P('a_phase')} (beta 0.4) slides the source wave along its cycle before the wavelet transform: at 90° the saw’s jump sits a quarter of the way in instead of at the start. To the ear an unfiltered wave sounds exactly the same at any phase. But the atoms of the wavelet transform sit on a fixed grid inside the cycle, so the moved wave is described by <em>other</em> atoms — and as soon as something acts on the atoms (a SCALE FILTER cut, SPARSITY, the POSITION window), the result is a different timbre. A Fourier filter, which only sees harmonics, cannot tell the two phases apart; a wavelet filter can. This is the shift-variance of the discrete wavelet transform, turned into a control.</p>
<ul>
<li><b>Which wavelet.</b> Short wavelets react most: Haar and Daubechies 2/4 give changes of tens of dB on some harmonics; Daubechies 20 only a few dB. The table below measures it.</li>
<li><b>Which bands move.</b> Band <i>b</i> has 2<sup><i>b</i>−1</sup> atoms, one every 2<sup>12−<i>b</i></sup> samples. A shift by a multiple of that spacing slides the wave exactly onto the next atoms of band <i>b</i>, so that band is unchanged; only the bands with a wider spacing change. 180° (1024 samples) leaves bands 2–11 as they were; a small odd shift (say 37 samples, 6.5°) changes them all.</li>
<li><b>When it does nothing.</b> With the filter wide open, no sparsity and no position window the sound is the same at every phase (the layers always add up to the moved wave). Make the filter cut into the strong low bands (CUTOFF 2–5, a steep SLOPE, RESO), add SPARSITY or the window, and turn PHASE.</li>
<li><b>Noise</b> is moved by whole samples. The SOURCE CYCLE display shows the moved wave, so you can see where the edge now sits.</li>
<li><b>Moving it with LFO 2</b> (TARGET ${ctl('PHASE')}): AMOUNT moves the phase by up to ±180°. The tables are then also built at 11 more phases, 30° apart round the cycle, and each voice crossfades between the two nearest — a smooth scan through the timbres of the cycle (preset “A · Phase Scanner”). This costs about 12 times the table memory (about 13 MB, twice that with WAVELET MORPH) and up to twice the processing per voice; at AMOUNT 0 nothing extra is built.</li>
</ul>
${phaseFacts()}
<p>The presets of the <b>Source Phase</b> section (beta 0.5: the second of the preset browser, after TOP Sounds) are built on this control: phased versions of OktoPierre’s favourite and best-voted sounds (“… Shift”) and new sounds. Of the 100 of beta 0.4 he kept ${SPEC.PRESETS.filter(p => p.cat === 'Source Phase').length}; ${SPEC.PRESETS.slice(0, SPEC.TOP).filter(p => p.cat === 'Source Phase').length} of them are among his TOP Sounds.</p>`;

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
${recipe('r-edge', 'Edge pluck: filter only the falling edge', 'Start from: A · Init', [
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
${recipe('r-scan', 'Scanning edge (LFO → POSITION)', 'Start from: A · Init', [
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
${recipe('r-bass', 'Expressive mono bass', 'Start from: A · Init', [
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
${recipe('r-sub', 'Infra sub bass', 'Start from: A · Init', [
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
  'A · Glass Pad': ['medium', 'Slow pad: a Daubechies 20 triangle with a 12 dB resonant peak that a 0.3 Hz LFO sweeps ±1.5 bands, three-copy unison and plenty of reverb.'],
  'A · Noise Brass': ['light', 'A brassy swell from the fixed NOISE cycle: a resonant Coiflet 3 low-pass opened by a mod envelope with an 80 ms attack, soft amp attack and two unison copies.'],
  'A · Clean Keys': ['light', 'Clean, velocity-sensitive keys: a symmetric Daubechies 8 triangle with a gentle envelope opening (+2 bands) and a touch of small-room reverb.'],
  'A · Warm Pad': ['medium', 'Warm, wide pad: a Coiflet 3 sawtooth breathing through a slow ±0.8-band LFO filter movement, three detuned copies spread wide, reverb and soft echoes.'],
  'A · Dub Echo Lead': ['heavy', 'Resonant PULSE lead drowned in long ping-pong echoes (375 ms, 72 % feedback, 55 % mix): dub-style repeats that keep bouncing.'],
  'A · Laser Sweep': ['extreme', 'Sci-fi zaps: a very resonant (20 dB), steep Daubechies 2 filter swept ±4 bands by a slow saw LFO (0.37 Hz, OktoPierre’s setting of beta 0.5) that also moves a narrow position window, a sub oscillator at 26 %, drive and fast echoes.'],
  'A · String Machine': ['medium', 'Classic string machine: a soft Daubechies 20 sawtooth through a gentle low-pass (CUTOFF 7.5, 18 dB/band) with a 350 ms attack, 16 voices and the triple CHORUS at 85 % (0.65 Hz, depth 75 %) into a medium hall.'],
  'A · Solina Cellos': ['medium', 'Low string ensemble one octave down: a Coiflet 3 sawtooth at CUTOFF 5.5, a quiet sine sub one octave below (25 %) and the CHORUS at 80 % with a deep sweep.'],
  'A · Poly Chorus Pad': ['medium', 'Polysynth pad: a Symlet 8 PULSE (30 %) through a resonant low-pass that a 0.35 Hz LFO moves ±1.2 bands, with the chorus at 60 %, soft echoes and reverb.'],
  'A · Chorus Square Lead': ['medium', 'Mono SQUARE lead with legato glide, a short filter envelope, 6-cent vibrato and a faster, lighter chorus (1.2 Hz, 45 %) that widens it, plus delay.'],
  'A · Reese Sub': ['medium', 'Reese bass: three unison sawtooths detuned by 22 cents beating against each other, a slow LFO on the filter, a sine sub at 75 % and drive.'],
  'A · Acid Sub': ['medium', 'Acid line: a Haar SQUARE through a steep, very resonant low-pass (18 dB) that the envelope and velocity open, legato glide, a triangle sub, two unison copies two octaves down (beta 0.5), drive and a dotted echo.'],
  'AB · Hybrid Keys': ['light', 'A 50 · B 50: a SQUARE with a filter envelope (A) and an IMPULSE pattern whose bright bands die in 0.15 s (B) — a struck attack over a woody body, with light chorus.'],
  'AB · Dream Pad': ['heavy', 'A 50 · B 50: a Coiflet 3 PULSE whose filter and position window drift with a slow LFO (A), MIRROR atoms opening over a second (B), three unison copies, chorus, echoes and a large hall.'],
  'AB · Wide Brass': ['light', 'A 70 · B 30: a resonant sawtooth brass (A) with a 60 ms filter swell and a RAMP layer (B), two unison copies and a touch of chorus.'],
  // beta 0.2: the library by category
  'A · Ladder Bass': ['light', 'Mono legato bass one octave down: a Daubechies 8 sawtooth through a steep 48 dB/band resonant low-pass (CUTOFF 2.8, RESO 9 dB) that the mod envelope snaps open by 4.5 bands, more with velocity; a sine sub at 40 % and a little drive.'],
  'AB · Wobble Bass': ['heavy', 'A 70 · B 30: a Haar sawtooth (A) and WALSH atoms (B) one octave down through a 10 dB resonant low-pass that a 3 Hz LFO swings ±3 bands — the “wobble” — with a sine sub at 60 % and 40 % drive.'],
  'A · Saw Lead': ['medium', 'Classic mono lead: a Daubechies 8 sawtooth through an open resonant low-pass (CUTOFF 7), two unison copies detuned 10 cents, 5.5 Hz vibrato, legato glide, a 375 ms echo and some reverb.'],
  'A · Whistle Lead': ['light', 'A pure SINE one octave up with a 40 ms attack, 10-cent vibrato at 5.5 Hz and a 100 ms legato glide — a whistled, ocarina-like line.'],
  'A · Tine Piano': ['light', 'Electric-piano tines: a Daubechies 8 triangle whose filter opens on each strike (more with velocity), a 2.5 s decay, strong velocity response, a slow chorus and a little reverb.'],
  'AB · Electric Piano': ['medium', 'A 65 · B 35: a Daubechies 20 sine (A) for the round body and IMPULSE atoms (B) whose bright bands die in 0.12 s for the hammer’s bark; velocity-sensitive, with chorus and reverb.'],
  'A · Clavi': ['none', 'Funky clavinet: a thin Daubechies 2 PULSE (15 %) through a high-pass at band 2 that removes the fundamental band, a short 450 ms decay and strong velocity response (filter and level).'],
  'A · Lo-Fi Piano': ['light', 'Dusty keys: a Daubechies 4 sawtooth with 55 % SPARSITY (only its strongest atoms remain) and a filter that closes after the strike, with light chorus and reverb.'],
  'A · Analog Pad': ['medium', 'Warm polysynth pad: a Coiflet 3 sawtooth with four unison copies detuned 18 cents, a slow 0.25 Hz LFO on the cutoff, chorus and reverb; slow attack and release.'],
  'AB · Evolving Pad': ['heavy', 'A 50 · B 50: a Symlet 8 PULSE whose position window (depth 60 %) and cutoff drift with a 0.12 Hz LFO (A), and RANDOM atoms (SEED 23) whose bands fade in one after another over 3 s (B); unison, chorus, echoes and reverb.'],
  'A · Pizzicato': ['light', 'Plucked strings: a Coiflet 3 sawtooth whose filter opens briefly on each note, a 350 ms decay without sustain, and a room reverb.'],
  'A · Slow Strings': ['medium', 'Slow-bowed strings: a bright Daubechies 20 sawtooth with a 1.2 s attack and a 2 s release, the CHORUS at 70 % with a deep sweep, and a hall reverb.'],
  'AB · Analog Strings': ['medium', 'A 75 · B 25: a Daubechies 20 sawtooth (A) with a RAMP layer (B, all drawbars) through the CHORUS at 90 % — the classic string machine.'],
  'A · Harp': ['medium', 'Harp: a Daubechies 20 triangle whose filter opens on the pluck and closes over 0.6 s, a 2 s decay and a large reverb.'],
  'A · Synth Pluck': ['medium', 'Resonant pluck: a Daubechies 8 sawtooth with a 7-band filter snap (200 ms) and no sustain, through 375 ms echoes and reverb.'],
  'AB · Arp Pluck': ['medium', 'A 70 · B 30: a Daubechies 4 SQUARE plucked by the filter envelope (A) with WALSH atoms (B), short and dry, with light chorus and 250 ms echoes — made for arpeggios.'],
  'A · Wind': ['medium', 'Wind: NOISE through a 10 dB resonant low-pass that a slow 0.15 Hz LFO sweeps ±2.5 bands, with a slow attack, a long release and a big reverb. Hold a chord.'],
  'AB · Robot Voice': ['medium', 'A 60 · B 40: a Haar SQUARE (A) and WALSH atoms (B) through a 14 dB resonant band-pass whose centre jumps to a new place eight times a second (SAMPLE & HOLD LFO), with drive — a talking computer.'],
  'A · Alarm': ['light', 'Siren: a Haar SQUARE whose pitch a 2.5 Hz triangle LFO swings ±100 cents (a semitone each way), mono, with a short echo.'],
  'AB · Sub Kick': ['none', 'A 85 · B 15: a sine (A) with a short IMPULSE click (B) and a sine sub at 70 %, all gone in 0.3 s. Play it low (C2–C3) for kick drums; the pitch follows the key.'],
  'A · Noise Snare': ['light', 'Snare: high-passed NOISE for the rattle and a triangle sub one octave below the key for the body, both gone in 0.2 s, with a little reverb. Tune it with the key (around C3–C4).'],
  'A · Closed Hat': ['light', 'Closed hi-hat: NOISE through a resonant high-pass at band 4.5 with a 60 ms decay and a touch of drive. Higher keys give a brighter hat.'],
  'A · Open Hat': ['light', 'Open hi-hat: the high-passed NOISE of the closed hat with a 0.5 s decay.'],
  'A · Synth Tom': ['none', 'Electronic tom: a Daubechies 20 triangle with a quick filter drop and a sine sub at 50 %, decaying in 0.45 s; play it on several keys for a tom fill.'],
  'A · Sweep Pad': ['medium', 'Resonant saw pad whose filter sweeps slowly, three unison copies.'],
  'A · Analog Brass Pad': ['medium', 'Slow filter swell on detuned saws: Oberheim-style brass pad.'],
  'A · Noise Wash Pad': ['extreme', 'Resonant band-passed noise thinned to 24 % sparsity, drifting with a slow ±1.3-band filter LFO and a ±22-cent pitch wobble in a huge reverb; OktoPierre shortened the attack to 23 ms so it speaks at once.'],
  'A · Ensemble Strings': ['medium', 'String ensemble: saws, gentle low-pass, unison, strong chorus.'],
  'A · Cello Section': ['medium', 'One octave down, vibrato, slight unison.'],
  'AB · Silk Strings': ['medium', 'A 70 · B 30: Saw (A) + mirror atoms (B), slow attack, deep chorus.'],
  'A · Spiccato Strings': ['light', 'Short bowed notes for fast lines.'],
  'A · Shimmering Strings': ['medium', 'Strings with chorus and reverb; OktoPierre slowed the LFO to 2.1 Hz and added ±7 cents of vibrato to the cutoff shimmer.'],
  'A · French Horn': ['medium', 'Round horn: triangle with a soft filter swell.'],
  'A · Brass Section Stab': ['light', 'Short brass section hit.'],
  'A · Steel Pluck': ['heavy', 'Steel-string pluck one octave down, edited by OktoPierre into a sustained tone (sustain 78 %) with a light vibrato, a ±1.4-band filter LFO and long ping-pong echoes (476 ms, 54 % feedback, 31 % mix) over a light chorus.'],
  'A · UFO': ['heavy', 'Sine with a huge vibrato, echoes and reverb.'],
  'A · Siren Sweep': ['medium', 'Resonant band-pass swept up and down by a triangle LFO; OktoPierre added ±18 cents of pitch movement, a held filter envelope, a strong sine sub (82 %) and a touch of delay.'],
  'A · Wave Atom Scanner': ['light', 'A 33 %-wide window scans the atoms of the cycle back and forth; OktoPierre added a ±2.1-band filter LFO and ±8 cents of vibrato.'],
  'A · Wave Wobble Bass': ['heavy', 'Bass three octaves down (OktoPierre’s edit): the LFO morphs Daubechies 20 / Haar and moves the cutoff together, with drive — a sub-heavy wobble.'],
  'A · Wave Attack Lead': ['medium', 'Each note starts on Haar and slides to Daubechies 20, the filter follows.'],
  'A · Wave S/H Lead': ['medium', 'Lead: sample & hold jumps the wavelet (WAVELET MORPH) and the cutoff at random, with echoes; OktoPierre added ±5 cents of pitch jumps.'],
  'A · Wave Pulse Lead': ['light', 'Lead that starts smooth (Coiflet 3) and turns to Haar as the envelope falls; OktoPierre’s slow 1.3 Hz LFO adds a ±1.3-band filter and a ±33° window movement; three octaves down with four unison copies (beta 0.5).'],
  'A · Wave Morph Pad': ['medium', 'A slow LFO on the morph (Daubechies 20 / Haar) and the cutoff together.'],
  'A · Wave Tremolo Strings': ['medium', 'Strings: a 1.7 Hz triangle LFO on the WAVELET MORPH and the cutoff, a slow timbral tremolo with a light vibrato (OktoPierre’s edit of the square-LFO original).'],
  'A · Wave Brass': ['medium', 'Brass whose attack morphs the wavelet and opens the filter together; OktoPierre added a slow 0.6 Hz LFO (±7 cents, ±1.6 bands), a brighter cutoff (3.3) and 25 % delay.'],
  'A · Wave Robot': ['medium', 'Sample and hold on the morph and a band-pass cutoff together, a talking robot.'],
  'A · Wave Riser': ['medium', 'Noise through a band-pass, a saw LFO on the WAVELET MORPH and the cutoff, in a big reverb; two unison copies (OktoPierre).'],
  // beta 0.4: the SOURCE PHASE section
  'A · Square Mod 2 Shift': ['medium', "A · Square Mod 2 (a preset of beta 0.4) with its source moved: a Daubechies 20 SAW through a 24 dB/band resonant band-pass at band 5.4, vibrato, the LFO on the cutoff, three unison copies, with delay and reverb. SOURCE PHASE 194°: a harmonic changes by 25 dB against 0° (25 dB on the loud ones)."],
  'A · Wavelet Lead Shift': ['medium', "A · Wavelet Lead with its source moved: a Daubechies 8 SAW through a 24 dB/band resonant low-pass at band 4.5, an envelope sweep of the cutoff, LFO 2 (sine, 0.3 Hz) moving the phase ±27°, vibrato, two unison copies, mono with glide, one octave down (beta 0.5), with delay and reverb. SOURCE PHASE 199°: a harmonic changes by 12 dB against 0° (7 dB on the loud ones)."],
  'A · Focus Sweep Shift': ['medium', "B · Focus Sweep rebuilt on engine A with its source moved: a Haar SAW through a 24 dB/band resonant band-pass at band 5.5, the position window at 0° (100 %), LFO 2 (triangle, 0.13 Hz) moving the phase ±72°, two unison copies two octaves down (beta 0.5), with delay and reverb. SOURCE PHASE 11°: a harmonic changes by 66 dB against 0° (56 dB on the loud ones)."],
  'A · Laser Sweep Shift': ['medium', "A · Laser Sweep with its source moved: a Daubechies 2 SAW through a 60 dB/band resonant low-pass at band 3, the position window at 0° (70 %), LFO 2 (saw, 6 Hz) moving the phase ±54°, the LFO on the cutoff, with drive and delay. SOURCE PHASE 56°: a harmonic changes by 34 dB against 0° (34 dB on the loud ones)."],
  'A · Warm Pad Shift': ['medium', "A · Warm Pad with its source moved: a Daubechies 2 SAW through a 36 dB/band low-pass at band 4, LFO 2 (sine, 0.07 Hz) moving the phase ±45°, the LFO on the cutoff, three unison copies, with delay and reverb. SOURCE PHASE 275°: a harmonic changes by 29 dB against 0° (8 dB on the loud ones)."],
  'A · Mirror Sub Bass Shift': ['medium', "B · Mirror Sub Bass rebuilt on engine A with its source moved: a Daubechies 2 SQUARE through a 74 dB/band resonant low-pass at band 2.9, the position window at 173° (50 %), an envelope sweep of the cutoff, vibrato, the LFO on the cutoff, two unison copies, mono, a sub oscillator, with delay and reverb. SOURCE PHASE 81°: a harmonic changes by 38 dB against 0° (5 dB on the loud ones)."],
  'A · Space Choir Shift': ['heavy', "B · Space Choir rebuilt on engine A with its source moved: a Daubechies 4 SAW through a 24 dB/band resonant band-pass at band 5, the position window at 0° (50 %), LFO 2 (sine, 0.1 Hz) moving the phase ±36°, four unison copies, with chorus and reverb. SOURCE PHASE 300°: a harmonic changes by 31 dB against 0° (25 dB on the loud ones)."],
  'A · Square Mod Shift': ['medium', "A · Square Mod (a preset of beta 0.4) with its source moved: a Haar SAW through a 24 dB/band resonant low-pass at band 3.1, vibrato, the LFO on the cutoff, three unison copies, with delay and reverb. SOURCE PHASE 67°: a harmonic changes by 29 dB against 0° (29 dB on the loud ones)."],
  'A · Wave Robot Shift': ['light', "A · Wave Robot with its source moved: a Haar SAW through a 24 dB/band resonant band-pass at band 5, WAVELET MORPH towards Daubechies 20, LFO 2 (sample-and-hold, 10 Hz) moving the phase ±63°, the LFO on the cutoff, with drive. SOURCE PHASE 354°: a harmonic changes by 52 dB against 0° (52 dB on the loud ones)."],
  'A · Wave Pulse Lead Shift': ['light', "A · Wave Pulse Lead with its source moved: a Coiflet 3 PULSE (20 %) through a 36 dB/band resonant low-pass at band 3, WAVELET MORPH towards Haar, vibrato, the LFO on the cutoff, mono with glide, with delay. SOURCE PHASE 36°: a harmonic changes by 35 dB against 0° (34 dB on the loud ones)."],
  'A · Noise Wash Pad Shift': ['heavy', "A · Noise Wash Pad with its source moved: a Daubechies 20 NOISE with SPARSITY 24 % through a 24 dB/band resonant band-pass at band 5, vibrato, the LFO on the cutoff, with reverb. SOURCE PHASE 185°: a harmonic changes by 25 dB against 0° (25 dB on the loud ones)."],
  'A · Solo Violin Shift': ['light', "A · Solo Violin (a preset of beta 0.4) with its source moved: a Symlet 8 SAW through a 13 dB/band resonant band-pass at band 3.8, WAVELET MORPH towards Haar, vibrato, the LFO on the cutoff, with reverb. SOURCE PHASE 11°: a harmonic changes by 19 dB against 0° (19 dB on the loud ones)."],
  'A · Siren Sweep Shift': ['medium', "A · Siren Sweep with its source moved: a Daubechies 4 SAW through a 24 dB/band resonant band-pass at band 6, vibrato, the LFO on the cutoff, a sub oscillator, with drive, delay and reverb. SOURCE PHASE 104°: a harmonic changes by 20 dB against 0° (19 dB on the loud ones)."],
  'A · Wave Riser Shift': ['medium', "A · Wave Riser with its source moved: a Daubechies 20 NOISE through a 24 dB/band resonant band-pass at band 5, WAVELET MORPH towards Haar, the LFO on the cutoff, two unison copies, with reverb. SOURCE PHASE 286°: a harmonic changes by 22 dB against 0° (22 dB on the loud ones)."],
  'A · Wave Laser Shift': ['medium', "A · Wave Laser (a preset of beta 0.4) with its source moved: a Daubechies 20 SAW through a 24 dB/band resonant low-pass at band 5, WAVELET MORPH towards Haar, vibrato, two unison copies, mono, a sub oscillator, with delay. SOURCE PHASE 191°: a harmonic changes by 10 dB against 0° (6 dB on the loud ones)."],
  'A · Flute Lead Shift': ['medium', "B · Flute Lead rebuilt on engine A with its source moved: a Daubechies 2 TRIANGLE with SPARSITY 40 % through a 42 dB/band low-pass at band 3, vibrato, mono with glide, with reverb. SOURCE PHASE 329°: a harmonic changes by 9 dB against 0° (6 dB on the loud ones)."],
  'A · Wave Window Lead Shift': ['light', "A · Wave Window Lead (a preset of beta 0.4) with its source moved: a Daubechies 8 SAW through a 36 dB/band resonant low-pass at band 2.5, the position window at 180° (100 %), WAVELET MORPH towards Haar, mono with glide, with delay. SOURCE PHASE 160°: a harmonic changes by 43 dB against 0° (26 dB on the loud ones)."],
  'A · Choir Pad Shift': ['heavy', "B · Choir Pad rebuilt on engine A with its source moved: a Daubechies 4 SAW through a 20 dB/band resonant band-pass at band 4.5, LFO 2 (sine, 0.2 Hz) moving the phase ±22°, vibrato, three unison copies, with chorus and reverb. SOURCE PHASE 11°: a harmonic changes by 23 dB against 0° (23 dB on the loud ones)."],
  'A · Glass Choir Shift': ['heavy', "AB · Glass Choir rebuilt on engine A with its source moved: a Daubechies 2 PULSE (30 %) through a 36 dB/band high-pass at band 2.5, two unison copies, with chorus and reverb. SOURCE PHASE 106°: a harmonic changes by 21 dB against 0° (21 dB on the loud ones)."],
  'A · Cello Section Shift': ['medium', "A · Cello Section with its source moved: a Daubechies 2 SAW through a 30 dB/band low-pass at band 4, vibrato, three unison copies, with chorus and reverb. SOURCE PHASE 143°: a harmonic changes by 19 dB against 0° (9 dB on the loud ones)."],
  'A · Shimmering Strings Shift': ['medium', "A · Shimmering Strings with its source moved: a Daubechies 2 SAW through a 36 dB/band low-pass at band 4.5, vibrato, the LFO on the cutoff, three unison copies, with chorus and reverb. SOURCE PHASE 320°: a harmonic changes by 20 dB against 0° (4 dB on the loud ones)."],
  'A · Acid Line Shift': ['medium', "A · Acid Line (a preset of beta 0.4) with its source moved: a Daubechies 4 SAW through a 24 dB/band resonant low-pass at band 2, an envelope sweep of the cutoff, LFO 2 (square, 2 Hz) moving the phase ±45°, with drive and delay. SOURCE PHASE 340°: a harmonic changes by 26 dB against 0° (25 dB on the loud ones)."],
  'A · Wave Wobble Bass Shift': ['light', "A · Wave Wobble Bass with its source moved: a Daubechies 20 SQUARE through a 24 dB/band resonant low-pass at band 3, WAVELET MORPH towards Haar, the LFO on the cutoff, mono, a sub oscillator, with drive. SOURCE PHASE 134°: a harmonic changes by 8 dB against 0° (8 dB on the loud ones)."],
  'A · Full Drawbar Organ Shift': ['medium', "B · Full Drawbar Organ rebuilt on engine A with its source moved: a Daubechies 2 SQUARE with SPARSITY 25 % through a 36 dB/band low-pass at band 4, vibrato, with drive, chorus and reverb. SOURCE PHASE 56°: a harmonic changes by 13 dB against 0° (13 dB on the loud ones)."],
  'A · Analog Brass Pad Shift': ['medium', "A · Analog Brass Pad with its source moved: a Daubechies 8 SAW through a 24 dB/band low-pass at band 3, an envelope sweep of the cutoff, three unison copies, with chorus and reverb. SOURCE PHASE 126°: a harmonic changes by 14 dB against 0° (14 dB on the loud ones)."],
  'A · Wave Morph Pad Shift': ['heavy', "A · Wave Morph Pad with its source moved: a Daubechies 2 SAW through a 36 dB/band resonant low-pass at band 3.5, WAVELET MORPH towards Haar, the LFO on the cutoff, three unison copies, with chorus and reverb. SOURCE PHASE 64°: a harmonic changes by 29 dB against 0° (23 dB on the loud ones)."],
  'A · Wave Atom Choir Shift': ['heavy', "AB · Wave Atom Choir rebuilt on engine A with its source moved: a Haar PULSE (35 %) through a 42 dB/band low-pass at band 3, the position window at 0° (40 %), WAVELET MORPH towards Symlet 8, an envelope sweep of the cutoff, vibrato, the LFO on the cutoff, three unison copies, with chorus and reverb. SOURCE PHASE 289°: a harmonic changes by 26 dB against 0° (26 dB on the loud ones)."],
  'A · Ensemble Strings Shift': ['heavy', "A · Ensemble Strings with its source moved: a Daubechies 2 SAW through a 36 dB/band low-pass at band 4.5, three unison copies, with chorus and reverb. SOURCE PHASE 320°: a harmonic changes by 20 dB against 0° (4 dB on the loud ones)."],
  'A · Phase Wobble Bass': ['light', "The wobble is the phase, not the filter: LFO 2 (triangle, 3 Hz) swings the source ±90° under a fixed resonant low-pass. A Daubechies 2 SQUARE through a 36 dB/band resonant low-pass at band 3.5, LFO 2 (triangle, 3 Hz) moving the phase ±90°, mono, a sub oscillator, with drive. SOURCE PHASE 149°: a harmonic changes by 19 dB against 0° (19 dB on the loud ones)."],
  'A · Window Phase Lead': ['light', "A Daubechies 2 SAW through a 36 dB/band resonant low-pass at band 3, the position window at 90° (100 %), mono with glide, with delay. SOURCE PHASE 241°: a harmonic changes by 42 dB against 0° (42 dB on the loud ones)."],
  'A · Pipe Phase': ['medium', "A Daubechies 4 SQUARE with SPARSITY 45 % through a 30 dB/band low-pass at band 4, with reverb. SOURCE PHASE 36°: a harmonic changes by 81 dB against 0° (11 dB on the loud ones)."],
  'A · Phase Drift Pad': ['heavy', "A pad whose only movement is the source phase drifting round the whole cycle (LFO 2, triangle, 0.06 Hz): every few seconds another colour. A Daubechies 2 SAW through a 24 dB/band resonant low-pass at band 4.5, LFO 2 (triangle, 0.06 Hz) moving the phase ±180°, three unison copies, with chorus and reverb. SOURCE PHASE 275°: a harmonic changes by 17 dB against 0° (17 dB on the loud ones)."],
  'A · Dawn Phase': ['heavy', "A Daubechies 4 PULSE (40 %) through a 24 dB/band resonant low-pass at band 3.5, an envelope sweep of the cutoff, two unison copies, with delay and reverb. SOURCE PHASE 281°: a harmonic changes by 22 dB against 0° (6 dB on the loud ones)."],
  'A · Shifted Strings Pad': ['heavy', "A Daubechies 2 SAW through a 36 dB/band low-pass at band 4, three unison copies, with chorus and reverb. SOURCE PHASE 143°: a harmonic changes by 29 dB against 0° (12 dB on the loud ones)."],
  'A · Noise Phase Pad': ['heavy', "A Daubechies 2 NOISE with SPARSITY 50 % through a 24 dB/band resonant band-pass at band 5, the LFO on the cutoff, with reverb. SOURCE PHASE 53°: a harmonic changes by 30 dB against 0° (29 dB on the loud ones)."],
  'A · Phase Glass Pad': ['heavy', "A Daubechies 2 TRIANGLE through a 24 dB/band resonant high-pass at band 2.2, three unison copies, with chorus and reverb. SOURCE PHASE 42°: a harmonic changes by 15 dB against 0° (15 dB on the loud ones)."],
  'A · Dark Phase Pad': ['medium', "A Daubechies 4 SQUARE through a 30 dB/band low-pass at band 3, LFO 2 (sine, 0.09 Hz) moving the phase ±54°, three unison copies, a sub oscillator, with reverb. SOURCE PHASE 165°: a harmonic changes by 7 dB against 0° (5 dB on the loud ones)."],
  'A · Phase Ensemble': ['heavy', "A Daubechies 2 SAW through a 36 dB/band low-pass at band 4.2, three unison copies, with chorus and reverb. SOURCE PHASE 230°: a harmonic changes by 24 dB against 0° (8 dB on the loud ones)."],
  'A · Phase Tremolo Strings': ['medium', "A Daubechies 2 SAW through a 36 dB/band low-pass at band 4, LFO 2 (triangle, 6 Hz) moving the phase ±36°, three unison copies, with chorus and reverb. SOURCE PHASE 143°: a harmonic changes by 29 dB against 0° (12 dB on the loud ones)."],
  'A · Shifted Horns': ['medium', "A Daubechies 2 SAW through a 30 dB/band low-pass at band 3, an envelope sweep of the cutoff, vibrato, two unison copies, with chorus and reverb. SOURCE PHASE 104°: a harmonic changes by 30 dB against 0° (30 dB on the loud ones)."],
  'A · Phase Stab': ['medium', "A Haar SAW through a 36 dB/band resonant low-pass at band 4, an envelope sweep of the cutoff, three unison copies, with delay and reverb. SOURCE PHASE 78°: a harmonic changes by 26 dB against 0° (26 dB on the loud ones)."],
  'A · Phase Clarinet': ['light', "A Daubechies 4 SQUARE through a 30 dB/band low-pass at band 4, vibrato, mono with glide, with reverb. SOURCE PHASE 36°: a harmonic changes by 10 dB against 0° (7 dB on the loud ones)."],
  'A · Phase Scanner': ['medium', "LFO 2 sweeps the source through the whole cycle (saw, 0.25 Hz): the resonant band-pass meets ever other atoms, a slow scan of timbres with no filter movement at all. A Haar SAW through a 24 dB/band resonant band-pass at band 5.5, LFO 2 (saw, 0.25 Hz) moving the phase ±180°, with delay and reverb. SOURCE PHASE 157°: a harmonic changes by 86 dB against 0° (68 dB on the loud ones)."],
  'A · Phase Glitch': ['medium', "Sample-and-hold LFO 2 jumps the phase 14 times a second on a sparse Haar square: computer chatter. A Haar SQUARE with SPARSITY 50 % through a 24 dB/band resonant low-pass at band 5, LFO 2 (sample-and-hold, 14 Hz) moving the phase ±144°, with delay. SOURCE PHASE 64°: a harmonic changes by 93 dB against 0° (63 dB on the loud ones)."],
};
const presetCount = SPEC.PRESETS.filter(p => p.values[C.P.engine] === 0).length;
const presets = `<p>${presetCount} factory presets show what engine A can do, from clean sounds to extreme effects. Load one, play, then look at the panel to see how it is made — the table lists every setting that differs from the defaults. In the instrument’s preset menu OktoPierre’s favourite sounds come first, then all the presets by category (bass, lead, keys, organ, pad, strings, brass &amp; wind, pluck, bells &amp; mallets, FX, drums &amp; percussion, then the <a href="#phase">Source Phase</a> section of beta 0.4). This table lists, category by category, the presets that open on engine A’s panel (★ = one of OktoPierre’s favourites), including the “AB · …” presets that mix both engines (their settings show both engines). The drum and percussion presets are pitched: play them on different keys. The <b>Effects</b> column rates how much each preset relies on effects and movement (delay, reverb, saturation, unison, LFO, sub oscillator): <span class="fxl fxl-none">none</span> <span class="fxl fxl-light">light</span> <span class="fxl fxl-medium">medium</span> <span class="fxl fxl-heavy">heavy</span> <span class="fxl fxl-extreme">extreme</span>.</p>
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
  { id: 'mix', title: 'Mixing engines A and B', html: S.mixSection(E) },
  { id: 'chorus', title: 'Chorus (string machine)', html: S.chorusSection(E) },
  { id: 'effects', num: '10', title: 'Effects and master', html: S.fxSection(E) },
  { id: 'displays', num: '11', title: 'Displays', html: S.displaysSection(E) },
  { id: 'recipes', num: '12', title: 'Sound-design recipes', html: recipes, subs: [{ id: 'r-sweep', title: 'Classic sweep' }, { id: 'r-decimator', title: 'Pitch-locked decimator' }, { id: 'r-edge', title: 'Edge pluck' }, { id: 'r-sparse', title: 'Lossy keys' }, { id: 'r-brass', title: 'Noise brass' }, { id: 'r-scan', title: 'Scanning edge' }, { id: 'r-notch', title: 'Octave notch phaser' }, { id: 'r-bass', title: 'Expressive mono bass' }, { id: 'r-legato', title: 'Expressive legato lead' }, { id: 'r-polyglide', title: 'Polyphonic glide pad' }, { id: 'r-sub', title: 'Infra sub bass' }] },
  { id: 'presets', num: '13', title: 'Factory presets', html: presets, subs: [{ id: 'saving', title: 'Browsing and saving' }] },
  { id: 'playing', num: '14', title: 'Playing', html: S.playingSection(E), subs: [{ id: 'demo', title: 'Demo' }, { id: 'demo-tour', title: 'Default demo: preset tour' }, { id: 'kbd-screen', title: 'On-screen keyboard' }, { id: 'kbd-computer', title: 'Computer keyboard' }, { id: 'midi', title: 'MIDI' }, { id: 'poly', title: 'Polyphony, mono, glide' }] },
  { id: 'vst', num: '15', title: 'The VST3 plugin in Live', html: S.vstSection(E), subs: [{ id: 'vst-install', title: 'Installation' }, { id: 'vst-diff', title: 'Differences' }, { id: 'automation', title: 'Automation' }] },
  { id: 'trouble', num: '16', title: 'Tips & troubleshooting', html: S.troubleshooting(E, extraTrouble) },
  { id: 'glossary', title: 'Glossary', html: S.glossary(E) },
  { id: 'about', title: 'About & release history', html: S.aboutSection(E), subs: [{ id: 'acknowledgments', title: 'Acknowledgments' }, { id: 'release-history', title: 'Release history' }] },
];

const footer = `<footer class="foot"><span>Wavelet Synthesizer · Manual A — Engine A · Wavelet Subtractive</span><span>${SPEC.APP.name} — ${SPEC.APP.credit} (${SPEC.APP.author}). Version ${SPEC.APP.version} (${SPEC.APP.date}). ${SPEC.APP.copyright}. Free software under the GNU General Public License v3 or later, without any warranty.</span><a href="manual-b.html">Manual B — Engine B · Wavelet Additive →</a></footer>`;

module.exports = {
  engine: E,
  title: 'Engine A · Wavelet Subtractive — Wavelet Synthesizer manual',
  description: 'User manual for engine A (wavelet subtractive) of the Wavelet Synthesizer web app and VST3 plugin.',
  hero, sections, footer,
};
