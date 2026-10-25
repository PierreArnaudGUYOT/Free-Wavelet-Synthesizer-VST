// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Manual B — Engine B · Wavelet Additive
'use strict';
const L = require('./lib.js');
const S = require('./shared.js');
const { ctl, kbd, P, controls, table, tip, note, warn, deep, fig, figInline, annotated, C, SPEC } = L;
const E = 'b';

// ---------------------------------------------------------------- hero
const hero = `<header class="hero">
<p class="eyebrow">WAVELET SYNTHESIZER · USER MANUAL B</p>
<h1><span class="tag">ENGINE B</span>Wavelet Additive</h1>
<p class="lead">Engine B builds sounds the other way round. Instead of starting from a waveform and taking detail away, you write the detail directly. An ATOM PATTERN decides the sign — and for RANDOM, the size — of every one of the 2047 atoms that make up a waveform cycle; the WAVELET gives those atoms their shape; eleven DRAWBARS set the level of each band, one octave of harmonics each, like the drawbars of an organ; and a SCALE ENVELOPE gives every band its own attack and decay, so the fine detail can bloom later or die sooner than the body of the sound. The shared SCALE FILTER, POSITION window, envelopes, LFO, voice and effects sections then shape the result.</p>
<div class="hero-meta"><span class="pill">For the web app and the VST3 plugin for Ableton Live (Windows)</span><span class="pill">Version ${SPEC.APP.version} · ${SPEC.APP.date}</span><a class="pill other-a" href="manual-a.html">Engine A · Wavelet Subtractive — read Manual A</a></div>
</header>`;

// ---------------------------------------------------------------- 1. idea
const idea = `<h3 id="fourier">Partials versus atoms</h3>
<p>Classic <b>additive synthesis</b> builds a sound from sine waves: one oscillator per harmonic, each with its own level and envelope. It is powerful but laborious — a bright tone needs dozens of partials — and every partial lasts for the whole cycle, so there is no way to say <em>where</em> in the waveform something happens.</p>
<p>Engine B adds up <b>wavelet atoms</b> instead. An atom is a short wiggle of a fixed shape — the wavelet — and atoms come in sizes an octave apart: one atom spanning the whole cycle, two spanning half of it each, then four, eight … down to 1024 tiny atoms spaced two samples apart. All atoms of one size form a <b>band</b>, and each band covers about one octave of harmonics. Instead of setting dozens of sine levels you set eleven band levels, and the pattern of the atoms inside each band decides the waveform.</p>
${figInline('tiling-b', '<b>Figure 1.</b> Left: in the Fourier view each harmonic spans the whole cycle. Right: the grid of atoms of one cycle — 11 bands, from one atom in band 1 to 1024 in band 11. The panel’s SCALOGRAM draws this grid live, with the brightness of each atom.')}
<ul>
<li>One cycle = 2048 samples = 2047 atoms (1 + 2 + 4 + … + 1024) in 11 bands.</li>
<li>Band <i>b</i> has 2<sup><i>b</i>−1</sup> atoms. Band 1 is about the fundamental, band 2 the 2nd harmonic, band 3 harmonics 3–4, band 4 harmonics 5–8 … each band is about <b>one octave of harmonics</b>.</li>
<li>The <b>ATOM PATTERN</b> sets the sign (and for RANDOM the size) of every atom, the <b>WAVELET</b> sets their shape, and the <b>DRAWBARS</b>, <b>TILT</b>, <b>SCALE ENVELOPE</b> and <b>SCALE FILTER</b> set the level of each band.</li>
</ul>
<p>Engine B turns each band into its own waveform layer, scales it so that its peak is exactly 1, and mixes the 11 layers at audio rate with the band levels you set.</p>

<h3 id="bands">Where the bands are</h3>
<p>The cycle is played back at the pitch of each note (it is <em>pitch-synchronous</em>), so the bands are relative to the note: band 4 is always about harmonics 5–8, whatever key you press. In hertz, the bands move with the note:</p>
${S.bandMap(E)}
<p>To keep high notes free of aliasing, each band layer is stored in eleven band-limited versions, one per octave, and every note uses the version whose harmonics stay below the sample rate minus 19 kHz (about 25 kHz at 44.1 kHz, 29 kHz at 48 kHz) — anything that folds back lands above 19 kHz. The consequence is musical: <b>the finest bands only exist on low notes</b>. Every octave down adds one band. At 48 kHz, band 7 is the highest band played for notes from about A♯3 to A4, band 8 an octave lower, band 9 two octaves lower; band 10 needs notes below about 57 Hz and band 11 below 28 Hz. (At 44.1 kHz the limits are about a whole tone lower.)</p>
${tip('<p>The drawbars follow the same rule. At middle C only drawbars 1–7 are heard; drawbars 8–11 add detail to bass notes only. When you build a registration, play it across the keyboard.</p>')}

<h3 id="wavelets">The wavelet chooses the atom</h3>
<p>The ${ctl('WAVELET')} selector (shared by both engines) decides what the atoms look like — and in engine B, the colour of every band. Seven classic wavelets are available, from the 2-tap Haar step to the 40-tap Daubechies 20:</p>
${fig('atoms-b.svg', '<b>Figure 2.</b> One atom of each wavelet, as drawn by the ATOM SHAPE display. “Taps” is the length of the wavelet filter.')}
${S.waveletTable(E)}
<p>Short wavelets are precise in time — clicks stay sharp, the POSITION window has crisp borders — but each band also spills into its neighbouring octaves. Long wavelets keep every band within its octave: with the RAMP pattern a Daubechies 20 band is practically a single sine.</p>

<h3 id="flow">Signal flow</h3>
${figInline('flow-b', '<b>Figure 3.</b> Engine B, from atom pattern to output. Amber boxes are the wavelet-specific stages.')}
<ul>
<li><b>Table building</b> happens only when you change ${P('b_pattern')}, ${P('b_seed')} or ${P('wavelet')}: the pattern writes the atoms, an inverse wavelet transform turns each band into a waveform layer, and each layer is normalised to a peak of 1. The switch to new tables is crossfaded, so you can change these controls while playing.</li>
<li><b>Every voice</b> plays the 11 layers at its own pitch and mixes them with gains made of the drawbar level, the TILT, the band’s SCALE ENVELOPE and the SCALE FILTER. The POSITION window can then restrict bands 2–11 to part of the cycle.</li>
<li><b>All voices</b> are summed and pass through the saturation, delay and reverb, a DC blocker, the master volume and a soft limiter that keeps the output below 0 dBFS.</li>
</ul>

<div class="callout feature" id="saw-from-squares"><span class="ttl">A BEAUTIFUL CONSEQUENCE</span>
<h3>A sawtooth built from square waves</h3>
<p>With the Haar wavelet and the ${ctl('RAMP')} pattern every band is a square wave: band 1 at the fundamental, band 2 at twice that frequency, band 3 at four times … each one twice as fast as the one below. Now set ${P('b_tilt')} to −6 dB per band, which halves the level from one band to the next. Squares whose frequency doubles while their level halves add up to a <b>staircase</b> that gets finer with every band — and converges to a perfect <b>sawtooth</b>. The −6 dB per octave of the tilt is exactly the 1/<i>n</i> law of a sawtooth’s harmonics: measured over the first 16 harmonics, the full eleven-band staircase matches a sawtooth to within a fraction of a decibel.</p>
<p>That is the preset <b>B · Init</b>. Pull the drawbars down from the right and the steps get coarser; drawbar 1 alone is a plain square wave.</p>
${fig('staircase-b.svg', '<b>Figure 4.</b> Haar + RAMP + TILT −6 dB/band with more and more drawbars up (computed with the instrument’s own code). Each added band doubles the number of steps.')}
</div>`;

// ---------------------------------------------------------------- 3. panel tour
const pins = [
  { x: 218, y: 8, title: '▶ DEMO ▾ (web app)', desc: '▶ DEMO plays the default demo, a tour of the presets; ▾ opens the list of demo pieces.', href: 'demo' },
  { x: 286, y: 5, title: 'ENGINE', desc: 'switches between engine A (teal) and engine B (amber).', href: 'header-controls' },
  { x: 562, y: 5, title: 'Preset browser', desc: '◀ ▶ step through the presets; click the name for the list.', href: 'saving' },
  { x: 872, y: 5, title: 'MANUAL A / B', desc: 'open the engine A manual or this one.', href: 'header-controls' },
  { x: 1024, y: 2, title: 'VOLUME and meter', desc: 'master level and stereo peak meter.', href: 'effects' },
  { x: 13, y: 102, title: 'PATTERN', desc: 'writes the signs (or random values) of all atoms.', href: 'patterns' },
  { x: 13, y: 172, title: 'DRAWBARS 1–11', desc: 'the level of each band, coarse (1) to fine (11).', href: 'drawbars' },
  { x: 13, y: 268, title: 'SCALE ENVELOPE', desc: 'ATTACK, SPREAD, BODY, BRIGHT and SUSTAIN for the bands.', href: 'scale-env' },
  { x: 361, y: 146, title: 'ATOM SHAPE', desc: 'one atom of the selected wavelet.', href: 'wavelets' },
  { x: 361, y: 210, title: 'WAVELET', desc: 'chooses the atom shape (seven wavelets).', href: 'wavelets' },
  { x: 365, y: 262, title: 'TILT', desc: 'a dB-per-band slope across the drawbars.', href: 'drawbars' },
  { x: 443, y: 262, title: 'SEED', desc: 'picks the random pattern (RANDOM only).', href: 'patterns' },
  { x: 568, y: 104, title: 'SCOPE', desc: 'one cycle of the sound; shaded area = window.', href: 'displays' },
  { x: 568, y: 216, title: 'SCALOGRAM', desc: 'the atoms of the 11 bands; dashed line = window.', href: 'displays' },
  { x: 130, y: 337, title: 'SCALE FILTER', desc: 'a modulatable per-band filter on top of the drawbars.', href: 'filter' },
  { x: 451, y: 337, title: 'POSITION', desc: 'lets the detail sound only in part of the cycle.', href: 'position' },
  { x: 675, y: 337, title: 'AMP ENVELOPE', desc: 'loudness ADSR and velocity sensitivity.', href: 'amp-env' },
  { x: 969, y: 337, title: 'MOD ENVELOPE', desc: 'ADSR that moves the filter cutoff.', href: 'mod-env' },
  { x: 70, y: 485, title: 'LFO', desc: 'one global LFO for pitch, cutoff and position.', href: 'lfo' },
  { x: 376, y: 485, title: 'VOICE', desc: 'portamento mode, octave, tuning, polyphony, glide and unison, with voice LEDs.', href: 'voice' },
  { x: 785, y: 485, title: 'EFFECTS', desc: 'saturation, ping-pong delay and reverb.', href: 'effects' },
  { x: 8, y: 616, title: 'Wheels', desc: 'pitch bend and modulation (vibrato).', href: 'kbd-screen' },
  { x: 169, y: 633, title: 'SUB OSC', desc: 'LEVEL, OCT and SHAPE of the sub oscillator.', href: 'sub' },
  { x: 212, y: 616, title: 'Keyboard', desc: 'five octaves; click lower on a key to play louder.', href: 'kbd-screen' },
  { x: 2, y: 751, title: 'Status bar (web app)', desc: 'audio and MIDI status, key help, Save preset / Export / Import.', href: 'saving' },
];
const ann = annotated('panel-b.png', 'The whole instrument in engine B mode, showing the B · Random Glass preset', pins);
const panel = `<p>The panel is the same in the web app and the plugin. In engine B mode the accent colour is amber and the upper-left section shows the ENGINE B controls. The screenshot shows the factory preset <b>B · Random Glass</b>; click a number to jump to its description.</p>
<figure>${ann.image}<figcaption>The web app in engine B mode. The status bar at the bottom exists only in the web app.</figcaption></figure>
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

// ---------------------------------------------------------------- 4. engine B controls
const engRows = [
  ['b_pattern', 'Writes every atom of the 11 bands — see <a href="#patterns">Atom patterns</a>.', 'The pattern sets the harmonic structure; the drawbars set the balance.'],
  ['b_seed', `Chooses one of 100 repeatable random patterns. Only active with ${ctl('RANDOM')} (greyed out otherwise).`, 'Hover and roll the mouse wheel to audition seeds one by one.'],
  [{ key: 'wavelet', range: 'Haar · DB2 · DB4 · DB8 · Sym8 · Coif3 · DB20' }, 'The shape of the atoms — see <a href="#wavelets">The wavelet chooses the atom</a>. Shared with engine A.', 'Haar = square-wave bands; Daubechies 20 = sine-like bands.'],
  [{ key: 'b_bar1', label: '1 … 11', range: '0 – 100 % each', def: '100 %', host: 'Band 1 Level … Band 11 Level' }, 'The eleven drawbars: the level of each band, from band 1 (the fundamental, left) to band 11 (the finest atoms, right).', 'Drag vertically or use the mouse wheel; double-click resets a drawbar to 100 %.'],
  ['b_tilt', 'A slope across the drawbars: band <i>b</i> gets TILT × (<i>b</i> − 1) dB extra. 0 = flat; −6 dB/band halves the level from band to band (the sawtooth law); positive values favour the fine bands.', '−3 for bright, −9 to −12 for mellow sounds.'],
  ['b_atk', 'Attack time of the SCALE ENVELOPE for the middle band (band 6). SPREAD derives the other bands’ attack times from it.', ''],
  ['b_spread', 'Spreads the attack times over the bands. Positive values make the fine bands slower (detail arrives last), negative values make them faster. At ±100 % band 11 takes 4 × / ¼ × ATTACK and band 1 the opposite.', '+50 to +100 % for pads that “open” without a filter.'],
  ['b_body', 'Decay time of band 1 — the body of the sound.', 'Longer than BRIGHT for natural plucks and bells.'],
  ['b_bright', 'Decay time of band 11 — the finest detail. Bands in between get decay times spaced evenly between BODY and BRIGHT on a logarithmic scale.', '0.05–0.5 s for strikes and plucks.'],
  ['b_sus', 'The level all bands decay to and hold while the key is down. 100 % = no decay at all.', 'With 0 % the note fades even while held.'],
];
const patternRows = [
  [ctl('RAMP'), 'Every atom +1.', 'Each band repeats its atom over and over, so it sounds at exactly one harmonic: band <i>b</i> at harmonic 2<sup><i>b</i>−1</sup> (1, 2, 4, 8 …). With long wavelets these are almost pure sines — octave drawbars; with Haar they are square waves.'],
  [ctl('MIRROR'), 'Band 1: +1. Other bands: first half of the atoms +1, second half −1.', 'The second half of the cycle becomes an upside-down copy of the first, which cancels every even harmonic: hollow, square- and clarinet-like tones.'],
  [ctl('ALT'), 'The sign alternates from band to band: bands 1, 3, 5 … +1, bands 2, 4, 6 … −1.', 'The same harmonic levels as RAMP with different phases. A steady tone sounds very close to RAMP, but the waveform differs — which you hear as soon as the POSITION window cuts into the cycle.'],
  [ctl('WALSH'), 'Inside each band the atoms alternate +1, −1, +1 …', 'Each band repeats only every two atoms, so it sounds an octave lower than with RAMP — band <i>b</i> at harmonic 2<sup><i>b</i>−2</sup>; bands 1 and 2 both land on the fundamental. With Haar the bands are Walsh functions, the square-wave building blocks of early digital synthesis: hollow, buzzy chip-tune timbres.'],
  [ctl('IMPULSE'), 'Only the first atom of each band is on.', 'All the detail sits at the very start of the cycle: a click at the beginning of every period, on top of band 1. Rich in every harmonic — bright, nasal, buzzy; ideal for plucks. Since every band is normalised to peak 1, the tiny fine atoms are as loud as the big ones: tame the click with TILT or a short BRIGHT.'],
  [ctl('RANDOM'), 'Every atom gets a random value between −1 and +1; SEED (0–99) picks the set.', 'All harmonics in an irregular mix: glassy, vocal or metallic depending on wavelet and drawbars. Each seed is a different timbre, and the same seed always gives the same one.'],
];
const engineB = `<p>The ENGINE B section is where the sound is built: choose an atom pattern and a wavelet, balance the bands with the drawbars and TILT, and give the bands their own time behaviour with the SCALE ENVELOPE.</p>
${controls(engRows)}
<h3 id="patterns">Atom patterns</h3>
<p>The ${ctl('PATTERN')} buttons fill the 2047 atoms with one of six recipes. The pattern decides <em>which</em> harmonics each band contains and how they line up in time; the wavelet decides how sharp or smooth each atom is.</p>
${fig('patterns-b.svg', '<b>Figure 5.</b> The six patterns. Left: the signs of the atoms in bands 1–6 (the finer bands continue the same rule). Right: the resulting cycle with TILT −6 dB/band and all drawbars up, for Haar and for Daubechies 8 — computed with the instrument’s own code.')}
${table(['Pattern', 'Atoms', 'Sound'], patternRows, 'compact')}
${note('<p>After the transform, every band layer is scaled so that its peak is exactly 1. A drawbar at 100 % therefore always means “this band at full scale”, whatever the pattern, and the patterns differ in tone colour rather than in level.</p>')}

<h3 id="drawbars">Drawbars and tilt</h3>
<p>The eleven drawbars set the level of each band, much like the drawbars of a tonewheel organ — except that each drawbar is a whole octave of harmonics rather than a single sine. With the ${ctl('RAMP')} pattern and a long wavelet they really are octave-pitched organ drawbars:</p>
${table(['Drawbar', '1', '2', '3', '4', '5', '6', '7'], [
  ['RAMP partial', 'fundamental', '2nd', '4th', '8th', '16th', '32nd', '64th'],
  ['Organ footage', '8′', '4′', '2′', '1′', '½′', '¼′', '⅛′'],
], 'compact num')}
<p class="small muted">There are no fifths or thirds (the 5⅓′, 2⅔′, 1⅗′ and 1⅓′ drawbars of a tonewheel organ), because every band is an octave. With Haar, each band is a square wave and adds its odd multiples — a reedier sound.</p>
${fig('organ.png', '<b>B · Octave Organ:</b> Daubechies 20 + RAMP, drawbars 100/80/60/70/30/50/20 % and the rest down. The SCALOGRAM shows the seven active bands.', 'shot')}
<p><b>TILT</b> adds a slope across the drawbars: band 1 is the reference and every band above gets TILT dB more (or less) than the one below. At −6 dB/band the level halves from band to band; at 0 all drawbars count equally; positive values brighten the sound and are best used sparingly (+1 to +3), because at +12 dB/band band 11 would be 120 dB above band 1.</p>
<p><b>Level normalisation.</b> To keep the output out of clipping, the mix is divided by the sum of the drawbar levels (after TILT) whenever that sum is above 1. With TILT −6 dB/band and all drawbars up the sum is about 2; with TILT 0 and all drawbars up it is 11, so each band plays at 1/11 of full scale. Two consequences: pulling one drawbar down makes the others a little louder, so the overall level stays similar; and a flat, all-up registration is quieter than you might expect — raise VOLUME or use a negative TILT.</p>
${deep('<div class="formula">gain(b) = DRAWBAR(b) × 10^(TILT × (b − 1) / 20) × scale envelope(b) × filter(b) ÷ max(1, Σ DRAWBAR × 10^(TILT × (b − 1) / 20))</div><p>The scale envelope and the SCALE FILTER are not part of the divisor, so they make the sound quieter and darker exactly as you would expect.</p>')}

<h3 id="scale-env">Scale envelope</h3>
<p>The SCALE ENVELOPE gives every band its own envelope. When a note starts, all bands begin at zero and rise linearly to full level, each in its own attack time; then each decays exponentially, at its own speed, towards ${P('b_sus')}, where it stays while the key is held. There is no separate release: when you let go, the AMP ENVELOPE fades the whole sound while the bands keep moving towards SUSTAIN.</p>
${fig('scaleenv-b.svg', '<b>Figure 6.</b> Levels of five bands over time, simulated with the instrument’s own envelope code. Left: a long ATTACK spread over the bands — band 1 is there after 0.4 s, band 11 after 6 s. Right: per-band decays — the finest band is gone in 0.4 s while band 1 rings for 3 s.')}
<ul>
<li><b>ATTACK and SPREAD.</b> Band <i>b</i> rises in ATTACK × 16<sup>SPREAD × (t − ½)</sup>, where t runs from 0 for band 1 to 1 for band 11. At SPREAD 0 all bands rise together in ATTACK. At +100 % band 1 takes ATTACK ÷ 4, band 6 ATTACK and band 11 ATTACK × 4: the sound opens as the detail arrives. At −100 % the detail comes first and the body follows.</li>
<li><b>BODY and BRIGHT.</b> Band 1 decays with BODY, band 11 with BRIGHT, and the bands in between are spaced evenly on a logarithmic scale. With BODY 3 s and BRIGHT 0.4 s: band 1 3.0 s, band 3 2.0 s, band 6 1.1 s, band 9 0.6 s, band 11 0.4 s. Times are measured to −60 dB of the distance to SUSTAIN.</li>
<li><b>SUSTAIN</b> is the level every band settles at; 100 % means no decay at all.</li>
<li>The defaults — ATTACK 5 ms, SPREAD 0 %, BODY and BRIGHT 20 s, SUSTAIN 100 % — make the scale envelope practically neutral: a 5 ms fade-in.</li>
<li>Real strings, bells and plucked sounds lose their upper harmonics faster than their fundamental. A BRIGHT time shorter than BODY reproduces exactly that, and is why engine B plucks and bells sound physically plausible.</li>
<li>A note played legato in mono mode does not restart the scale envelope; a voice that is re-triggered while still sounding restarts its attacks from the current band levels.</li>
<li>The SCOPE and SCALOGRAM follow the scale envelope live while you play.</li>
</ul>`;

// ---------------------------------------------------------------- 12. recipes
function recipe(id, title, from, steps, listen) {
  return `<article class="recipe" id="${id}"><header><h3>${title}</h3><span class="from">${from}</span></header><div class="body"><ol class="steps">${steps.map(s => `<li>${s}</li>`).join('')}</ol><p class="listen">${listen}</p></div></article>`;
}
const recipes = `<p>Each recipe starts from a factory preset and uses only the controls on the panel. Values are what the panel shows when you hover over a control.</p>
${recipe('r-organ', 'Drawbar organ', 'Start from: B · Octave Organ (or B · Init)', [
  `${P('b_pattern')} ${ctl('RAMP')}, ${P('wavelet')} Daubechies 20, ${P('b_tilt')} 0 dB/band.`,
  'Drawbars 1–7 at 100, 80, 60, 70, 30, 50 and 20 %; drawbars 8–11 at 0 %.',
  'AMP ENVELOPE: ATTACK 10 ms, DECAY 100 ms, SUSTAIN 100 %, RELEASE 80 ms.',
  `LFO: ${ctl('SINE')}, ${P('lfo_rate')} 6 Hz, ${P('lfo_pitch')} 6 cents — or leave PITCH at 0 and use the mod wheel. ${P('fx_rmix')} 20 %.`,
  `For a percussion accent: ${P('b_sus')} 60 %, ${P('b_body')} 20 s, ${P('b_bright')} 250 ms — the upper bands start loud and settle quickly, the body stays.`,
], `<b>Try next:</b> Haar turns every band into a square wave for a reedy organ; ${ctl('WALSH')} gives a hollow combo-organ colour.`)}
${recipe('r-chip', 'Chip-tune Walsh lead', 'Start from: B · Chip Walsh', [
  `${P('b_pattern')} ${ctl('WALSH')}, ${P('wavelet')} Haar, ${P('b_tilt')} 0 dB/band.`,
  'Drawbars: 1 at 100 %, 2 at 50 %, 3 at 70 %, 5 at 40 %, all others at 0 %.',
  `AMP ENVELOPE: ATTACK 1 ms, DECAY 200 ms, SUSTAIN 60 %, RELEASE 50 ms. ${ctl('VOLUME')} −6 dB.`,
  `${P('v_voices')} 1 and ${P('v_glide')} 30 ms for chip-style slides.`,
  `For a fast trill: LFO ${ctl('SQR')}, ${P('lfo_rate')} 12 Hz, ${P('lfo_pitch')} 50 cents (the pitch flips between −50 and +50 cents).`,
], `<b>Try next:</b> move drawbars 2 and 3 to change the Walsh “duty cycle”; add ${P('fx_drive')} 20 %.`)}
${recipe('r-bell', 'Bell with per-band decays', 'Start from: B · Walsh Bells', [
  `${P('b_pattern')} ${ctl('WALSH')}, ${P('wavelet')} Symlet 8, ${P('b_tilt')} −3 dB/band.`,
  `SCALE ENVELOPE: ${P('b_atk')} 2 ms, ${P('b_spread')} 0 %, ${P('b_body')} 3 s, ${P('b_bright')} 0.4 s, ${P('b_sus')} 0 %.`,
  'AMP ENVELOPE: DECAY 4 s, SUSTAIN 0 %, RELEASE 2 s.',
  `${P('fx_rmix')} 35 %.`,
  'Play in the upper octaves: the bright strike fades within half a second while the body rings on.',
], `<b>Try next:</b> ${ctl('RANDOM')} (try several SEEDs) for less regular, glassier bells; ${P('b_bright')} 0.1 s for a marimba-like strike.`)}
${recipe('r-swell', 'Swelling pad with SPREAD', 'Start from: B · Mirror Pad', [
  `${P('b_pattern')} ${ctl('MIRROR')}, ${P('wavelet')} Daubechies 20, ${P('b_tilt')} −5 dB/band.`,
  `SCALE ENVELOPE: ${P('b_atk')} 1.5 s, ${P('b_spread')} +100 %, ${P('b_body')} and ${P('b_bright')} 20 s, ${P('b_sus')} 100 %.`,
  'AMP ENVELOPE: ATTACK 1 s, SUSTAIN 100 %, RELEASE 2 s.',
  `${P('v_unison')} 4, ${P('v_detune')} 18 cents, ${P('v_width')} 70 %. ${P('fx_rmix')} 50 %, ${ctl('VOLUME')} −6 dB.`,
  'Hold a chord: the body is there after about 0.4 s, the finest bands only after 6 s — the pad opens slowly without any filter.',
], `<b>Try next:</b> ${P('b_spread')} −100 %: detail first, body last — a reversed, breathy swell.`)}
${recipe('r-pluck', 'Impulse pluck', 'Start from: B · Impulse Pluck', [
  `${P('b_pattern')} ${ctl('IMPULSE')}, ${P('wavelet')} Daubechies 4, ${P('b_tilt')} −2 dB/band.`,
  `SCALE ENVELOPE: ${P('b_atk')} 5 ms, ${P('b_body')} 1.2 s, ${P('b_bright')} 80 ms, ${P('b_sus')} 0 %.`,
  'AMP ENVELOPE: ATTACK 1 ms, DECAY 1.5 s, SUSTAIN 0 %, RELEASE 500 ms.',
  `${P('fx_dmix')} 20 %.`,
  'Play: a bright click that turns into a rounder tone within a fraction of a second, like a plucked string.',
], `<b>Try next:</b> Haar for harpsichord bite, Daubechies 20 for a softer pluck; ${P('f_cutoff')} 7 with ${P('f_vel')} +4 bands so soft notes lose their top bands.`)}
${recipe('r-random', 'Random glass with seeds', 'Start from: B · Random Glass', [
  `${P('b_pattern')} ${ctl('RANDOM')}, ${P('b_seed')} 17, ${P('wavelet')} Daubechies 8, ${P('b_tilt')} −4 dB/band.`,
  `SCALE ENVELOPE: ${P('b_atk')} 200 ms, ${P('b_spread')} +50 %, ${P('b_body')} 6 s, ${P('b_bright')} 1.5 s, ${P('b_sus')} 40 %.`,
  `AMP ENVELOPE: ATTACK 300 ms, SUSTAIN 90 %, RELEASE 2 s. ${P('v_unison')} 3.`,
  `POSITION ${P('p_depth')} 60 %; LFO ${ctl('SINE')}, ${P('lfo_rate')} 0.2 Hz, ${P('lfo_pos')} ±72°. ${P('fx_rmix')} 45 %, ${ctl('VOLUME')} −5 dB.`,
  `Hold a chord, hover over ${P('b_seed')} and roll the mouse wheel: every seed is a new, repeatable timbre.`,
], '<b>Listen for:</b> the slow LFO moving the 60 %-deep window makes the detail breathe around the cycle, while the spread attack lets the shimmer arrive after the body.')}
${recipe('r-staircase', 'From square to sawtooth', 'Start from: B · Init', [
  `${P('b_pattern')} ${ctl('RAMP')}, ${P('wavelet')} Haar, ${P('b_tilt')} −6 dB/band, all drawbars at 100 %.`,
  'Hold a low note (around C2, where bands 1–9 sound) and pull the drawbars down one by one from drawbar 9: each removed band halves the number of steps. Drawbar 1 alone is a square wave (Figure 4).',
  `Put them back up and change ${P('b_tilt')}: −3 is brighter than a sawtooth, −9 darker, 0 a buzzy stack of equal squares.`,
  `Switch ${P('wavelet')} to Daubechies 20: the same registration becomes a smooth stack of octave sines — the steps were the Haar atoms.`,
], '<b>Listen for:</b> at middle C only drawbars 1–7 make a difference — see <a href="#bands">Where the bands are</a>.')}
${recipe('r-focus', 'Focus sweep (LFO → POSITION)', 'Start from: B · Focus Sweep', [
  `${P('b_pattern')} ${ctl('RAMP')}, ${P('wavelet')} Haar, ${P('b_tilt')} −3 dB/band.`,
  `POSITION: ${P('p_center')} 0°, ${P('p_width')} 30 %, ${P('p_depth')} 100 %.`,
  `LFO: ${ctl('SINE')}, ${P('lfo_rate')} 0.5 Hz, ${P('lfo_pos')} ±180°. AMP ${P('amp_s')} 100 %.`,
  `${P('fx_dmix')} 25 %, ${P('fx_rmix')} 20 %.`,
  'Hold a note and watch the SCOPE: band 1 (a square) stays put while the staircase detail travels around the cycle.',
], `<b>Try next:</b> ${P('p_width')} 10–15 % on low notes for a narrow, buzzy “formant”; LFO ${ctl('S&amp;H')} for random, vowel-like jumps.`)}
${recipe('r-filter', 'Filter pluck on an additive source', 'Start from: B · Init', [
  `${P('wavelet')} Daubechies 8 (keep ${ctl('RAMP')} and TILT −6 dB/band).`,
  `SCALE FILTER: ${ctl('LOW-PASS')}, ${P('f_cutoff')} 2, ${P('f_slope')} 24 dB/band, ${P('f_res')} 6 dB, ${P('f_env')} +6 bands.`,
  'MOD ENVELOPE: DECAY 400 ms, SUSTAIN 0 %. AMP ENVELOPE: DECAY 1 s, SUSTAIN 40 %.',
  `${P('f_vel')} +2 bands for dynamics.`,
], '<b>Listen for:</b> the classic subtractive pluck — but because each RAMP band is one octave partial, the resonance steps from one octave partial to the next as the envelope closes.')}
${recipe('r-legato', 'Legato flute', 'Start from: B · Soft Flute', [
  `${P('v_voices')} 1 (mono), portamento selector ${ctl('LEGATO')}, ${P('v_glide')} 80 ms.`,
  `Keep the preset’s scale envelope (${P('b_atk')} 80 ms, ${P('b_spread')} +60 %): the upper bands bloom a little after the body, like breath.`,
  'Play slurred phrases (press each key before releasing the previous one): the notes slide into each other without a new attack, as a flautist slurs.',
  'Detached notes re-articulate: each starts on pitch with the gentle attack and its own band bloom.',
  `For a breathier tone lower ${P('b_tilt')} to −12 dB/band; for more vibrato raise ${P('lfo_pitch')} or use the mod wheel.`,
], `<b>Listen for:</b> slurs and articulation controlled by your playing alone. ${ctl('POLY')} would make every note glide; ${ctl('OFF')} would make every note jump.`)}
${recipe('r-polyglide', 'Gliding organ chords', 'Start from: B · Octave Organ', [
  `Keep the portamento selector on ${ctl('POLY')} (the default) and set ${P('v_glide')} to 250 ms.`,
  'Play a chord, release it, then play the next one: C–E–G, then F–A–C. Each voice glides from its own previous note: G slides to F, E to A, and C stays.',
  'Slow chord progressions work best; the pure octave partials of the Daubechies 20 bands keep the slides clean.',
  `For a more vocal effect try ${P('b_pattern')} ${ctl('MIRROR')} and a longer ${P('v_glide')} (500 ms).`,
], `<b>Listen for:</b> an organ whose chords bend into each other voice by voice. With ${ctl('LEGATO')} the chords glide only while you keep a key down.`)}
${recipe('r-sub', 'Pedal organ with a 32′ sub', 'Start from: B · Octave Organ', [
  `Keep ${P('b_pattern')} ${ctl('RAMP')}, ${P('wavelet')} Daubechies 20 and the drawbars; pull drawbars 5–7 down for a darker pedal sound.`,
  `${P('v_oct')} −1 and ${P('v_voices')} 1 (mono, legato) for a pedal line; ${P('v_glide')} off.`,
  `${ctl('SUB OSC')}: ${P('sub_level')} 60 %, ${P('sub_oct')} −1 octave, ${P('sub_shape')} ${ctl('SIN')}.`,
  'Play a slow bass line between C2 and C3. With OCTAVE −1, drawbar 1 sounds like a 16′ stop and the sub like a 32′ stop — the low C of a 32′ stop is 16.4 Hz, the lowest note of the great cathedral organs.',
], `<b>Listen for:</b> pressure rather than pitch below 20 Hz — the sub is not filtered, so the drawbars and TILT keep shaping the organ while the sub stays a pure foundation. Choose ${ctl('TRI')} if your speakers cannot reproduce it.`)}`;

// ---------------------------------------------------------------- 13. presets
const presetDesc = {
  'B · Init': ['none', 'The Haar sawtooth: RAMP pattern, all drawbars up and TILT −6 dB/band — eleven square waves an octave apart that add up to a staircase saw.'],
  'B · Octave Organ': ['light', 'Drawbar organ: Daubechies 20 RAMP bands are almost pure octave partials (8′ 4′ 2′ 1′ …), registered 100/80/60/70/30/50/20, with an organ-style envelope, 6 Hz vibrato and light reverb.'],
  'B · Chip Walsh': ['none', '8-bit lead: Haar Walsh functions on bands 1, 2, 3 and 5 with a snappy envelope — square-wave chip-tune colour.'],
  'B · Walsh Bells': ['medium', 'Bell: the Walsh pattern through Symlet 8; the finest band decays in 0.4 s while band 1 rings for 3 s, with a long amp decay and reverb.'],
  'B · Impulse Pluck': ['light', 'Plucked string: one atom per band at the start of every cycle (a click train); the bright bands vanish in 80 ms, the body in 1.2 s; delay.'],
  'B · Random Glass': ['medium', 'Shimmering pad: random atoms (SEED 17), fine bands that swell in later (SPREAD +50 %) and settle at 40 %, a slow LFO moving a 60 %-deep focus window, three-copy unison and reverb.'],
  'B · Mirror Pad': ['heavy', 'Opening pad: the MIRROR pattern (odd harmonics only) through Daubechies 20; with SPREAD +100 % the fine bands arrive up to four times later than the 1.5 s centre attack; four-copy unison and a big reverb.'],
  'B · Focus Sweep': ['medium', 'A Haar staircase whose detail lives only inside a 30 % window that a 0.5 Hz LFO sweeps around the cycle; delay and reverb.'],
  'B · Mirror Sub Bass': ['medium', 'By OktoPierre, derived from B · Chip Walsh: a bass two octaves down built from MIRROR atoms through Symlet 8 (drawbars 1–5, TILT +4.2 dB/band), with a steep, very resonant low-pass (21.6 dB) that the mod envelope “blips” open by 7.5 bands on every note, a triangle sub one octave lower at 65 %, LEGATO portamento (GLIDE is 0 — raise it to slide), slow 1.3 Hz vibrato and light delay and reverb.'],
  'B · Soft Flute': ['light', 'Breathy flute: a few smooth octave partials falling steeply (TILT −9 dB/band), upper bands arriving slightly later, gentle 5 Hz vibrato.'],
  'B · Music Box': ['medium', 'Music box one octave up: Walsh bands through Symlet 8 whose bright bands die in 0.2 s, with echoes and reverb.'],
  'B · Space Choir': ['heavy', 'Huge choir-like pad: odd-harmonic MIRROR bands opening over seconds (SPREAD +100 %), four detuned copies, a slowly moving focus window and a vast reverb.'],
  'B · Chip Echo': ['heavy', 'Chip-tune lead with loud ping-pong echoes (250 ms, 65 % feedback, 60 % mix).'],
  'B · Distorted Organ': ['heavy', 'Rock organ: a full octave registration through 70 % saturation, with a fast 6.5 Hz vibrato.'],
  'B · Alien Texture': ['extreme', 'Random atoms (SEED 42) chopped by a 7 Hz sample-and-hold LFO that throws the focus window and the cutoff around, detail arriving before the body, long echoes and reverb.'],
};
const presetCount = SPEC.PRESETS.filter(p => p.values[C.P.engine] === 1).length;
const presets = `<p>${presetCount} factory presets show what engine B can do, from clean sounds to extreme effects. Load one, play, then look at the panel to see how it is made — the table lists every setting that differs from the defaults. In the instrument’s preset menu the engine A and engine B presets alternate; this table shows engine B’s only. The <b>Effects</b> column rates how much each preset relies on effects and movement (delay, reverb, saturation, unison, LFO, sub oscillator): <span class="fxl fxl-none">none</span> <span class="fxl fxl-light">light</span> <span class="fxl fxl-medium">medium</span> <span class="fxl fxl-heavy">heavy</span> <span class="fxl fxl-extreme">extreme</span>.</p>
${S.presetTable(E, presetDesc)}
${S.presetsSaving(E)}`;

const extraTrouble = [
  ['SEED is greyed out', `<p>${P('b_seed')} only affects the ${ctl('RANDOM')} pattern.</p>`],
  ['All drawbars up, but the sound is quiet', '<p>The mix is divided by the sum of the drawbar levels to avoid clipping. With TILT 0 and eleven drawbars up, each band plays at 1/11 of full scale. Use a negative TILT, fewer drawbars, or raise VOLUME.</p>'],
  ['The sound is harsh or thin', '<p>Check TILT: values near 0 or above make the fine bands as loud as the body. IMPULSE and RANDOM are bright by nature — use TILT −4 to −8, or a short BRIGHT time.</p>'],
];

const sections = [
  { id: 'idea', num: '1', title: 'The idea in one minute', html: idea, subs: [{ id: 'fourier', title: 'Partials versus atoms' }, { id: 'bands', title: 'Where the bands are' }, { id: 'wavelets', title: 'The wavelet chooses the atom' }, { id: 'flow', title: 'Signal flow' }, { id: 'saw-from-squares', title: 'A sawtooth from squares' }] },
  { id: 'quick-start', num: '2', title: 'Quick start', html: S.quickStart(E) },
  { id: 'panel', num: '3', title: 'Panel tour', html: panel, subs: [{ id: 'header-controls', title: 'The header' }, { id: 'handling', title: 'Working with the controls' }] },
  { id: 'engine-b', num: '4', title: 'Engine B: atoms, drawbars, scale envelope', html: engineB, subs: [{ id: 'patterns', title: 'Atom patterns' }, { id: 'drawbars', title: 'Drawbars and tilt' }, { id: 'scale-env', title: 'Scale envelope' }] },
  { id: 'filter', num: '5', title: 'Scale filter', html: S.filterSection(E), subs: [{ id: 'filter-types', title: 'The four types in numbers' }] },
  { id: 'position', num: '6', title: 'Position window', html: S.positionSection(E), subs: [{ id: 'window-high', title: 'High notes and modulation' }] },
  { id: 'envelopes', num: '7', title: 'Envelopes', html: S.envelopesSection(E), subs: [{ id: 'amp-env', title: 'Amp envelope' }, { id: 'mod-env', title: 'Mod envelope' }] },
  { id: 'lfo', num: '8', title: 'LFO', html: S.lfoSection(E) },
  { id: 'voice', title: 'Voice', html: S.voiceSection(E) },
  { id: 'sub', title: 'Sub oscillator', html: S.subSection(E) },
  { id: 'effects', num: '10', title: 'Effects and master', html: S.fxSection(E) },
  { id: 'displays', num: '11', title: 'Displays', html: S.displaysSection(E) },
  { id: 'recipes', num: '12', title: 'Sound-design recipes', html: recipes, subs: [{ id: 'r-organ', title: 'Drawbar organ' }, { id: 'r-chip', title: 'Chip-tune Walsh lead' }, { id: 'r-bell', title: 'Bell with per-band decays' }, { id: 'r-swell', title: 'Swelling pad' }, { id: 'r-pluck', title: 'Impulse pluck' }, { id: 'r-random', title: 'Random glass' }, { id: 'r-staircase', title: 'Square to sawtooth' }, { id: 'r-focus', title: 'Focus sweep' }, { id: 'r-filter', title: 'Filter pluck' }, { id: 'r-legato', title: 'Legato flute' }, { id: 'r-polyglide', title: 'Gliding organ chords' }, { id: 'r-sub', title: 'Pedal organ with a 32′ sub' }] },
  { id: 'presets', num: '13', title: 'Factory presets', html: presets, subs: [{ id: 'saving', title: 'Browsing and saving' }] },
  { id: 'playing', num: '14', title: 'Playing', html: S.playingSection(E), subs: [{ id: 'demo', title: 'Demo' }, { id: 'demo-tour', title: 'Default demo: preset tour' }, { id: 'kbd-screen', title: 'On-screen keyboard' }, { id: 'kbd-computer', title: 'Computer keyboard' }, { id: 'midi', title: 'MIDI' }, { id: 'poly', title: 'Polyphony, mono, glide' }] },
  { id: 'vst', num: '15', title: 'The VST3 plugin in Live', html: S.vstSection(E), subs: [{ id: 'vst-install', title: 'Installation' }, { id: 'vst-diff', title: 'Differences' }, { id: 'automation', title: 'Automation' }] },
  { id: 'trouble', num: '16', title: 'Tips & troubleshooting', html: S.troubleshooting(E, extraTrouble) },
  { id: 'glossary', title: 'Glossary', html: S.glossary(E) },
  { id: 'about', title: 'About & release history', html: S.aboutSection(E), subs: [{ id: 'release-history', title: 'Release history' }] },
];

const footer = `<footer class="foot"><span>Wavelet Synthesizer · Manual B — Engine B · Wavelet Additive</span><span>${SPEC.APP.name} — ${SPEC.APP.credit} (${SPEC.APP.author}). Version ${SPEC.APP.version} (${SPEC.APP.date}). ${SPEC.APP.copyright}. Free software under the GNU General Public License v3 or later, without any warranty.</span><a href="manual-a.html">Manual A — Engine A · Wavelet Subtractive →</a></footer>`;

module.exports = {
  engine: E,
  title: 'Engine B · Wavelet Additive — Wavelet Synthesizer manual',
  description: 'User manual for engine B (wavelet additive) of the Wavelet Synthesizer web app and VST3 plugin.',
  hero, sections, footer,
};
