// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Sections shared by both manuals, worded per engine (E = 'a' | 'b').
'use strict';
const L = require('./lib.js');
const { ctl, kbd, P, controls, table, tip, note, warn, deep, fig, C, PK, SPEC } = L;
const isA = E => E === 'a';

// ---------------------------------------------------------------- band map (shared by section 1)
function bandMap(E) {
  const f = [65.41, 261.63, 1046.5];
  const keep = [256, 64, 16];
  const one = v => v >= 1000 ? { n: (v / 1000).toFixed(v >= 10000 ? 1 : 2).replace(/0$/, ''), u: 'kHz' } : { n: String(Math.round(v)), u: 'Hz' };
  const rng = (a, b) => { const x = one(a), y = one(b); return x.u === y.u ? `${x.n}–${y.n} ${y.u}` : `${x.n} ${x.u} – ${y.n} ${y.u}`; };
  const rows = [];
  for (let b = 1; b <= 11; b++) {
    const lo = b === 1 ? 1 : b === 2 ? 2 : (1 << (b - 2)) + 1, hi = b === 1 ? 1 : 1 << (b - 1);
    const hs = lo === hi ? String(lo) : `${lo}–${hi}`;
    const cells = f.map((f0, i) => {
      if (hi > keep[i]) return { na: '—' };
      if (lo === hi) { const x = one(f0 * lo); return `${x.n} ${x.u}`; }
      return rng(f0 * lo, f0 * hi);
    });
    rows.push([`<b>B${b}</b>`, String(1 << (b - 1)), hs, ...cells]);
  }
  return table(['Band', 'Atoms', 'Harmonics (≈)', 'At C2 (65 Hz)', 'At C4 (262 Hz)', 'At C6 (1047 Hz)'], rows, 'compact num') +
    `<p class="small muted">“—” = not played at that pitch (see below). Values are for the smooth wavelets; Haar and the short Daubechies bands overlap more with their neighbours.</p>`;
}

// ---------------------------------------------------------------- wavelet list (shared)
function waveletTable(E) {
  const t = SPEC.WAVELETS.map(w => w.h.length);
  const d = isA(E) ? [
    'A square step up and down. Edges stay razor-sharp and every removed band halves the number of “steps” in the wave: digital, 8-bit, sample-and-hold character.',
    'Short and lopsided. Asymmetric ringing next to edges; gritty and slightly metallic.',
    'The default: a good all-rounder with mild, asymmetric ringing.',
    'Longer and smoother; filter sweeps start to sound “analogue”.',
    'Same length as Daubechies 8 but almost symmetric: cleaner, more balanced edges.',
    'Nearly symmetric and very smooth for its length.',
    'Long and almost sine-like: each band is close to a pure octave of harmonics — the smoothest, most “Fourier-like” filtering.',
  ] : [
    'Each band is a square-wave pattern: hard, bright, chip-like. RAMP + TILT −6 dB/band builds an exact sawtooth staircase.',
    'Short and lopsided: buzzy, slightly metallic band timbres.',
    'A good all-rounder; bands still carry a few neighbouring harmonics.',
    'Smooth bands; the octave structure becomes clear and organ-like.',
    'Like Daubechies 8 but almost symmetric: a little rounder.',
    'Nearly symmetric and very smooth for its length.',
    'Each RAMP band is practically a pure sine at its octave: the cleanest drawbar-organ sound.',
  ];
  return table(['Wavelet', 'Taps', 'Character'], SPEC.WAVELETS.map((w, i) => [`<b>${w.name}</b>`, String(t[i]), d[i]]), 'compact');
}

// ---------------------------------------------------------------- quick start
function quickStart(E) {
  const a = isA(E);
  return `<p>From closed to sounding in five steps — pick the column for the version you use.</p>
<div class="cols2">
<div class="card"><h4>Web app <span class="badge">BROWSER</span></h4><ol class="steps">
<li>Double-click <code>web/index.html</code> to open it in Chrome or Edge (Firefox also works; MIDI keyboards are best supported in Chrome and Edge). No installation and no web server are needed.</li>
<li>Click <b>Click to start audio</b> (browsers only allow sound after a click). The status bar turns green: <i>Audio on · 48.0 kHz</i>.</li>
<li>The app always opens on <b>${SPEC.PRESETS[SPEC.DEFAULT_PRESET].name}</b>. In the header, click ${ctl(a ? 'A · SUBTRACTIVE' : 'B · ADDITIVE')}, then step to <b>${a ? 'A · Init' : 'B · Init'}</b> with the preset arrows ◀ ▶ (or click the preset name to pick from the list).</li>
<li>Play: click the on-screen keys (lower on a key = louder), press the digit keys ${kbd('1')} … ${kbd('0')} or the letter row ${kbd('A')} ${kbd('S')} ${kbd('D')} ${kbd('F')} …, or play a MIDI keyboard.</li>
<li>${a ? `Hold a note and slowly turn ${P('f_cutoff')} down from 7 to 2. In the ${ctl('SCALOGRAM')} the rows switch off from the top as bands are removed. Then click ▶ next to the wavelet name and sweep again: same filter, different atoms.`
    : `Hold a note and pull the drawbars down one by one, starting from drawbar 7: the sawtooth loses brightness step by step until drawbar 1 alone leaves a square wave. Then click the ${ctl('PATTERN')} buttons to hear the other atom patterns.`}</li>
</ol></div>
<div class="card"><h4>Ableton Live <span class="badge">VST3 / VST2</span></h4><ol class="steps">
<li>Copy the whole <code>WaveletSynthesizer.vst3</code> folder into your VST3 folder (<code>C:\\Program Files\\Common Files\\VST3</code>; <code>vst\\install.bat</code> does it and asks for administrator rights) <b>or</b> into the VST2 plug-in folder you use in Live: the same folder works in both.</li>
<li>In Live open <b>Preferences → Plug-ins</b>, switch on <b>Use VST3 Plug-in System Folders</b> (VST3) or <b>Use VST2 Plug-in Custom Folder</b> (VST2) and click <b>Rescan</b>.</li>
<li>In Live’s browser open <b>Plug-ins → ${SPEC.APP.credit.replace(/^created by /, '')} → Wavelet Synthesizer</b> and drag it onto a MIDI track. A new instance starts on <b>${SPEC.PRESETS[SPEC.DEFAULT_PRESET].name}</b>.</li>
<li>Arm the track and play your MIDI keyboard, or press ${kbd('M')} to use Live’s Computer MIDI Keyboard.</li>
<li>Click ${ctl(a ? 'A · SUBTRACTIVE' : 'B · ADDITIVE')} in the plugin header, choose <b>${a ? 'A · Init' : 'B · Init'}</b> from the preset menu (click the preset name) and repeat step 5 of the web column.</li>
</ol></div>
</div>
${fig('start-overlay.png', 'The web app waits for a click before it may make sound. The VST3 plugin needs no such step.', 'shot')}
${tip(`<p>Want to hear what the instrument can do first? Click ${ctl('▶ DEMO')} next to the logo in the web app: a Beethoven sonata movement plays while the factory presets change every few seconds. The ${ctl('▾')} beside it opens more pieces — see <a href="#demo">Demo</a>.</p>`)}`;
}

// ---------------------------------------------------------------- working with controls
function controlsHowTo(E) {
  const rows = [
    ['Drag up / down', `Changes the value. A full sweep takes about 180 pixels of mouse travel on a knob${isA(E) ? '' : ' (120 on a drawbar)'}.`],
    [`${kbd('Shift')} + drag`, 'Five times finer adjustment; you can press or release Shift during the drag.'],
    ['Mouse wheel', `Small steps of 1 % of the range (0.2 % with ${kbd('Shift')}). Stepped controls such as ${P('v_oct')}, ${P('v_voices')}, ${P('v_unison')}${isA(E) ? '' : ` and ${P('b_seed')}`} move one step.`],
    [`Double-click, or ${kbd('Ctrl')} + click`, `Resets the control to its default value (${kbd('⌘')} + click on a Mac).`],
    ['Hover', `The label under a knob shows the current value with its unit; ${isA(E) ? `the header ${ctl('VOLUME')} knob shows a tooltip instead.` : `drawbars and the header ${ctl('VOLUME')} knob show a tooltip instead.`}`],
    ['Segmented buttons', 'Click a choice; the lit button is active.'],
    [`${ctl('WAVELET')} ◀ ▶`, 'Previous / next wavelet (wraps around). Clicking the name also steps to the next one.'],
    ['Greyed-out control', isA(E) ? `Has no effect with the current settings: ${P('a_width')} only works for ${ctl('PULSE')} and ${ctl('TRI')}.` : `Has no effect with the current settings: ${P('b_seed')} only works with the ${ctl('RANDOM')} pattern.`],
    ['Arc from the centre', `Bipolar controls (${P('v_fine')}, ${P('f_env')}, ${P('f_vel')}, ${P('v_oct')}${isA(E) ? '' : `, ${P('b_tilt')}, ${P('b_spread')}`}) draw their value arc from zero.`],
    ['Panel size', 'The web app scales the whole panel to the browser window. In the plugin, the small size button next to the logo opens a menu of window sizes from 70 % to 150 %.'],
  ];
  return table(['Gesture', 'Effect'], rows, 'compact');
}

// ---------------------------------------------------------------- scale filter
function filterSection(E) {
  const a = isA(E);
  const intro = a
    ? `<p>The SCALE FILTER is the heart of engine A. It does not work on frequencies directly: it gives each of the 11 bands its own gain, and the sound is the sum of the band layers, each multiplied by its gain. A low-pass therefore removes the <em>fine atoms</em> — the small, sharp details of the cycle — and keeps the coarse ones. Because one band is about one octave of harmonics, the controls behave like those of a familiar synth filter: ${P('f_cutoff')} in bands, ${P('f_slope')} in dB per band (≈ dB per octave), resonance, key tracking and envelope.</p>
<p>Two things are different from an analogue filter. There is no phase shift and no feedback, so a filtered edge becomes wider and smoother but stays exactly where it was in the cycle, and the resonance can never self-oscillate. And the <em>character</em> of a sweep depends on the ${ctl('WAVELET')}: with Haar every removed band halves the number of steps in the wave, with Daubechies 20 the bands are nearly pure octaves and the sweep sounds smooth.</p>`
    : `<p>In engine B the SCALE FILTER multiplies the band levels set by the drawbars, the ${ctl('TILT')} and the SCALE ENVELOPE. Think of it as a second set of drawbars that you can move with an envelope, an LFO, velocity and the keyboard. Its default ${P('f_cutoff')} of 12 is fully open, so you can ignore it until you want brightness that changes over time or with playing strength.</p>
<p>The level normalisation of engine B (see <a href="#drawbars">Drawbars and tilt</a>) is computed <em>before</em> the filter, so closing the filter really makes the sound darker and quieter — exactly as you would expect from a subtractive filter.</p>`;
  const rows = [
    ['f_type', `Shape of the gain curve over the bands. ${ctl('LOW-PASS')} keeps the coarse bands and removes fine detail; ${ctl('HIGH-PASS')} keeps the fine bands and removes the body; ${ctl('BAND-PASS')} keeps about one band around the cutoff; ${ctl('BAND-REJ')} removes the band at the cutoff (a notch).`, 'Band-pass on a low cutoff (2–3) gives thin, nasal tones; high-pass at 3–4 makes airy layers.'],
    ['f_cutoff', `Where the filter acts, in bands: 1 = the fundamental, 11 = the finest atoms, 12 = beyond the finest band — a low-pass is fully open there. Fractional values blend smoothly between bands.`, a ? 'With KEY TRK at 100 %, CUTOFF 8–12 all sound the same at middle C — only bands 1–7 exist there (see <a href="#bands">Where the bands are</a>).' : 'Default 12 = fully open. For a classic filter pluck start around 2–3 with a positive ENV AMT.'],
    ['f_slope', `How steeply bands beyond the cutoff are attenuated. One band ≈ one octave, so 24 dB/band behaves like a classic 4-pole (24 dB/octave) filter; 6 is gentle, 96 is a brick wall. For ${ctl('BAND-REJ')} it sets the notch width instead: the higher the slope, the narrower the notch.`, a ? '36–96 with Haar gives crisp, stepped sweeps.' : 'Steep slopes make the filter act like a fader that switches whole drawbars on and off.'],
    ['f_res', `Boosts the bands around the cutoff by up to 24 dB (a bell about ±0.6 band wide). It is a band boost, not feedback, so it never self-oscillates. Ignored by ${ctl('BAND-REJ')}.`, 'Resonance adds level (up to +24 dB at the cutoff band): keep an eye on the meter.'],
    ['f_keytrk', `100 %: the cutoff follows the note, so every key has the same tone colour — the natural behaviour of this pitch-synchronous engine. 0 %: the cutoff stays at a fixed frequency referenced to C4 (261.63 Hz): every octave above C4 lowers the cutoff by one band, every octave below raises it by one.`, '50 % gives the familiar “darker as you go up” feel of an analogue filter.'],
    ['f_env', `How far the MOD ENVELOPE moves the cutoff: −11 to +11 bands at the envelope’s peak. Positive values open the filter, negative values close it.`, '+4 to +6 bands with a short mod decay = the classic filter pluck.'],
    ['f_vel', `Velocity → cutoff. The shift is amount × (velocity − 1): a note at full velocity is not shifted; softer notes move the cutoff by up to the amount — down for positive amounts, up for negative ones.`, '+2 to +3 bands: soft notes darker, hard notes open.'],
  ];
  return `${intro}
${controls(rows)}
<p>${ctl('LFO')} ${P('lfo_cut')} adds a further ± bands of periodic movement — see <a href="#lfo">LFO</a>.</p>
<figure class="frame"><img src="img/filter-${E}.svg" alt="Gain curves of the four filter types at cutoff 6"><figcaption><b>Gain per band at ${ctl('CUTOFF')} 6</b>, computed with the instrument’s own filter code. Dots mark the gain actually applied to bands 1–11 at 24 dB/band. Note the soft knee: the band <em>at</em> the cutoff is already a little attenuated.</figcaption></figure>
<h3 id="filter-types">The four types in numbers</h3>
<ul>
<li><b>Low-pass</b> — bands below the cutoff pass untouched; the band at the cutoff is about 0.17 × SLOPE down (−4 dB at 24 dB/band); each band further up loses about SLOPE dB more. At CUTOFF 12 (the default) every band is within 0.1 dB at 24 dB/band (0.4 dB at 96 dB/band): fully open.</li>
<li><b>High-pass</b> — the mirror image: bands above the cutoff pass, bands below lose about SLOPE dB per band.</li>
<li><b>Band-pass</b> — keeps a window about one band wide: at 24 dB/band the cutoff band is −0.8 dB, its neighbours −13 dB, two bands away −36 dB.</li>
<li><b>Band-reject</b> — removes the band at the cutoff completely. The notch width depends only on SLOPE: at 6 dB/band it hollows out two or three bands on each side, at 24 its neighbours are only 1.6 dB down, at 96 nothing but the exact band is touched. With steep slopes, a cutoff between two bands (say 5.5) hardly notches anything — use whole numbers.</li>
<li><b>Resonance</b> — adds up to +24 dB centred on the cutoff, falling off over about ±1 band. With a low-pass at 24 dB/band and RESO 12 dB, the cutoff band ends up at about +8 dB.</li>
</ul>
${deep(`<p>The cutoff actually used for each voice, recomputed every 32 samples and smoothed sample by sample:</p>
<div class="formula">cutoff = CUTOFF + ENV AMT × mod envelope + LFO CUTOFF × LFO + VEL AMT × (velocity − 1) + (1 − KEY TRK) × log₂(261.63 Hz ÷ note frequency)</div>
<p>The mod envelope runs from 0 to 1, the LFO from −1 to +1 and velocity from 0 to 1. The note frequency includes ${P('v_oct')}, ${P('v_fine')}, pitch bend and vibrato. The result is not clamped to 0–12, so modulation can push the filter past fully closed or past fully open.</p>`)}
${a ? `<p>One special case deserves a warning: with the Haar wavelet a ${ctl('SQUARE')} source is a single atom, so the filter has nothing to remove — see <a href="#haar-square">The square wave that will not filter</a>.</p>` : ''}`;
}

// ---------------------------------------------------------------- position
function positionSection(E) {
  const a = isA(E);
  const rows = [
    ['p_center', `Centre of the window inside the cycle, from 0° (start of the cycle) to 360° (end — the same point as 0°).`, a ? 'Put it on an edge of the wave: 180° is the falling edge of SQUARE.' : 'With IMPULSE all detail sits at 0°: a window at 180° hides it.'],
    ['p_width', `How much of the cycle the window covers (the full width of its raised-cosine bump). 100 % = a smooth bump over the whole cycle that only reaches zero opposite the centre.`, 'Narrow windows (5–20 %) are automatically widened on high notes to avoid aliasing.'],
    ['p_depth', a
      ? `How strongly the window restricts the filter. 0 % = window off, the filter acts on the whole cycle (the normal case). 100 % = the filter acts only inside the window; outside it the unfiltered (dry) cycle plays.`
      : `How strongly the window restricts the detail. 0 % = window off, all bands everywhere. 100 % = bands 2–11 exist only inside the window; outside it only band 1 sounds.`,
    'In between, the area outside the window gets a blend.'],
  ];
  return `<p>${a
    ? 'A classic filter treats every part of the waveform the same way. Wavelet atoms, however, live at definite places in the cycle — so engine A can filter <em>one part</em> of the cycle and leave the rest untouched. This is something an ordinary filter cannot do: soften only the falling edge of a square, darken only the reset of a sawtooth, or sweep a “filtered zone” around the cycle with the LFO.'
    : 'Atoms live at definite places in the cycle, so engine B can decide <em>where</em> the detail is allowed to exist. With the POSITION window you keep the coarse band 1 everywhere but let bands 2–11 sound only in part of the cycle. The result is a moving “focus” — a kind of formant or pulse-width effect that is locked to the pitch.'}</p>
${controls(rows)}
<figure class="frame"><img src="img/window-${E}.svg" alt="Position window curve for three depth settings"><figcaption><b>The window W over one cycle</b> for ${ctl('POSITION')} 180°, ${ctl('WIDTH')} 40 % and three depths. The panel’s ${ctl('WINDOW')} display draws the same curve.</figcaption></figure>
${deep(`<div class="formula">W(φ) = (1 − DEPTH) + DEPTH × bump(φ)     bump = raised cosine of total width WIDTH, centred on POSITION</div>
<div class="formula">${a ? 'output(φ) = dry(φ) + W(φ) × (filtered(φ) − dry(φ))' : 'output(φ) = band 1(φ) + W(φ) × [bands 2 … 11](φ)'}</div>
<p>φ is the position inside the cycle. ${a ? 'The dry signal is the source after SPARSITY, with no filtering. ' : ''}Because the window is locked to the cycle, the result is still perfectly periodic — it changes the timbre, it never adds noise or detuning.</p>`)}
${a ? `<h3 id="edges">Where the edges are</h3>
<p>Most of the action is at the edges of the source wave, where the fine atoms are. They sit at fixed positions:</p>
${table(['Wave', 'Edges and corners'], [
    [ctl('SAW'), 'Ramps down through the whole cycle and jumps back up at 0° / 360°.'],
    [ctl('SQUARE'), 'Rising edge at 0°, falling edge at 180°.'],
    [ctl('PULSE'), 'Rising edge at 0°, falling edge at WIDTH × 360° (e.g. 126° at WIDTH 35 %).'],
    [ctl('TRI'), 'Lowest corner at 0°, highest corner at WIDTH × 360°.'],
    [ctl('SINE'), 'No edges — the window has little to work on.'],
    [ctl('NOISE'), 'Detail everywhere.'],
  ], 'compact')}
<figure class="frame"><img src="img/edge-a.svg" alt="Square wave filtered only around the falling edge"><figcaption><b>The idea behind an edge pluck</b> (recipe “Edge pluck” in manual A): a Symlet 8 low-pass at CUTOFF 2.5 on a square wave. With DEPTH 0 % the whole cycle is rounded off (dashed); with DEPTH 100 % and the window on the falling edge only that edge is softened, while the plateaus and the rising edge keep the raw square’s bite.</figcaption></figure>`
    : `<figure class="shot"><img src="img/focus-sweep.png" alt="Focus Sweep preset: scope and scalogram with a 30% window at 0 degrees"><figcaption><b>B · Focus Sweep at rest:</b> outside the 30 % window (centred on 0°, wrapping round the cycle edge) only band 1 — a square with Haar — remains; inside, the full staircase detail returns. An LFO sweeps the window around the cycle while you play.</figcaption></figure>`}
<h3 id="window-high">High notes and modulation</h3>
<p>A narrow window multiplies the sound by a short bump, which adds high harmonics. To keep this alias-free, the window is automatically widened on high notes: it is never narrower than 16 × note frequency ÷ sample rate of the cycle — about 9 % at C4 and 35 % at C6 (48 kHz). The minimum WIDTH of 5 % is only reached below about 150 Hz.</p>
<p>${ctl('LFO')} ${P('lfo_pos')} moves the window up to ±180° — all the way round the cycle — and is only audible when DEPTH is above 0 %. The ${ctl('SCOPE')} shades the window and the ${ctl('SCALOGRAM')} draws it as a dashed line.</p>`;
}

// ---------------------------------------------------------------- envelopes
function envelopesSection(E) {
  const a = isA(E);
  const amp = [
    ['amp_a', 'Time to rise linearly from silence to full level.', '1–5 ms is click-free for most sounds; 0.3–1 s for pads.'],
    ['amp_d', 'Time to fall from full level to the SUSTAIN level. Exponential: the time given is the time to fall by 60 dB of the remaining distance, so the curve looks finished after about half of it.', 'For plucks set SUSTAIN to 0 % and use DECAY as the note length.'],
    ['amp_s', 'Level held while the key (or the sustain pedal) is down.', ''],
    ['amp_r', 'Time to fade by 60 dB after the key is released. The voice is freed at −100 dB.', 'Long releases overlap: raise VOICES for pads.'],
    ['amp_vel', 'How much velocity sets the loudness: level × (1 − VELOCITY × (1 − velocity)). 0 % = every note equally loud; 100 % = loudness proportional to velocity.', 'The computer keyboard always plays at velocity 80 %.'],
  ];
  const mod = [
    ['mod_a', 'Attack of the modulation envelope (linear).', 'A slow mod attack (50–150 ms) gives brassy swells.'],
    ['mod_d', 'Decay to the mod SUSTAIN level (exponential, −60 dB time).', ''],
    ['mod_s', 'Mod level held while the key is down.', ''],
    ['mod_r', 'Mod release after the key is released.', ''],
  ];
  return `<p>Two ADSR envelopes run for every voice. The <b>AMP ENVELOPE</b> shapes the loudness; the <b>MOD ENVELOPE</b> moves the filter cutoff, by the amount set with ${P('f_env')} in the SCALE FILTER (it has no other destination and ignores velocity — use ${P('f_vel')} for velocity-dependent brightness).${a ? '' : ' Engine B adds a third, per-band envelope — the <a href="#scale-env">SCALE ENVELOPE</a> — which shapes every band separately before the AMP ENVELOPE shapes the whole.'}</p>
<h3 id="amp-env">AMP ENVELOPE</h3>
${controls(amp)}
<h3 id="mod-env">MOD ENVELOPE</h3>
${controls(mod)}
<ul>
<li>Attacks are linear; decays and releases are exponential, which sounds natural and avoids clicks. The small curve above the knobs shows the shape on a logarithmic time axis, so short and long settings are both readable.</li>
<li>Playing a note on a voice that is still sounding restarts the attack from the current level, without a click.</li>
<li>With ${P('v_voices')} at 1 (mono, legato), notes played while another key is held do not restart the envelopes.</li>
${a ? '' : '<li>For plucks and bells in engine B, give the AMP ENVELOPE a long decay and let BODY and BRIGHT in the SCALE ENVELOPE do the shaping: the fine bands can then die away before the body, as in a real string.</li>'}
</ul>`;
}

// ---------------------------------------------------------------- LFO
function lfoSection(E) {
  const a = isA(E);
  const rows = [
    ['lfo_shape', `${ctl('SINE')}, ${ctl('TRI')} (triangle), ${ctl('SAW')} (ramps down, then jumps up), ${ctl('SQR')} (square) and ${ctl('S&amp;H')} (sample &amp; hold: a new random value once per LFO cycle).`, 'S&amp;H on CUTOFF or POSITION gives random, stepped timbres.'],
    ['lfo_rate', 'Speed, from one cycle every 20 s to 20 cycles per second (logarithmic taper).', '5–6 Hz for vibrato; 0.1–0.5 Hz for slow sweeps.'],
    ['lfo_pitch', 'Vibrato depth: the pitch moves by up to ± this many cents (100 = ± one semitone).', 'The mod wheel adds up to 50 cents of extra depth.'],
    ['lfo_cut', 'Moves the cutoff by up to ± this many bands.', a ? '1–2 bands on a resonant filter = a slow “wah”.' : 'With the default CUTOFF 12 there is little to sweep: lower CUTOFF first.'],
    ['lfo_pos', 'Moves the POSITION window by up to ± this many degrees; ±180° travels all the way round the cycle. Only audible when DEPTH is above 0 %.', a ? 'Try it with a narrow window on a saw: see the “Scanning edge” recipe.' : 'See the “Focus sweep” recipe.'],
    ['lfo_wav', 'WAVELET MORPH (beta 0.3): moves the morph between WAVELET and WAVELET 2 by up to this amount, around the MORPH position (kept within 0–100 %). Needs a WAVELET 2 different from WAVELET.', 'With the same LFO on CUTOFF, the timbre and the filter move together (preset “A · Wave Wobble Bass”).'],
  ];
  // beta 0.3: LFO 2, in its own card at the bottom (next to CHORUS)
  const rows2 = [
    ['lfo2_target', `What LFO 2 moves — the small menu next to the ${ctl('LFO 2')} title: ${ctl('CUTOFF')}, ${ctl('SLOPE')}, ${ctl('RESO')}, ${ctl('KEY TRK')}, ${ctl('ENV AMT')} or ${ctl('VEL AMT')} of the SCALE FILTER, ${ctl('POSITION')}, ${ctl('WIDTH')} or ${ctl('DEPTH')} of the POSITION window, or (beta 0.4) the engine A ${ctl('PHASE')} — SOURCE PHASE: the wave moves inside the cycle and the timbre scans through the colours of the shift-variant wavelet transform (see Manual A, <a href="manual-a.html#phase">Source phase</a>). The mouse wheel on the menu steps through them.`, 'LFO 1 already has CUTOFF and POSITION: give LFO 2 another target (RESO, WIDTH…) for two independent movements.'],
    ['lfo2_shape', `The same five shapes as LFO 1 (sine, triangle, saw, square, sample &amp; hold). A click on the knob goes to the next shape.`, 'S&amp;H on RESO gives a random, talking resonance.'],
    ['lfo2_rate', 'Speed, from one cycle every 20 s to 20 cycles per second (logarithmic taper), independent of LFO 1.', 'A rate that does not divide LFO 1’s makes the two movements drift against each other.'],
    ['lfo2_amt', 'How far the target moves: up to ± this share of half its range (100 % on CUTOFF = ±6 bands, on POSITION or PHASE = ±180°, on RESO = ±12 dB), kept within the control’s range. Negative values move it the other way; 0 % (the default) switches LFO 2 off.', 'Start around 20–30 % and listen while you raise it.'],
  ];
  return `<p>One LFO is shared by all voices. It runs freely and is not restarted by new notes, so in a chord every voice moves together — ideal for pads and vibrato. For a movement that starts with each note, use the MOD ENVELOPE instead.</p>
${controls(rows)}
<p>The <b>mod wheel</b> (on screen or MIDI CC 1) always acts through this LFO: it adds up to 50 cents of vibrato depth on top of ${P('lfo_pitch')}, using the current ${P('lfo_shape')} and ${P('lfo_rate')}. With ${P('lfo_pitch')} at 0, the wheel alone brings in vibrato.</p>
<h3 id="lfo2">LFO 2 (beta 0.3)</h3>
<p>A second free-running LFO, in its own card next to CHORUS, moves <b>one</b> parameter of the SCALE FILTER or of the POSITION window — the one chosen in the menu next to its title. Like LFO 1 it is shared by all voices.</p>
${controls(rows2)}`;
}

// ---------------------------------------------------------------- voice
function voiceSection(E) {
  const rows = [
    [{ key: 'v_porta', label: 'PORTAMENTO', range: 'OFF · POLY · LEGATO', def: 'POLY' }, `When notes glide from one pitch to the next; ${P('v_glide')} sets how long a glide takes (at 0 nothing glides). ${ctl('OFF')}: never. ${ctl('POLY')}: polyphonic portamento — every voice glides from its own previous note (details below). ${ctl('LEGATO')}: only when the new note starts while another key is still held; in poly the new note glides from the held (most recent) note, exactly like a mono legato line. With ${P('v_voices')} at 1, POLY glides from the previous note every time and LEGATO only on tied notes; returning to a still-held note after releasing the top one glides too, unless the selector is OFF.`, 'Most presets leave GLIDE at 0: raise it to hear the portamento. LEGATO is the expressive choice for leads, POLY for gliding chords.'],
    ['v_oct', 'Transposes the instrument by whole octaves.', ''],
    ['v_fine', 'Fine tuning in cents (100 cents = one semitone).', ''],
    ['v_voices', 'Maximum number of notes sounding at once. At 1 the instrument is monophonic and legato, with last-note priority.', 'Long releases and reverb-like pads need 8 voices or more.'],
    ['v_glide', `Portamento time: how long a glide takes; 0 (shown as “off”, the setting of most presets) means no portamento at all. The pitch slides exponentially; the value is the time to cover about 99 % of the interval. Whether a note glides at all is decided by the ${ctl('OFF')} / ${ctl('POLY')} / ${ctl('LEGATO')} selector.`, '30–80 ms for leads; 200 ms+ for dramatic slides.'],
    ['v_unison', 'Number of stacked copies of every note (1–4).', 'UNISON multiplies CPU load: 8 voices × 4 copies = 32 oscillators.'],
    ['v_detune', 'Spread of the unison copies: the outer copies are at ± this many cents, the others evenly in between.', '8–15 cents for warmth, 20+ for supersaw-style width.'],
    ['v_width', 'Spreads the unison copies across the stereo field, from centre (0 %) to hard left and right (100 %).', 'No effect with UNISON 1.'],
  ];
  return `${controls(rows)}
<ul>
<li><b>Voice allocation.</b> When all voices are busy, a new note takes over the oldest released voice first, then the oldest held one. Playing a note that is already sounding re-uses its voice.</li>
<li><b>Mono and legato.</b> With ${P('v_voices')} at 1, holding a note and playing another changes the pitch without restarting the envelopes (it glides if ${P('v_glide')} is above zero and the portamento selector is not ${ctl('OFF')}). Release the new note while still holding the first and the pitch returns to the first one. Legato means that another key is still physically held: with the sustain pedal down but no key held, a new note restarts the envelopes.</li>
<li><b>Polyphonic portamento (${ctl('POLY')}).</b> With ${P('v_glide')} above 0, every voice glides from its own previous note. Playing one note at a time, the new note glides from the previous one (the voice of the last note is reused) while the release tails of older notes keep sounding. Playing chords, each new note takes the free voice whose last pitch is nearest, so chord changes glide voice by voice — from C–E–G to F–A–C, G slides to F, E to A, and C stays on C. A voice that has to be stolen glides from wherever it currently is.</li>
<li><b>Level.</b> Each note plays at about −8 dB to leave headroom for chords, and unison copies are scaled by 1/√n so that stacking keeps the loudness roughly constant.</li>
<li><b>Voice LEDs.</b> The 16 dots show the voices: dim = available, lit = sounding (including release tails). They sit to the right of the portamento selector.</li>
</ul>`;
}

// ---------------------------------------------------------------- effects
function fxSection(E) {
  const rows = [
    ['fx_drive', 'Saturation: blends in a smooth tanh soft-clipper driven by up to +24 dB, with automatic level compensation. 0 % = bypassed.', '20–40 % thickens basses and Haar sounds.'],
    ['fx_dtime', 'Delay time (logarithmic taper). Changing it while echoes are ringing makes them glide in pitch, like a tape delay.', '350 ms ≈ a dotted eighth at 128 BPM.'],
    ['fx_dfb', 'How much of each echo is fed back: more repeats. Echoes alternate between left and right and get darker with every repeat.', 'Above 70 % the repeats last many seconds.'],
    ['fx_dmix', 'Level of the echoes added to the sound.', ''],
    ['fx_rsize', 'Reverb decay length, from a small room to a long hall.', ''],
    ['fx_rmix', 'Level of the reverb added to the sound.', '15–25 % for most sounds; 40 %+ for pads.'],
    [{ key: 'master', label: 'VOLUME' }, 'Master output level — the small knob in the header, next to the stereo meter. Hover over it to read the value.', 'Lower it when the meter sits at the top: the output limiter is then working hard.'],
  ];
  return `<p>The effects process the sum of all voices — wavelet sound and sub oscillator together — in this order: <b>saturation → ping-pong delay → reverb → DC blocker → master volume → soft limiter</b>. The delay and reverb mix knobs <em>add</em> the effect on top of the unchanged dry sound (there is no dry/wet crossfade), so raising them also makes the sound a little louder. The reverb receives the echoes of the delay as well.</p>
${controls(rows)}
<ul>
<li><b>Ping-pong delay.</b> The mono sum of the voices enters the left channel; each repeat crosses to the other side and passes a gentle low-pass, so echoes bounce between the speakers and darken as they fade.</li>
<li><b>Reverb.</b> A Freeverb-style stereo reverb (eight comb and four all-pass filters per channel) with fixed high-frequency damping; ${P('fx_rsize')} sets the decay.</li>
<li><b>Output stage.</b> A 10 Hz DC blocker removes any offset, then the master ${ctl('VOLUME')} is applied, then a soft limiter: it is transparent below −3 dBFS and never lets the output exceed 0 dBFS, so the instrument cannot clip your audio interface or your Live track.</li>
<li><b>Meter.</b> The stereo meter shows the output peak over the top 48 dB; the top of the bars is 0 dBFS. If the bars sit near the top, the limiter is working: lower ${ctl('VOLUME')}, ${P('f_res')} or the number of unison copies for a cleaner sound.</li>
</ul>`;
}

// ---------------------------------------------------------------- displays
function displaysSection(E) {
  const a = isA(E);
  const rows = [
    [ctl('SCOPE'), a
      ? 'One cycle of the sound. Teal = the output, grey = the dry (unfiltered) cycle, shaded area = the POSITION window.'
      : 'One cycle of the sound: the sum of the band layers (“SUM OF ATOM BANDS”); shaded area = the POSITION window.',
      'At rest it shows the patch as set (cutoff, no envelopes, LFO or velocity). While you play it follows the most recent note live, tagged e.g. “C4 · LIVE”.'],
    [ctl('SCALOGRAM'), `The 11 bands as rows (B1 at the bottom, B11 at the top), one cell per atom. Brightness = size of the atom after the band gains, on a 60 dB scale: black = more than 60 dB down. The dashed line is the POSITION window.`,
      'Fine rows have more atoms than pixels; each pixel then shows the largest atom it covers.'],
    [ctl('ATOM SHAPE'), 'One atom of the selected wavelet (ψ) and the length of its filter in taps.', 'Longer = smoother, more “sine-like” bands.'],
    ...(a ? [[ctl('SOURCE CYCLE'), 'The selected wave in grey, the cycle after SPARSITY in teal, and how many atoms are kept out of the nz atoms the wave needs: “K / nz ATOMS KEPT”.', 'Only engine A has this display.']] : []),
    [ctl('WINDOW'), 'The POSITION window over one cycle. Reads “WINDOW OFF · RAISE DEPTH” while DEPTH is 0 %.', ''],
    ['ADSR curves', 'The shape of the AMP and MOD envelopes, on a logarithmic time axis.', ''],
    ['Voice LEDs', 'Available (dim) and sounding (lit) voices, to the right of the portamento selector.', ''],
    ['Meter', 'Left and right output peak, top = 0 dBFS.', ''],
  ];
  return `${table(['Display', 'What it shows', 'Good to know'], rows, 'compact')}
<p class="small muted">The SCOPE and SCALOGRAM draw the cycle as it is stored, before the per-note band limiting described in <a href="#bands">Where the bands are</a>; on high notes the finest rows are not actually played. The sub oscillator is not drawn.</p>`;
}

// ---------------------------------------------------------------- demo (web app): songs from web/js/demo_data.js,
// the hand-written Toccata scenes from web/js/demo.js (everything is read at build time, nothing is typed twice)
function loadDemo() {
  const vm = require('vm'), fs = require('fs'), path = require('path');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(L.ROOT, 'web', 'js', 'demo_data.js'), 'utf8'), ctx);
  const songs = vm.runInContext('typeof WS_DEMO_SONGS !== "undefined" ? WS_DEMO_SONGS : []', ctx);
  const src = fs.readFileSync(path.join(L.ROOT, 'web', 'js', 'demo.js'), 'utf8');
  let toccata = null;
  try {   // evaluate the beginning of WSDemo (constants + TOCCATA) without the browser parts
    const a = src.indexOf("'use strict';"), b = src.indexOf('// ---------------------------------------------------------------- scene templates');
    if (a > 0 && b > a) {
      const f = vm.runInContext('(function (api) {' + src.slice(a + 13, b) + '\nreturn typeof TOCCATA !== "undefined" ? TOCCATA : null; })', ctx);
      toccata = f({ C, P: C.P, PARAMS: SPEC.PARAMS });
    }
  } catch (e) { console.warn('demo.js: could not read the Toccata scenes (' + e.message + ')'); }
  let tour = null;
  try {   // the preset tour of the default demo, computed by demo.js itself (tourPlan)
    ctx.WS_SPEC = SPEC;
    vm.runInContext(src, ctx);
    tour = vm.runInContext('WSDemo', ctx)({ C, P: C.P, PARAMS: SPEC.PARAMS }).tourPlan(0);
  } catch (e) { console.warn('demo.js: could not compute the preset tour (' + e.message + ')'); }
  const mx = /MAX_FILE_SECONDS\s*=\s*(\d+)/.exec(src);
  return { songs, toccata, tour, maxFile: mx ? +mx[1] : 360 };
}
const DEMO = loadDemo();
const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const mmssMenu = s => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');   // as shown in the DEMO menu
function demoScenes(scenes) {
  const engOf = name => { const pr = SPEC.PRESETS.find(p => p.name === name); return pr ? pr.values[C.P.engine] : null; };
  const fmt = (key, v) => { const p = PK[key]; return p.fmt === 'choice' ? p.choices[Math.round(v)] : C.format(p, v); };
  let eng = null;
  const rows = scenes.map((sc, k) => {
    if (sc.preset) eng = engOf(sc.preset);
    if (sc.set && sc.set.engine != null) eng = sc.set.engine;
    let what;
    if (sc.param === 'drawbars') what = `${ctl('1 … 11')} drawbars: a wave travels from band 1 to band 11`;
    else {
      const p = PK[sc.param];
      const change = sc.ramp ? `${fmt(sc.param, sc.ramp[2])} → ${fmt(sc.param, sc.ramp[3])}` : sc.steps ? sc.steps.map(s => fmt(sc.param, s[1])).join(' → ') : '';
      what = `${ctl(p.short)} ${change}`;
      if (sc.set && sc.set.lfo_pos > 0) what += `, with ${ctl('LFO')} ${ctl(PK.lfo_pos.short)} ${fmt('lfo_pos', sc.set.lfo_pos)}`;
    }
    return [mmss(sc.t), `<b>${k + 1}. ${sc.section}</b><span class="host">${eng === 0 ? 'Engine A' : eng === 1 ? 'Engine B' : ''}</span>`, what, `<span class="small">${sc.text}</span>`];
  });
  return table(['Time', 'Scene', 'Animated', 'Explanation in the demo window'], rows, 'compact');
}
function demoSpeeds() {   // tempo factors used by tools/make_demo.js (files without tempo mark)
  try {
    const src = require('fs').readFileSync(require('path').join(L.ROOT, 'tools', 'make_demo.js'), 'utf8'), o = {};
    for (const m of src.matchAll(/id:\s*'(\w+)'[^}]*?speed:\s*([\d.]+)/g)) o[m[1]] = +m[2];
    return o;
  } catch (_) { return {}; }
}
function demoTour() {   // preset-tour settings, read from web/js/demo.js
  const src = require('fs').readFileSync(require('path').join(L.ROOT, 'web', 'js', 'demo.js'), 'utf8');
  const tours = {};
  for (const m of src.matchAll(/(\w+):\s*\{\s*tour:\s*([\d.]+)/g)) tours[m[1]] = +m[2];
  const att = /TOUR_MAX_ATTACK\s*=\s*([\d.]+)/.exec(src), voices = /TOUR_SAFE\s*=\s*\{[^}]*v_voices:\s*(\d+)/.exec(src);
  const dmix = /TOUR_MAX_DELAY_MIX\s*=\s*([\d.]+)/.exec(src), dfb = /TOUR_MAX_DELAY_FB\s*=\s*([\d.]+)/.exec(src);
  return { tours, maxAttack: att ? +att[1] : null, voices: voices ? +voices[1] : null, maxDMix: dmix ? +dmix[1] : null, maxDFb: dfb ? +dfb[1] : null };
}
function demoSection(E) {
  const S = DEMO.songs, toc = S.find(s => s.id === 'toccata'), speeds = demoSpeeds(), TOUR = demoTour();
  const composers = [...new Set(S.map(s => s.composer).filter(Boolean))];
  const isPD = s => /public domain/i.test(s.license || '');
  const def = S[0], step = def ? TOUR.tours[def.id] : null, NP = SPEC.PRESETS.length;
  const kind = s => TOUR.tours[s.id] ? `Preset tour (default)` : s.id === 'toccata' && DEMO.toccata ? 'Hand-written scenes' : 'Automatic scenes';
  const songRows = S.map(s => [
    `${s.url ? `<a href="${s.url}"><b>${s.short || s.title}</b></a>` : `<b>${s.short || s.title}</b>`}<span class="host">${s.title}</span>`,
    s.composer || '', mmssMenu(s.duration), kind(s),
    `<span class="small">${s.license || ''}${isPD(s) ? '' : ` — ${s.source}`}${speeds[s.id] ? ` · played ${speeds[s.id]}× faster (the MIDI file has no tempo mark)` : ''}</span>`]);
  const nonPD = S.filter(s => !isPD(s));
  const plan = DEMO.tour || [], NT = plan.length;   // [{ t, preset }] as demo.js plays it
  const tourName = k => (plan[k] ? plan[k].preset : '');
  const firstNames = [0, 1, 2, 3].map(tourName).filter(Boolean);
  const shotPreset = tourName(2);
  const favs = SPEC.PRESETS.slice(0, SPEC.TOP).map(p => p.name);   // beta 0.5: OktoPierre's TOP Sounds
  const lead = [];   // the presets that open the tour before the TOP Sounds (OktoPierre's choice)
  for (const x of plan) { if (favs.includes(x.preset)) break; lead.push(x.preset); }
  let nFav = 0;   // the TOP Sounds that follow, in a row
  for (let k = lead.length; k < NT && favs.includes(plan[k].preset); k++) nFav++;
  return `<h3 id="demo">Demo (web app)</h3>
<p>The demo control next to the logo is a split button. ${ctl('▶ DEMO')} plays the default demo straight away; the small ${ctl('▾')} beside it opens the list of all demo pieces and ${ctl('Load a MIDI file…')}. While a demo plays, the main button reads ${ctl('■ STOP')}. The ${S.length} pieces, by ${composers.length > 1 ? composers.slice(0, -1).join(', ') + ' and ' + composers[composers.length - 1] : composers[0]}, are free editions from the Mutopia Project, each cut after about two minutes at the end of a phrase; the notes are played sample-accurately by a sequencer inside the audio engine.</p>
${def && step ? `<h4 id="demo-tour">The default demo: a tour of the presets</h4>
<p>${ctl('▶ DEMO')} plays ${def.composer} — <i>${def.short || def.title}</i> (${mmssMenu(def.duration)}) as a <b>preset tour</b>${def.origin ? `, starting with the phrase that follows the opening chords (${def.origin.toFixed(1)} s into the movement)` : ''}: about every ${step} seconds, on a change of chord in the music, the next preset is loaded — ${firstNames.map(n => `<b>${n}</b>`).join(' → ')} … — ${NT} presets in all: ${lead.length ? `${lead.map(n => `<b>${n}</b>`).join(', ')} to open, then ` : ''}${nFav} of OktoPierre’s TOP Sounds${lead.length ? '' : ' first'}, then ${NT - nFav - lead.length} presets that show the chorus, the sub oscillator and the mix of the two engines. The sequence is fixed in the demo, so new factory presets (there are ${NP}) do not change it. The preset browser in the header shows the name of the preset being played (with the “•” modified mark while a control moves).</p>
<ul>
<li>To keep every preset playable on the piece, each preset is played polyphonic${TOUR.voices ? ` (${TOUR.voices} voices)` : ''}, at its normal octave, without glide${TOUR.maxAttack ? ` and with its attack shortened to at most ${Math.round(TOUR.maxAttack * 1000)} ms` : ''}${TOUR.maxDMix != null ? `; long echoes are reduced (delay mix at most ${Math.round(TOUR.maxDMix * 100)} %, feedback at most ${Math.round(TOUR.maxDFb * 100)} %) so the fast piece stays clear` : ''}. The presets themselves are not changed.</li>
<li>The demo window shows “Preset tour · <i>n</i>/${NT} · Engine A/B” (<i>n</i> = the preset’s place in the tour), “Now playing:” with the preset’s name, a countdown to the next preset with its name, and a one-line summary of the sound, ending with “Played polyphonic at its normal octave, with short echoes.”</li>
</ul>
${fig('demo.png', `The default demo about 9 seconds in: the tour has reached its third preset, “${shotPreset}” (hence “3/${NT}”). The window counts down to the next preset and summarises the sound; the scope runs live and the keys of the playing notes light up.`, 'shot')}` : ''}
<h4 id="demo-songs">All demo pieces</h4>
${S.length ? table(['Piece', 'Composer', 'Length', 'Demo', 'Licence'], songRows, 'compact') : ''}
${fig('demo-menu.png', 'The ▾ menu: composer — short title and length (hover over an entry for the full title); the default demo is tagged DEFAULT; then “Load a MIDI file…”.', 'shot narrow-fig')}
<ul>
<li><b>Scenes.</b> The other pieces animate the controls instead of changing presets: a series of scenes follows the phrases, each varying one control. ${toc && DEMO.toccata ? `The ${toc.short || toc.title} has ${DEMO.toccata.length} hand-written scenes (table below); the remaining pieces get` : 'The pieces get'} scenes placed automatically at the natural pauses of the music, from a list of scene templates chosen for each piece: filter sweep, resonance, filter slope, source wave, position window, sparsity, sub oscillator, wavelet atom shape, tilt, atom patterns, drawbars, ping-pong delay, unison and a reverb finale. The window then shows the scene and engine, “Now varying:” with the parameter’s name, its live value and range, and a one-line explanation, and the animated control glows on the panel.</li>
<li><b>Start and stop.</b> ${ctl('▶ DEMO')} starts the default demo; ${ctl('▾')} lets you pick any piece (the list opens without starting the audio). Stop with ${ctl('■ STOP')} in the header or in the demo window, or with ${kbd('Esc')} (when the manual overlay is closed). Drag the demo window by its title bar to move it out of the way; it also shows the progress, the time and the source and licence of the music.</li>
<li><b>Your sound is safe.</b> When a demo ends or is stopped, the sound you had before is restored exactly; your preset and settings are not changed. During a demo the preset browser shows what is being played: during the preset tour exactly the current preset’s name; in the other demos the name of the scene’s starting preset with the “•” modified mark (the Toccata, for example, starts on “B · Octave Organ•”). Your preset name comes back when the demo stops, and changes you make on the panel during the demo are discarded.</li>
<li><b>Play along.</b> The keyboard, the computer keys and a MIDI keyboard keep working during the demo; the demo’s own notes also light up the on-screen keyboard.</li>
<li><b>One window at a time.</b> Closing or leaving the page stops the demo and the audio immediately. If the app is open in two windows or tabs of the same browser, only one plays: starting the audio in one pauses the other, which then shows “The synthesizer is playing in another window or tab, so this one was paused.” and a ${ctl('Click to play here')} button to take the audio back.</li>
</ul>
<h4 id="demo-file">Playing your own MIDI file</h4>
<p>Choose ${ctl('Load a MIDI file…')} in the ${ctl('▾')} list and pick a <code>.mid</code> file: it is played with automatically generated scenes, like the demo pieces. Drums (MIDI channel 10) are ignored, and only the first ${Math.round(DEMO.maxFile / 60)} minutes are played; a file without playable notes is refused with a message.</p>
${note('<p>Only play music that is in the public domain or that you have the right to use. No copyrighted songs are bundled with the instrument: every demo piece is a free edition from the Mutopia Project, listed above with its licence.</p>')}
${toc && DEMO.toccata ? `<h4 id="demo-toccata">The ${toc.short || toc.title} scenes</h4>${demoScenes(DEMO.toccata)}` : ''}
<p class="small muted">Demo music: MIDI files from the <a href="https://www.mutopiaproject.org/">Mutopia Project</a>.${nonPD.length ? ' ' + nonPD.map(s => `<i>${s.title}</i> (${s.composer}) is licensed ${s.license} — ${s.source}; its converted note data in the app is shared under the same licence.`).join(' ') + ' All other pieces are in the public domain.' : ' All pieces are in the public domain.'} The full list of sources and licences is in <code>tools/demo/SOURCE.md</code>. The demo is part of the web app only; the VST3 plugin has no DEMO button.</p>`;
}

// ---------------------------------------------------------------- playing
function playingSection(E) {
  return `${demoSection(E)}
<h3 id="kbd-screen">On-screen keyboard and wheels</h3>
<ul>
<li>The keyboard spans five octaves, C2 to C7. Click a key to play it; the vertical position sets the velocity — from 35 % at the top of a key to 100 % at its bottom edge. Drag across the keys to slide from note to note.</li>
<li>The <b>PITCH</b> wheel bends by up to ±2 semitones and springs back to the centre when you let go. The <b>MOD</b> wheel adds vibrato (up to 50 cents, through the LFO) and stays where you leave it. Both wheels follow incoming MIDI.</li>
<li>Held notes light up in the accent colour; a thin coloured strip above the keys shows the range played by the computer keyboard.</li>
</ul>
<h3 id="kbd-computer">Computer keyboard (web app)</h3>
<figure class="frame"><img src="img/keys-${E}.svg" alt="Computer keyboard map"><figcaption><b>Computer keyboard map.</b> The digit row plays the white keys (do ré mi fa sol la si do ré mi); the letter rows play chromatically like a piano; ${kbd('Z')} / ${kbd('X')} move the whole map down or up an octave.</figcaption></figure>
${table(['Keys', 'Notes', 'Notes on use'], [
    [`${kbd('1')} ${kbd('2')} ${kbd('3')} ${kbd('4')} ${kbd('5')} ${kbd('6')} ${kbd('7')} ${kbd('8')} ${kbd('9')} ${kbd('0')}<br><span class="small muted">and numeric keypad 1–9, 0</span>`, 'C D E F G A B C D E', 'White keys only — quick for melodies. Starts on the same C as the letter rows.'],
    [`${kbd('A')} ${kbd('W')} ${kbd('S')} ${kbd('E')} ${kbd('D')} ${kbd('F')} ${kbd('T')} ${kbd('G')} ${kbd('Y')} ${kbd('H')} ${kbd('U')} ${kbd('J')}`, 'C C♯ D D♯ E F F♯ G G♯ A A♯ B', 'Middle letter row = white keys, row above = black keys.'],
    [`${kbd('K')} ${kbd('O')} ${kbd('L')} ${kbd('P')} ${kbd(';')} ${kbd('\'')}`, 'C C♯ D D♯ E F (next octave)', ''],
    [`${kbd('Z')} / ${kbd('X')}`, 'Octave down / up', 'Base note from C1 to C7; the status bar shows it (“octave C4” by default).'],
  ], 'compact')}
<ul>
<li>Physical key positions are used, so the map works on any layout. On <b>AZERTY</b> the white keys are ${kbd('Q')} ${kbd('S')} ${kbd('D')} ${kbd('F')} ${kbd('G')} ${kbd('H')} ${kbd('J')} ${kbd('K')} ${kbd('L')} ${kbd('M')} ${kbd('Ù')}, the black keys ${kbd('Z')} ${kbd('E')} ${kbd('T')} ${kbd('Y')} ${kbd('U')} ${kbd('O')} ${kbd('P')}, the octave keys ${kbd('W')} / ${kbd('X')}, and the digit row plays without ${kbd('Shift')}. On <b>QWERTZ</b>, ${kbd('Z')} and ${kbd('Y')} swap places.</li>
<li>Computer-keyboard notes play at a fixed velocity of 80 %. Holding a key does not repeat the note.</li>
<li>Keys are ignored while the manual overlay is open, while you type in a text field, and together with ${kbd('Ctrl')}, ${kbd('Alt')} or ${kbd('⌘')}. If the browser window loses focus, held notes are released.</li>
<li>The VST3 plugin has no computer-keyboard map of its own: use Live’s Computer MIDI Keyboard (${kbd('M')}).</li>
</ul>
<h3 id="midi">MIDI</h3>
<p>The web app uses Web MIDI, which works best in Chrome and Edge (if a browser does not offer it, the status bar says <i>MIDI: not supported by this browser</i>). When audio starts it asks for MIDI access, listens to <b>all connected inputs</b>, and lists the devices in the status bar (e.g. <i>MIDI: KeyStep 37</i>). Devices plugged in later are picked up automatically. In the plugin, MIDI comes from the Live track.</p>
<p><b>Without a DAW (dawless).</b> Keyboards, sequencers and controllers connected to the computer (USB or a MIDI interface) play the web app directly, also from the online version, which is served over https as Web MIDI requires.</p>
<ul>
<li><b>Channel.</b> The selector in the status bar chooses the input channel: <i>MIDI ch: all</i> (default) or one channel 1–16, for example to play the synthesizer from one track of a hardware sequencer.</li>
<li><b>Program Change</b> selects a preset: program 0 is the first preset of the list, program 1 the second, and so on (your user presets follow the factory presets). The status bar shows the program and the preset.</li>
<li><b>MIDI learn.</b> Right-click a control on the panel (knob, drawbar or selector): it lights up and the status bar asks you to move a knob or fader on your controller. The control change you move is then linked to that control and moves it over its whole range. ${kbd('Esc')} cancels, ${kbd('Delete')} unlinks the control. A control’s tooltip shows its linked CC. A learned link takes priority over the default meaning of that CC (for example CC 1). Links and the channel are kept in this browser.</li>
</ul>
${table(['MIDI message', 'Effect'], [
    ['Note on / off', 'Plays notes; velocity 1–127 sets the velocity used by the AMP ENVELOPE and VEL AMT.'],
    ['Pitch bend', '±2 semitones.'],
    ['CC 1 — mod wheel', 'Adds up to 50 cents of vibrato through the LFO.'],
    ['CC 64 — sustain pedal', 'Held notes keep sounding until the pedal is released.'],
    ['CC 120 — all sound off', 'Silences everything at once, including delay and reverb tails (web app).'],
    ['CC 123 — all notes off', 'Releases all notes; their release tails fade out normally (web app). Useful after a stuck note.'],
    ['Program Change 0–127', 'Selects the preset with that number in the preset list (web app).'],
    ['Any other CC 0–119', 'Moves the panel control linked to it by MIDI learn (web app).'],
    ['Clock, start / stop, SysEx', 'Ignored.'],
  ], 'compact')}
<h3 id="poly">Polyphony, mono, glide and unison</h3>
<ul>
<li>${P('v_voices')} sets the polyphony (1–16). At 1 the instrument is mono and legato with last-note priority — the classic lead and bass behaviour.</li>
<li>${P('v_glide')} sets the glide time and the portamento selector decides when notes glide: ${ctl('OFF')} never, ${ctl('POLY')} every voice from its own previous note (polyphonic portamento, see <a href="#voice">Voice</a>), ${ctl('LEGATO')} only while another key is held. In mono, play legato (keep the previous key held) to slide without restarting the envelopes.</li>
<li>${P('v_unison')}, ${P('v_detune')} and ${P('v_width')} thicken each note with up to four detuned copies spread in stereo.</li>
<li>Pitch reference: MIDI note 69 (A4) = 440 Hz, before ${P('v_oct')} and ${P('v_fine')}.</li>
</ul>`;
}

// ---------------------------------------------------------------- presets: browsing & saving
function presetsSaving(E) {
  return `<h3 id="saving">Browsing and saving presets</h3>
<div class="pair" style="grid-template-columns: 1fr 260px; align-items: start;">
<div>
<p>The preset browser sits in the header. The ${SPEC.PRESETS.length} factory presets start with OktoPierre’s ${SPEC.TOP} <b>TOP Sounds</b> (beta 0.5: his selection, from <b>${SPEC.PRESETS[0].name}</b> to <b>${SPEC.PRESETS[SPEC.TOP - 1].name}</b>); the others follow sorted by category, like the banks of a hardware synthesizer — ${SPEC.CATEGORIES.filter(c => c !== 'Init').join(', ')} — with the two Init presets last. ◀ ▶ step through them in that order (and then, in the web app, through your own). Clicking the name opens the list: in the web app <b>★ TOP SOUNDS</b> at the top, then one group per category, then your USER PRESETS. A click on a group title opens or closes it (the number at its right is the number of presets in it); TOP Sounds, your user presets and the group of the current preset start open. A coloured letter before each name gives its engine (A in teal, B in amber; AB in both colours = the two engines mixed). A dot after the preset name means the sound has been modified since it was loaded. The tables in this manual list the presets by category, separately for each engine.</p>
<p><b>Preset browser</b> (beta 0.3, web app and plugin). A panel at the right of the synth lists the sound types with their number of sounds — <b>TOP Sounds</b> first (beta 0.5: OktoPierre’s selection of his best sounds and Source Phase sounds), then the categories, <b>Source Phase</b> first — and the sounds of the type selected: one click plays a sound; ★ marks a TOP sound and a number OktoPierre’s vote in his listening test. The <b>arrow keys</b> choose too (beta 0.5): ${kbd('↑')} ${kbd('↓')} play the sound above or below, ${kbd('←')} ${kbd('→')} show the category above or below (in the plugin after a click in the browser, so that it has the keyboard; with the browser hidden they step through the presets like ◀ ▶). FACTORY / USER PRESETS (USER BANK in the plugin) tabs; ${ctl('HIDE ▸')} folds it away and a click on the preset name brings it back. In the web app it only selects sounds; the plugin also saves and arranges them (see the plugin section).</p>
<p><b>Web app.</b> The buttons at the right of the status bar manage your own sounds:</p>
<ul>
<li><b>Save preset</b> asks for a name (up to 40 characters) and stores the sound in this browser’s storage, in the USER PRESETS group.</li>
<li><b>Export</b> downloads the current sound as a <code>.json</code> file named after the preset — the way to back up sounds or move them to another computer.</li>
<li><b>Import</b> loads such a file, adds it to the user presets and selects it. Parameters missing from the file take their default value.</li>
<li>To delete a user preset, open the list, hover over it and click ✕ (you are asked to confirm). Factory presets cannot be deleted.</li>
<li>The app always opens on <b>${SPEC.PRESETS[SPEC.DEFAULT_PRESET].name}</b>; it does not bring back the sound you had when you closed it. Save or export a sound you want to keep — your user presets stay in the list.</li>
</ul>
<p><b>VST3 plugin.</b> ◀ ▶ step through the factory presets in the same order; the preset menu (a standard Windows menu) shows TOP Sounds at the top and one submenu per category, with the number of presets in it. Save your own sounds with Live: the plugin’s settings are stored in the Live Set, and you can save the device as a Live preset (or inside an Instrument Rack) to reuse it in other projects. A new instance starts on <b>${SPEC.PRESETS[SPEC.DEFAULT_PRESET].name}</b>.</p>
</div>
<figure class="shot" style="margin:0"><img src="img/presets-menu.png" alt="The factory preset list of the web app"><figcaption>The web app’s preset list: OktoPierre’s TOP Sounds first, then one folding group per category (click a title to open it); a teal A, an amber B or both before each name.</figcaption></figure>
</div>
${note('<p>User presets saved in the browser live in that browser profile only. Private windows and “clear site data” erase them — use <b>Export</b> for anything you want to keep.</p>')}`;
}

// ---------------------------------------------------------------- VST
function vstSection(E) {
  return `<p>The plugin runs the same sound engine with the same panel. It is a single self-contained file inside a <code>WaveletSynthesizer.vst3</code> bundle folder, which also carries these manuals; nothing else needs to be installed. The same file is both a VST3 and a VST2 plug-in (a copy named <code>WaveletSynthesizer.dll</code> sits next to it for VST2 hosts), so the folder works in a VST3 folder and in a VST2 folder. This section lists only what is specific to the plugin.</p>
<h3 id="vst-install">Installation (Windows 10/11, 64-bit)</h3>
<ol class="steps">
<li>Copy the <b>whole</b> <code>WaveletSynthesizer.vst3</code> folder — the manuals live inside it — into one of these:
<ul><li><b>VST3</b> (recommended): <code>C:\\Program Files\\Common Files\\VST3</code>. <code>vst\\install.bat</code> does it and asks for administrator rights.</li>
<li><b>VST2</b>: the folder set as <b>VST2 Plug-in Custom Folder</b> in Live (no administrator rights needed).</li></ul></li>
<li>Start Live and open <b>Preferences → Plug-ins</b>. Switch on <b>Use VST3 Plug-in System Folders</b> (VST3) or <b>Use VST2 Plug-in Custom Folder</b> (VST2) and click <b>Rescan</b>. If both are on and see the folder, Live lists the plugin twice, once as VST3 and once as VST2; use either.</li>
<li>In the browser, open <b>Plug-ins</b>: <b>Wavelet Synthesizer</b> is listed under the vendor <b>${SPEC.APP.credit.replace(/^created by /, '')}</b>. Drag it onto a MIDI track (or double-click it with a MIDI track selected).</li>
</ol>
<p class="small muted">Building the plugin from source (with the portable llvm-mingw toolchain and <code>vst\\build.bat</code>) is described in the project’s <code>README.md</code>.</p>
<h3 id="vst-diff">Differences from the web app</h3>
<ul>
<li><b>No start button, no DEMO button and no status bar.</b> Audio runs as soon as the plugin is loaded; there are no Save / Export / Import buttons (the plugin has its PRESET BROWSER, SAVE PRESET and user bank instead, see below). In the header, the place of the web app’s DEMO button holds the window-size button.</li>
<li><b>Presets.</b> A new instance starts on <b>${SPEC.PRESETS[SPEC.DEFAULT_PRESET].name}</b>. ◀ ▶ step through the ${SPEC.PRESETS.length} factory presets (those you deleted are skipped). Clicking the preset name opens the <b>preset browser</b>; a <b>right-click</b> on it opens the classic Windows menu (TOP Sounds, one submenu per category, the USER BANK, and the save / restore / delete / export commands). You can also keep sounds with Live: as a device preset, inside an Instrument Rack, or simply in the Live Set. The plugin remembers the selected preset, and whether the browser is open, with the Live Set.</li>
<li><b>Preset browser</b> (beta 0.3). A panel at the right of the synth (${ctl('HIDE ▸')} folds it away and the window gets narrower; a click on the preset name brings it back). Two tabs: <b>FACTORY</b> and <b>USER BANK</b>. The left column lists the sound types with their number of sounds — <b>TOP Sounds</b> first (OktoPierre’s selection), then <b>Source Phase</b>, Bass, Lead, Keys, Organ, Pad… — and the right column the sounds of the type selected: <b>one click loads a sound</b>, and so do the <b>arrow keys</b> (beta 0.5) once you have clicked in the browser: ${kbd('↑')} ${kbd('↓')} the sound above or below, ${kbd('←')} ${kbd('→')} the category above or below. A long list scrolls with the mouse wheel or with the <b>scroll bar</b> at its right (beta 0.4: wide enough for a trackpad — drag it, or click the bar where you want to go). Each sound shows its engine letters (A, B or AB), ★ for a TOP sound, OktoPierre’s vote (7–10) for the voted ones and ${ctl('ADJ')} for a preset you adjusted. Above the list, ${ctl('▲')} ${ctl('▼')} move the sound playing up or down in that list. <b>Moving a sound to another category</b> (beta 0.5): drag it onto a category of the left column — onto TOP Sounds it is added there — or right-click it: <b>Move to ▸</b> a category, <b>Back to</b> its own category, <b>Add to TOP Sounds</b> / <b>Remove from TOP Sounds</b>. In the USER BANK tab a sound dragged onto a section moves to that section. All of it is kept in the presets file (and shared with EXPORT / IMPORT). Below: ${ctl('TO BANK…')} (save the sound to the user bank), ${ctl('RESTORE')} (the original of an adjusted factory preset), ${ctl('DELETE')} (a factory preset leaves the lists, a bank sound is deleted), ${ctl('EXPORT…')} (a copy of the presets file) and ${ctl('IMPORT…')} (beta 0.4: another presets file replaces yours, see <b>The presets file</b> below). <b>Show the presets file</b> (in Windows Explorer or the Finder), the former ${ctl('FILE')} button, is in the right-click menu of the preset name.</li>
<li><b>SAVE PRESET</b> (beta 0.3, left of MANUAL A) overwrites the preset playing. A factory preset is <b>adjusted</b> in place, optionally under a new name (a small window proposes its name); a sound of the user bank is replaced. ${ctl('RESTORE')} brings a factory preset’s original back.</li>
<li><b>User bank</b> (beta 0.3). Your own sounds, sorted in 12 sections: Bass, Lead, Keys, Organ, Pad, Strings, Brass &amp; Wind, Pluck, Bells &amp; Mallets, Chords, FX, Drums &amp; Perc. It is empty at first. ${ctl('TO BANK…')} (or <b>Save to user bank…</b> in the menu) proposes the current name (change it if you like) and a section; the preset name then reads <b>USER · <i>name</i></b>. Saving a name that already exists in that section asks before replacing it.</li>
<li><b>The presets file</b> (beta 0.3). Everything above lives in one readable text file, <code>OKTOWAVE presets.txt</code>, kept <b>next to</b> the <code>WaveletSynthesizer.vst3</code> folder (so that installing a new version keeps it), shared by every instance and Live Set, and read again when you reopen Live: every factory preset (“Adjusted: yes” for those you saved, “Deleted: yes” for those you deleted), the order of every list, and the user bank; for each sound it lists the parameters that differ from the defaults. That folder must allow writing: the VST3 system folder <code>C:\\Program Files\\Common Files\\VST3</code> needs administrator rights, so the plugin says so if it cannot save there. A deleted factory preset comes back with a right-click on the preset name, <b>Deleted presets</b>. ${ctl('IMPORT…')} (beta 0.4; also <b>Import presets (.txt), replacing yours…</b> in the right-click menu) reads such a file — an ${ctl('EXPORT…')} copy, a friend’s <code>OKTOWAVE presets.txt</code> — and, after a question, <b>replaces</b> your adjusted and deleted presets, list order and user bank with its own; your previous file is first kept next to it as <code>OKTOWAVE presets (backup <i>date time</i>).txt</code> (to go back, import that copy). A file without presets is refused and nothing changes.</li>
<li><b>Mouse.</b> Drag vertically (${kbd('Shift')} = fine), use the mouse wheel (${kbd('Shift')} = fine), and double-click or ${kbd('Ctrl')} + click to reset a control to its default. A knob with only a few positions (SUB ${ctl('OCT')}, the SHAPE knobs) moves with a short drag, and a <b>click</b> goes to its next value. Hovering shows the value, as in the web app.</li>
<li><b>Playing.</b> The on-screen keyboard and wheels work with the mouse, but there are no computer-keyboard notes: arm the track and use a MIDI keyboard or Live’s Computer MIDI Keyboard (${kbd('M')}). Pitch bend, the mod wheel and the sustain pedal arrive from the track’s MIDI.</li>
<li><b>Manuals.</b> ${ctl('MANUAL A')} and ${ctl('MANUAL B')} open the copies stored in the bundle (<code>Contents\\Resources\\manual\\manual-a.html</code> and <code>manual-b.html</code>) in your default web browser.</li>
<li><b>Version.</b> The plugin reports vendor ${SPEC.APP.credit.replace(/^created by /, '')} and version ${SPEC.APP.versionNum} (${SPEC.APP.version}); the panel shows “${SPEC.APP.credit} · ${SPEC.APP.version}”.</li>
<li><b>Window size.</b> The small size button next to the logo opens a menu of window sizes: 70, 80, 90, 100, 115, 130 and 150 %. The choice is saved with the Live Set.</li>
</ul>
<h3 id="automation">Automation</h3>
<p>All panel parameters can be automated, under their full names — the “host” names given in the control tables of this manual, for example <i>Cutoff</i>, <i>Envelope Amount</i>, ${isA(E) ? '<i>Source Wave</i>, <i>Sparsity</i>' : '<i>Band 3 Level</i>, <i>Body Decay</i>'}. In Live, pick them in the track’s automation chooser, or click the plugin’s <b>Configure</b> button and move a control to add it to the device view.</p>
${tip(`<p>${isA(E) ? `${P('a_wave')}, ${P('a_width')}, ${P('a_sparsity')}` : `${P('b_pattern')}, ${P('b_seed')}`}, ${P('wavelet')} and ${ctl('ENGINE')} rebuild the wave tables when they change. While playing in real time the new tables are built in the background and crossfaded over about 10 ms, so a ramp on these controls moves in small steps rather than as a smooth sweep. When Live renders offline (export or freeze), each change is rebuilt immediately, so the render matches what you automated. For smooth, continuous movement automate the filter, the POSITION window${isA(E) ? '' : ', the drawbars, TILT'} or the effect levels.</p>`)}`;
}

// ---------------------------------------------------------------- troubleshooting
function troubleshooting(E, extra) {
  const a = isA(E);
  const items = [
    ['No sound in the web app', `<ul><li>Did you click <b>Click to start audio</b>? The status bar must read <i>Audio on</i>.</li><li>Check the header ${ctl('VOLUME')} knob (double-click resets it to −3 dB) and your system volume. The meter should move when you play.</li><li>Check the patch: an AMP ${P('amp_s')} of 0 % with a very short DECAY, ${a ? `a ${P('f_cutoff')} plus ${P('f_env')} below about 1, or a high-pass with a high cutoff` : 'all drawbars down, a low CUTOFF, or a SCALE SUSTAIN of 0 % with very short BODY and BRIGHT times'} can all make a note almost silent. Load <b>${a ? 'A · Init' : 'B · Init'}</b> to start from a known sound.</li></ul>`],
    ['“Audio error: …” in the status bar', `<p>The browser could not start the audio engine. Use a current Chrome, Edge or Firefox (the engine needs AudioWorklet support) and reload the page. As a last resort, if a locked-down browser refuses pages opened from disk, serve the folder locally — for example run <code>python -m http.server 8000</code> in the <code>web</code> folder and open <code>http://localhost:8000/</code>.</p>`],
    ['“The manual was not found” (plugin)', '<p>The MANUAL buttons open the manuals stored inside the plugin bundle. Install the complete <code>WaveletSynthesizer.vst3</code> folder, not only the file inside it.</p>'],
    ['I hear two pieces at once, or the sound continues after closing', `<p>The web app plays in only one window or tab at a time: starting the audio in one pauses the others, which show “The synthesizer is playing in another window or tab, so this one was paused.” with a ${ctl('Click to play here')} button, and closing or leaving the page stops its demo and audio at once. If you still hear two pieces, or sound after closing, close the other window or tab of the app (or click its overlay to take the audio there), then reload the page.</p>`],
    ['No sound from the plugin', '<p>Make sure the MIDI track is armed (or its monitor is set to <i>In</i>), that MIDI from your keyboard reaches the track, and that the plugin’s VOLUME is up.</p>'],
    ['My MIDI keyboard is not found', '<p>Use Chrome or Edge, which support Web MIDI. Allow MIDI access when the browser asks; if the status bar says <i>MIDI: access denied</i>, re-enable it in the site permissions and reload. Devices can be plugged in while the page is open.</p>'],
    ['The computer keys do not play', '<p>Click on the panel first so that the page has the keyboard focus, close the manual overlay, and make sure no text field is active. On non-QWERTY keyboards, use the physical positions shown in <a href="#kbd-computer">the key map</a>.</p>'],
    [a ? 'CUTOFF does nothing' : 'The right-hand drawbars do nothing', a
      ? `<p>Two common reasons. First, the selected wave may not have atoms in the bands you are removing: with Haar, ${ctl('SQUARE')} is a single band-1 atom and ${ctl('PULSE')} at 25 % or 75 % needs only two atoms (see <a href="#haar-square">the square wave that will not filter</a>). Second, high bands are not played on high notes: at C4 only bands 1–7 exist, so CUTOFF values from 8 to 12 all sound alike there (see <a href="#bands">Where the bands are</a>).</p>`
      : `<p>That is expected on middle and high notes: each band is about one octave of harmonics, and the instrument only plays harmonics that fit below the anti-alias limit. At C4 only bands 1–7 are played, at C6 bands 1–5; bands 10–11 exist only on the lowest notes. See <a href="#bands">Where the bands are</a>.</p>`],
    ['Harsh, metallic or “folded” tones at the very top', `<p>The tables are band-limited per note, so aliasing normally stays above 19 kHz. Extreme settings — very high notes with ${P('v_oct')} at +3, deep vibrato or pitch bend at the top of the range — can still push harmonics past the limit. Lower the octave, or reduce ${P('lfo_pitch')}. Narrow POSITION windows are widened automatically on high notes for the same reason.</p>`],
    ['Clicks', `<p>Very short AMP attack or release times (1–2 ms) can click, especially on low notes and smooth waves; 3–10 ms is usually clean. Changing ${a ? 'WAVE, WIDTH, SPARSITY' : 'PATTERN, SEED'} or WAVELET while a note sounds is crossfaded and should not click.</p>`],
    ['Squashed or distorted sound, meter at the top', `<p>Resonance (up to +24 dB), unison, big chords, DRIVE and the effect mix knobs all add level. The output limiter never lets the signal exceed 0 dBFS, but when it works hard the sound gets squashed. Lower ${ctl('VOLUME')} or the offending control.</p>`],
    ['High CPU load', `<p>CPU use grows with ${P('v_voices')} × ${P('v_unison')} and with the number of bands that actually sound. Lower UNISON first, then VOICES. Bands whose gain is (almost) zero are skipped, so steep low-pass settings and high notes are cheaper. In the browser, close other heavy tabs.</p>`],
    ['Clicking an engine tab does not change the sound', `<p>That is by design since beta 0.2: ${ctl('A · SUBTRACTIVE')} / ${ctl('B · ADDITIVE')} only choose the panel shown. The sound is set by ${P('ab_mix')} (at the right of the engine section): turn it to A, to B, or in between. The SCALE FILTER, POSITION, envelopes, LFO, voice and effects are shared by both engines — for example the CUTOFF 7 of “A · Init” also filters engine B. Load an engine’s Init preset for a neutral start.</p>`],
    ['My sound is gone after reloading', `<p>That is by design: the web app always opens on <b>${SPEC.PRESETS[SPEC.DEFAULT_PRESET].name}</b>. Keep sounds with <b>Save preset</b> (stored in this browser) or <b>Export</b> (a file). Private windows, another browser or clearing site data lose the browser-stored user presets — exported files are safe.</p>`],
    ['I cannot hear the sub oscillator', `<p>Its ${P('sub_level')} is 0 % by default. At −2 octaves on low notes the sub can be below 20 Hz, which small speakers and most headphones cannot reproduce: try −1 octave, a higher note, or the ${ctl('TRI')} or ${ctl('SQR')} shape, whose harmonics stay audible.</p>`],
  ];
  return `<div class="faq">${(extra || []).concat(items).map(([q, a2]) => `<h4>${q}</h4>${a2}`).join('\n')}</div>`;
}

// ---------------------------------------------------------------- sub oscillator
function subSection(E) {
  const a = isA(E);
  const rows = [
    ['sub_level', `Level of the sub oscillator. 0 % (the default) switches it off; 100 % is about as loud as the main ${a ? 'wavelet' : 'additive'} sound at full scale.`, 'Start around 30–50 % for basses, and watch the meter: the sub adds a lot of energy.'],
    [{ key: 'sub_oct', range: '−1 octave · −2 octaves' }, `How far below the played note the sub sounds: one or two octaves. It follows the pitch exactly, including ${P('v_oct')}, ${P('v_fine')}, glide, pitch bend and vibrato.`, '−2 octaves on low notes goes below 20 Hz: felt more than heard.'],
    [{ key: 'sub_shape', range: 'Sine · Triangle · Square' }, 'Waveform of the sub: a pure sine; a soft triangle (odd harmonics that fall quickly); or a square with strong odd harmonics, band-limited with PolyBLEP so it does not alias.', `On small speakers choose ${ctl('TRI')} or ${ctl('SQR')}: their harmonics stay audible when the fundamental is too low to be reproduced.`],
  ];
  return `<p>The ${ctl('SUB OSC')} section, at the bottom left next to the wheels, adds a simple oscillator one or two octaves below every note — the classic way to give a sound more low end, from a warm bass foundation to infra-bass you feel rather than hear.</p>
${controls(rows)}
<ul>
<li><b>One sub per voice.</b> Every note gets one sub oscillator, centred in the stereo field — not one per unison copy, so ${P('v_unison')}, ${P('v_detune')} and ${P('v_width')} neither thicken nor spread it.</li>
<li><b>Outside the wavelet engine.</b> The sub is added after ${a ? 'the SCALE FILTER and the POSITION window' : 'the drawbars, TILT, SCALE ENVELOPE, SCALE FILTER and POSITION window'}, so none of them affects it: it stays clean and steady while you sweep the wavelet sound. Then the AMP ENVELOPE (and velocity) shapes it like the rest of the note, and it goes through the effects — ${P('fx_drive')} saturates it too.</li>
<li><b>How low?</b> On C2 (65 Hz) the sub sits at 33 Hz (−1 octave) or 16 Hz (−2 octaves); with ${P('v_oct')} at −1 it goes one more octave down. Below about 20 Hz you feel rather than hear it, and laptop speakers, small monitors and most headphones cannot reproduce it at all. The output’s 10 Hz DC blocker softens the very lowest frequencies (about −1.5 dB at 16 Hz, −4 dB at 8 Hz).</li>
<li>The SCOPE and SCALOGRAM show the wavelet sound only; the sub is not drawn.</li>
</ul>`;
}

// ---------------------------------------------------------------- engines A and B mixed (beta 0.2)
function mixSection(E) {
  const a = isA(E);
  const rows = [
    [{ key: 'ab_mix', range: 'A … B' }, 'What you hear: at <b>A</b> only engine A (wavelet subtractive), at <b>B</b> only engine B (wavelet additive), in between both at once — the display reads for example “A 60 · B 40”.', 'Start from a preset of one engine and turn MIX slowly: the other engine fades in under it.'],
  ];
  return `<p>Since beta 0.2 the two engines can play together. The ${P('ab_mix')} knob sits at the right of both engine sections, so it is always in reach.</p>
${controls(rows)}
<ul>
<li><b>The tabs choose the panel, MIX chooses the sound.</b> ${ctl('A · SUBTRACTIVE')} and ${ctl('B · ADDITIVE')} only choose which engine section is shown, to edit it; switching them neither changes the sound nor marks the preset as modified. ${a ? 'Turn MIX towards B, then click B · ADDITIVE to shape the additive layer.' : 'Turn MIX towards A, then click A · SUBTRACTIVE to shape the subtractive layer.'}</li>
<li><b>One note, two layers.</b> Each note plays engine A’s filtered source and engine B’s atoms at the same pitch, with the same AMP ENVELOPE, glide, unison and effects. Both layers go through the SCALE FILTER (engine B also keeps its drawbars, TILT and SCALE ENVELOPE) and through the POSITION window. The sub oscillator is added once, whatever the mix.</li>
<li><b>Linear crossfade.</b> At “A 50 · B 50” each layer plays at half level, so the mix stays about as loud as either engine alone. Turning MIX while notes sound is smoothed (20 ms) and does not click.</li>
<li><b>Cost.</b> In between, every voice is computed twice, so the CPU load roughly doubles. The tables of the second engine are built when MIX leaves A or B (and dropped when it returns there), with the same 10 ms crossfade as the other table changes.</li>
<li><b>Older sounds.</b> Presets, user presets and Live Sets made before beta 0.2 have no MIX: they get MIX = their engine and sound exactly as before. The factory presets that mix both engines are named “AB · …”.</li>
<li>The SCOPE and SCALOGRAM show the engine whose panel is open.</li>
</ul>`;
}

// ---------------------------------------------------------------- string-machine chorus (beta 0.2)
function chorusSection(E) {
  const rows = [
    ['ch_mix', 'Amount of chorus: 0 % switches it off (the default), 100 % keeps only the three chorus lines.', '60–90 % gives the classic string-machine shimmer; 30–40 % just widens a lead or keys.'],
    ['ch_rate', 'Speed of the slow sweep (0.1–3 Hz). A second, fast sweep runs at about 9.7 times this rate with a smaller depth — the two together make the “ensemble” movement.', 'Around 0.5–0.8 Hz sounds like the string machines of the 1970s; above 1.5 Hz it becomes a vibrato.'],
    ['ch_depth', 'How far the delay lines sweep: from 6 ms up to 12 ms at 100 %.', 'Lower DEPTH when RATE is high, or the pitch wobble becomes obvious.'],
  ];
  return `<p>The ${ctl('CHORUS')} section, at the bottom left next to the SUB OSC, is a triple chorus modelled on the ensemble effect of 1970s string machines.</p>
${controls(rows)}
<ul>
<li><b>How it works.</b> The sound (after DRIVE) feeds three short delay lines. Each is swept by the same slow and fast LFOs, shifted by 120° from one line to the next, so the three copies are never in step. They are spread left, centre and right: the result is wide and lush even from a single voice.</li>
<li><b>Where it sits.</b> After the voices and the DRIVE, before the ping-pong DELAY and the REVERB — the order of a classic string machine going into an echo and a hall.</li>
<li><b>Mono in, stereo out.</b> The chorus works on the mono sum of the sound; at 100 % the stereo image is made by the three lines. Lower settings keep part of the original stereo spread of ${P('v_unison')} and ${P('v_width')}.</li>
<li>Try it on “A · String Machine”, “A · Solina Cellos”, “B · Ensemble Organ” or “AB · Analog Strings”.</li>
</ul>`;
}

// ---------------------------------------------------------------- about & release history (from RELEASE_HISTORY.md)
// the About section's thanks (beta 0.4; README.md "Acknowledgments" says the same)
const ACKNOWLEDGMENTS = [
  'Thanks to Jeremi Palmigani (aka Saoul Machine) and Flo (aka Go Tiger) for testing the synth and providing valuable feedback and improvement suggestions.',
  'Thanks to Arnaud Grignard for the technical review of the concept.',
];
function releaseNotes() {
  const fs = require('fs'), path = require('path');
  let md = '';
  try { md = fs.readFileSync(path.join(L.ROOT, 'RELEASE_HISTORY.md'), 'utf8'); } catch (_) { return ''; }
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  let h = '', inList = false, started = false;
  const close = () => { if (inList) { h += '</ul>'; inList = false; } };
  for (const raw of md.split(/\r?\n/)) {
    const ln = raw.trim();
    if (ln.startsWith('## ')) { close(); started = true; h += `<h4>${inl(ln.slice(3))}</h4>`; continue; }
    if (!started || !ln) { if (!ln) close(); continue; }
    if (ln.startsWith('- ')) { if (!inList) { h += '<ul>'; inList = true; } h += `<li>${inl(ln.slice(2))}</li>`; continue; }
    close();
    h += `<p>${inl(ln)}</p>`;
  }
  close();
  return h;
}
function aboutSection(E) {
  const A = SPEC.APP;
  return `<p><b>${A.name}</b> — ${A.credit} (${A.author}). Version <b>${A.version}</b> (${A.date}).</p>
<ul>
<li>The panel shows “${A.credit} · ${A.version}” at the bottom right, in the web app and in the plugin.</li>
<li>The VST3 plugin is published under the vendor name <b>${A.credit.replace(/^created by /, '')}</b> — that is where Ableton Live lists it in its browser — with version number ${A.versionNum}.</li>
<li>These manuals are generated from the instrument’s own parameter list and sound engine (<code>tools/manual/</code>), so ranges, defaults and presets always match this version.</li>
<li><b>How to cite:</b> Guyot, P. A. (2026). <i>${A.name}</i> [Computer software]. Zenodo. <a href="https://doi.org/${A.doi}">https://doi.org/${A.doi}</a> (<a href="https://zenodo.org/records/${A.doi.split('.').pop()}">Zenodo record</a>).</li>
</ul>
<h3 id="acknowledgments">Acknowledgments</h3>
${ACKNOWLEDGMENTS.map(t => `<p>${t}</p>`).join('\n')}
<h3 id="release-history">Release history</h3>
<p>The complete history is kept in <code>RELEASE_HISTORY.md</code> in the project folder. Current release:</p>
<div class="callout deep release">${releaseNotes()}</div>`;
}

// ---------------------------------------------------------------- glossary
function glossary(E) {
  const g = [
    ['Wavelet', 'A short, wave-like shape with zero average that starts and ends quietly. Stretched and shifted copies of it are the building blocks used to describe a signal.'],
    ['Mother wavelet (ψ)', 'The basic shape from which all atoms are made by shifting and scaling. The ATOM SHAPE display shows it.'],
    ['Atom', 'One shifted, scaled copy of the wavelet, with a size (coefficient). One cycle of 2048 samples is described by 2047 atoms plus its average.'],
    ['Band / scale', 'All atoms of the same size. Band b has 2<sup>b−1</sup> atoms; band 1 spans the whole cycle, band 11 has 1024 tiny atoms. One band ≈ one octave of harmonics.'],
    ['DWT', 'Discrete wavelet transform. Here it is periodic (the cycle wraps around) and orthogonal (no atom duplicates another), so the 11 band layers add up exactly to the original cycle and the energy is preserved.'],
    ['Haar', 'The oldest and simplest wavelet (1910): a square step up then down. Its atoms are piecewise constant, which gives stepped, digital-sounding results.'],
    ['Daubechies (DBn)', 'A family of wavelets by Ingrid Daubechies (1988). DBn uses 2n filter taps; longer ones are smoother and separate the octaves more cleanly.'],
    ['Symlet, Coiflet', 'Variants of Daubechies wavelets designed to be nearly symmetric, which gives more balanced, less lopsided edges.'],
    ['Taps', 'The length of the wavelet’s digital filter. More taps = smoother atom, better octave separation, less precise placement in time.'],
    ['Sparsity', 'Keeping only the largest atoms and zeroing the rest — the principle behind wavelet-based lossy compression such as JPEG 2000.'],
    ['Scalogram', 'A picture of a wavelet transform: time across, scale (band) up, brightness = atom size. The wavelet counterpart of a spectrogram.'],
    ['Pitch-synchronous', 'Analysed and played one waveform cycle at a time, locked to the note’s period. Bands therefore move with the pitch: band 5 is always about harmonics 9–16.'],
    ['Band-limited table', 'A copy of each band layer with harmonics above a limit removed. The engine picks the copy that fits the note, so high notes do not alias.'],
    ['Aliasing', 'Harsh, inharmonic tones produced when a digital oscillator tries to play harmonics above half the sample rate; they fold back into the audible range.'],
    ['Key tracking', 'How much the filter cutoff follows the played note.'],
    ['Legato', 'Playing a new note before releasing the previous one; in mono mode the envelopes then continue instead of restarting.'],
    ['Portamento (glide)', 'A smooth slide of pitch from one note to the next instead of a jump. With polyphonic portamento, every voice of a chord glides from its own previous note.'],
    ['Unison', 'Several slightly detuned copies of each note played together for a thicker sound.'],
    ['Sub oscillator', 'An extra oscillator one or two octaves below the played note, used to add low end.'],
    ['Infrasound', 'Frequencies below about 20 Hz: under the range of hearing, but felt through large speakers.'],
    ['PolyBLEP', 'A light-weight way of removing the aliasing of the sharp edges of a digital square or sawtooth wave; used by the sub oscillator’s square.'],
    ...(isA(E) ? [['Subtractive synthesis', 'Starting from a harmonically rich wave and removing (filtering) parts of it — here, removing bands of atoms.']]
      : [['Additive synthesis', 'Building a sound by adding simple components — classically sine waves, here bands of wavelet atoms.'], ['Drawbar', 'A slider for the level of one component, as on a tonewheel organ; here one per band (octave).'], ['Walsh functions', 'Square-wave functions that switch between +1 and −1 in regular patterns; the digital counterpart of sines, used in some early digital synthesizers.']]),
  ];
  g.sort((x, y) => x[0].localeCompare(y[0]));
  return `<dl class="gloss">${g.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl>`;
}

// ---------------------------------------------------------------- presets table
const PLABEL = {
  wavelet: 'WAVELET', a_wave: 'WAVE', a_width: 'WIDTH', a_sparsity: 'SPARSITY', b_pattern: 'PATTERN', b_seed: 'SEED', b_tilt: 'TILT',
  b_atk: 'SCALE ATTACK', b_spread: 'SPREAD', b_body: 'BODY', b_bright: 'BRIGHT', b_sus: 'SCALE SUSTAIN',
  f_type: 'TYPE', f_cutoff: 'CUTOFF', f_slope: 'SLOPE', f_res: 'RESO', f_keytrk: 'KEY TRK', f_env: 'ENV AMT', f_vel: 'VEL AMT',
  p_center: 'POSITION', p_width: 'WINDOW WIDTH', p_depth: 'DEPTH',
  amp_a: 'AMP A', amp_d: 'AMP D', amp_s: 'AMP S', amp_r: 'AMP R', amp_vel: 'VELOCITY',
  mod_a: 'MOD A', mod_d: 'MOD D', mod_s: 'MOD S', mod_r: 'MOD R',
  lfo_shape: 'LFO', lfo_rate: 'LFO RATE', lfo_pitch: 'LFO→PITCH', lfo_cut: 'LFO→CUTOFF', lfo_pos: 'LFO→POSITION',
  v_porta: 'PORTAMENTO', v_oct: 'OCTAVE', v_fine: 'FINE', v_voices: 'VOICES', v_glide: 'GLIDE', v_unison: 'UNISON', v_detune: 'DETUNE', v_width: 'STEREO',
  fx_drive: 'DRIVE', fx_dtime: 'DLY TIME', fx_dfb: 'FEEDBACK', fx_dmix: 'DLY MIX', fx_rsize: 'REV SIZE', fx_rmix: 'REV MIX', master: 'VOLUME',
  sub_level: 'SUB LEVEL', sub_oct: 'SUB', sub_shape: 'SUB SHAPE',
  ab_mix: 'A/B MIX', ch_mix: 'CHORUS', ch_rate: 'CHORUS RATE', ch_depth: 'CHORUS DEPTH',
  wav2: 'WAVELET 2', wmorph: 'MORPH', lfo_wav: 'LFO→WAVELET', env_wav: 'ENV→WAVELET',
  lfo2_shape: 'LFO 2', lfo2_rate: 'LFO 2 RATE', lfo2_amt: 'LFO 2 AMOUNT', lfo2_target: 'LFO 2→',
  a_phase: 'PHASE',
};
function presetSettings(pr) {
  const out = [], v = pr.values, idx = k => SPEC.PARAMS.findIndex(p => p.key === k);
  const mixed = v[idx('ab_mix')] > 0 && v[idx('ab_mix')] < 1;   // both engines sound: show both engines' settings
  const always = mixed ? ['ab_mix', 'a_wave', 'b_pattern', 'wavelet'] : v[idx('engine')] === 0 ? ['a_wave', 'wavelet'] : ['b_pattern', 'wavelet'];
  const fmtV = (k, x) => { const p = PK[k]; let s = p.fmt === 'choice' ? p.choices[Math.round(x)] : C.format(p, x); if (k === 'f_cutoff') s = s.replace('band ', ''); return s; };
  for (const k of always) out.push(`${PLABEL[k]} ${fmtV(k, v[idx(k)])}`);
  const bars = []; let barsChanged = false;
  for (let b = 1; b <= 11; b++) { const x = v[idx('b_bar' + b)]; bars.push(Math.round(x * 100)); if (x !== 1) barsChanged = true; }
  SPEC.PARAMS.forEach((p, i) => {
    if (p.hidden || p.key === 'engine' || p.key === 'ab_mix' || always.includes(p.key) || p.key.startsWith('b_bar')) return;
    const subOn = v[idx('sub_level')] > 0;
    if ((p.key === 'sub_oct' || p.key === 'sub_shape') && !subOn) return;
    if (v[i] === p.def && !((p.key === 'sub_oct' || p.key === 'sub_shape') && subOn)) return;
    if (!mixed && v[idx('engine')] === 0 && p.key.startsWith('b_')) return;
    if (!mixed && v[idx('engine')] === 1 && p.key.startsWith('a_')) return;
    if (p.key === 'b_seed' && Math.round(v[idx('b_pattern')]) !== 5) return;
    out.push(`${PLABEL[p.key]} ${fmtV(p.key, v[i])}`);
    if (p.key === 'b_tilt' && barsChanged) out.push(`DRAWBARS ${bars.join(' / ')}`);
  });
  if (barsChanged && !out.some(s => s.startsWith('DRAWBARS'))) out.splice(2, 0, `DRAWBARS ${bars.join(' / ')}`);
  return out.join(' · ');
}
function presetTable(E, desc) {   // the presets of one engine's panel, by category (★ = one of OktoPierre's TOP Sounds)
  const favs = new Set(SPEC.PRESETS.slice(0, SPEC.TOP).map(p => p.name));
  const head = ['Preset', 'Effects', 'Sound', 'Settings that differ from the defaults'];
  let body = '';
  for (const cat of SPEC.CATEGORIES) {
    const list = SPEC.PRESETS.filter(pr => pr.cat === cat && (E === 'a') === (pr.values[0] === 0));
    if (!list.length) continue;
    body += `<tr class="cat"><td colspan="${head.length}">${cat}</td></tr>`;
    for (const pr of list) {
      const d = desc[pr.name] || ['', ''];
      if (!desc[pr.name]) console.warn('no description for preset ' + pr.name);
      const def = pr.name === SPEC.PRESETS[SPEC.DEFAULT_PRESET].name ? ' <span class="small muted">(default sound)</span>' : '';
      const star = favs.has(pr.name) ? '<span class="fav" title="One of OktoPierre’s TOP Sounds">★</span> ' : '';
      body += '<tr>' + [star + pr.name + def, d[0] ? `<span class="fxl fxl-${d[0]}">${d[0]}</span>` : '', d[1],
        `<span class="small muted">${presetSettings(pr)}</span>`].map(c => `<td>${c}</td>`).join('') + '</tr>';
    }
  }
  return `<div class="tbl"><table class="presets"><thead><tr>${head.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

module.exports = { DEMO, demoSection, subSection, mixSection, chorusSection, aboutSection, bandMap, waveletTable, quickStart, controlsHowTo, filterSection, positionSection, envelopesSection, lfoSection, voiceSection, fxSection, displaysSection, playingSection, presetsSaving, vstSection, troubleshooting, glossary, presetTable };
