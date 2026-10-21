// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The two user manuals of Okto MultiWave Synth: Manual A (the subtractive oscillators A1 A2) and Manual B (the additive oscillator B1).
// The chapters they share are written once; the controls tables, ranges and defaults come from the spec (`tools/spec.js`), so they never
// drift from the instrument. The deeper theory of the wavelet engines is in the Wavelet Synthesizer's manuals (linked at the end).
'use strict';
const L = require('./lib.js');
const { ctl, kbd, P, controls, table, tip, note, warn, deep, fig, figInline, annotated, C, PK, SPEC } = L;
const TOP_DESC = require('./top_desc.js');

const SL = SPEC.SLOTS, isA = E => E === 'a';
// the spec's slot tables hold parameter indices: the parameter keys of each oscillator's fields
const SLK = SL.map(sl => Object.fromEntries(Object.entries(sl.k).map(([f, i]) => [f, SPEC.PARAMS[i].key])));
const WS_MANUALS = 'https://pierrearnaudguyot.github.io/Free-Wavelet-Synthesizer-VST/web/manual/';
const VST_URL = (() => {
  const m = /VST_RELEASES\s*=\s*'([^']+)'/.exec(require('fs').readFileSync(require('path').join(L.ROOT, 'web', 'js', 'ui.js'), 'utf8'));
  if (!m) throw new Error('web/js/ui.js: VST_RELEASES not found');
  return m[1];
})();
const CREDIT = `${SPEC.APP.panelCredit} · ${SPEC.APP.version} · ${SPEC.APP.license}`;
const NEW = SPEC.PRESETS.slice(SPEC.NEW_FIRST);   // beta 0.3: the 600 of beta 0.3 (501-1100), the presets of beta 0.2 (201-500), then those of beta 0.1 (001-200) that do not use B2 (removed)
const numOf = p => parseInt(p.id || p.name, 10);   // the number written first in a new preset's name (3 or 4 digits)
const N03 = NEW.filter(p => numOf(p) >= 501).length, N02 = NEW.filter(p => numOf(p) >= 201 && numOf(p) < 501).length, N01 = NEW.length - N03 - N02;   // presets of beta 0.3, of beta 0.2 and of beta 0.1 (left)
const SUPER = SPEC.PRESETS.filter(p => p.cat === 'SuperModulation');
const firstNo03 = String(Math.min(...NEW.map(numOf).filter(n => n >= 501))), lastNo03 = String(Math.max(...NEW.map(numOf)));
const nCat = c => SPEC.PRESETS.filter(p => p.cat === c).length;
// ---- the final list (beta 1.0): presets are picked by what they do (computed from the spec's values) and never by name, so a change of the list cannot break the manuals
const IDX = {}; SPEC.PARAMS.forEach((q, i) => { IDX[q.key] = i; });
const pv = (p, key) => p.values[IDX[key]];                                   // a preset's value of a parameter
const uses = (p, s) => pv(p, SLK[s].lvl) > 0;                                 // oscillator s plays in preset p
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const nameB = p => `<b>${esc(p.name)}</b>`;
// the factory order is the best rated first (the owner's stars at the time of the listening; the sounds start with no stars now)
const byStars = (a, b) => a.rank - b.rank;
const pick = (what, n, pred) => {
  const l = SPEC.PRESETS.filter(pred).sort(byStars).slice(0, n);
  if (!l.length) throw new Error('manual: no preset in the final list for "' + what + '"');
  return l.map(nameB).join(', ');
};
// the TOP Sounds list in its order: the TOP Sounds of the Wavelet Synthesizer he kept, then the sounds he rated above 7 and his favourites; the best rated first (same rule as tools/spec.js TOP_LIST)
const TOP_LIST = SPEC.TOP_LIST;
if (TOP_LIST[0] !== SPEC.DEFAULT_PRESET) throw new Error('manual: the first TOP Sound is not the default preset any more: check TOP_LIST in tools/spec.js');
const TOP_NAMES = new Set(TOP_LIST.map(i => SPEC.PRESETS[i].name));
const SUPERMOD = SPEC.PRESETS.filter(p => p.cat === 'SuperModulation');   // the SuperModulation category
const lfo23 = p => pv(p, 'lfo2_amt') > 0 || pv(p, 'lfo3_amt') > 0;   // LFO 2 and / or LFO 3 move a control
const N_LFO23 = SPEC.PRESETS.filter(lfo23).length, N_SM_LFO23 = SUPERMOD.filter(lfo23).length;
const N_EXTRA = TOP_LIST.length - SPEC.TOP;
// the Shape control of LFO 2 and LFO 3: the five waveforms of LFO 1 (a choice), or a knob
const lfoShape = key => PK[key].fmt === 'choice' ? 'The same five waveforms as LFO 1.' : 'The waveform of the LFO, from the same family as LFO 1 (sine, triangle, saw, square, sample &amp; hold).';
// the number of vanishing moments of a wavelet: how many of the moments of its high-pass filter are zero (centred, relative to their size)
const vanishing = h => {
  const L = h.length, g = h.map((_, n) => ((n & 1) ? -1 : 1) * h[L - 1 - n]);
  for (let k = 0; k < L; k++) {
    let m = 0, sc = 0;
    for (let n = 0; n < L; n++) { const c = n - (L - 1) / 2; m += Math.pow(c, k) * g[n]; sc += Math.pow(Math.abs(c), k) * Math.abs(g[n]); }
    if (Math.abs(m) > 1e-10 * sc) return k;
  }
  return L;
};
const catList = SPEC.CATEGORIES.slice(0, -1).join(', ') + ' and ' + SPEC.CATEGORIES[SPEC.CATEGORIES.length - 1];

// ---------------------------------------------------------------- hero
function hero(E) {
  const a = isA(E);
  return `<header class="hero">
<p class="eyebrow">OKTO MULTIWAVE SYNTH · USER MANUAL ${E.toUpperCase()}</p>
<h1><span class="tag">OSCILLATORS ${a ? 'A1 · A2' : 'B1'}</span>Wavelet ${a ? 'Subtractive' : 'Additive'}</h1>
<p class="lead">${a
    ? 'The oscillators A1 and A2 are subtractive, with a wavelet twist. Each starts from a bright waveform — saw, square, pulse, triangle, sine or a noise cycle — and shapes it with a filter that cuts <em>scales</em> instead of frequencies: a wavelet transform breaks every cycle into 11 octave bands of small building blocks, the atoms; the SCALE FILTER turns the bands up and down, SPARSITY keeps only the most important atoms, the POSITION window confines the filter to one part of the cycle, and SOURCE PHASE moves the wave under the atoms.'
    : 'The oscillator B1 is additive, with a wavelet twist. It is built from wavelet atoms: an atom pattern writes the coefficients of the 11 octave bands, the drawbars set the level of every band, and each band has its own envelope — so the fine detail of a note can die away before its body, as in a real string or bell. The same SCALE FILTER and POSITION window as the subtractive oscillators shape the result.'}
Okto MultiWave Synth has <b>two subtractive oscillators and one additive one</b> and mixes them: this manual is about the ${a ? 'subtractive pair' : 'additive oscillator'}; <a href="manual-${a ? 'b' : 'a'}.html">Manual ${a ? 'B' : 'A'}</a> describes the ${a ? 'additive oscillator' : 'subtractive pair'}.</p>
<div class="hero-meta"><span class="pill">For the web app and the VST3 / VST2 plug-in for Windows</span><span class="pill">Version ${SPEC.APP.version} · ${SPEC.APP.date}</span><a class="pill other-${a ? 'b' : 'a'}" href="manual-${a ? 'b' : 'a'}.html">Oscillator${a ? ' B1 — read Manual B' : 's A1 · A2 — read Manual A'}</a></div>
</header>`;
}

// ---------------------------------------------------------------- 0. what this synthesizer is, and what wavelets are (the first section of both manuals)
// One line for each of the seven wavelets of SPEC.WAVELETS (same order): what you hear, in the words of the chapters below. The taps and the vanishing moments are computed from the wavelet's filter.
const WAVELET_LINES = [
  'A square step: sharp and digital. Its atoms are square waves, so a square wave is a single atom of it.',
  'Short and lopsided: gritty, a little metallic.',
  'A good all-rounder with mild, asymmetric ringing.',
  'Longer and smoother: filter sweeps start to sound analogue.',
  'The same length and smoothness as Daubechies 8, but nearly symmetric: cleaner, more balanced edges.',
  'Nearly symmetric and very smooth for its length.',
  'Long and almost sine-like: each band is close to a pure octave of harmonics, the most "Fourier-like" of the seven.',
];
function introChapter(E) {
  const a = isA(E);
  if (WAVELET_LINES.length !== SPEC.WAVELETS.length) throw new Error('manual: WAVELET_LINES does not match SPEC.WAVELETS');
  const hrefA = a ? '#tone' : 'manual-a.html#tone', hrefB = a ? 'manual-b.html#tone' : '#tone';
  const wtable = table(['Wavelet', 'Taps', 'Vanishing moments', 'What you hear'], SPEC.WAVELETS.map((w, i) => [`<b>${w.name}</b>`, String(w.h.length), String(vanishing(w.h)), WAVELET_LINES[i]]), 'compact wavelets');
  return `<p><b>Okto MultiWave Synth</b> is a polyphonic synthesizer whose sounds are made of <b>wavelets</b> instead of sine waves. If you know subtractive synthesis — oscillator, filter, envelope — you already know the shape of its signal path; what is new is what an oscillator is made of, and what its filter takes away. This chapter explains both in plain words, then follows a note from the oscillators to the output. The chapters after it are the hands-on guide and the reference.</p>
<h3 id="intro-wavelets">What is a wavelet?</h3>
<p>A steady sound repeats a cycle, and the classic way to describe a cycle is <b>Fourier's</b>: a sum of sine waves, the harmonics, each lasting the whole cycle. Additive synthesis adds such sines, and an ordinary filter is a gain for each frequency. A sine knows exactly <em>which</em> frequency it is, but not <em>where</em> in the cycle: it is everywhere at once.</p>
<p>A <b>wavelet</b> is a short wave that starts, wiggles a few times and dies away: it lives in one place. A wavelet description builds the cycle from copies of <em>one</em> such shape, called <b>atoms</b>, that differ in two ways only: their <b>scale</b> (their size; each scale is half as long as the one before, one octave finer) and their <b>position</b> in the cycle. One atom is one wavelet at one scale and one position, so it is localised in frequency (its octave) <em>and</em> in time (its place in the cycle) — which a sine cannot be.</p>
<p>In this instrument one cycle is 2048 samples and has <b>11 scales</b>, called <b>bands</b>. Band 1 holds one atom as long as the cycle, band 2 two atoms half as long, band 3 four, and so on up to band 11 with 1024 atoms two samples apart: 2047 atoms in all. A band covers about one octave of harmonics — band 1 the fundamental, band 2 the 2nd harmonic, band 3 harmonics 3–4, band 4 harmonics 5–8 … — and the cycle is stretched to the pitch of the note, so the bands follow the note.</p>
${figInline(`intro-tiling-${E}`, '<b>Figure 1.</b> Left: in the Fourier view each harmonic lasts the whole cycle. Right: the wavelet view cuts each band into atoms that sit at definite places in the cycle; the shading shows how big the atoms of a sawtooth are (Daubechies 4).')}
<p>The <b>discrete wavelet transform</b> (DWT) finds how much of each atom a cycle contains: with a pair of short filters (the wavelet) it splits the cycle into a coarse half and a detail half, keeps the detail as the atoms of the finest band, and repeats on the coarse half. The <b>inverse transform</b> adds the atoms back up and returns the cycle exactly. Between the two you can change the atoms — silence a whole band, keep only the strongest, turn some up — and what comes out is the same cycle with exactly that change.</p>
${figInline(`decomp-${E}`, '<b>Figure 2.</b> One sawtooth cycle, its 11 bands (the atoms of each band put back as a waveform: the fine bands have atoms only where the wave needs them, at the jump) and their sum, which is the cycle again.')}
<p>That is the whole trick of the instrument. A <b>scale filter</b> does not cut frequencies: it turns bands — octaves — up and down; and because atoms have a place, it can also act on one part of the cycle only. The shape of the atom, the wavelet itself, colours what the filter leaves.</p>
<h3 id="intro-seven">The seven wavelets</h3>
<p>Every oscillator has its own WAVELET: the shape of its atoms. <em>Taps</em> is the length of the wavelet's filter, the number of samples an atom spans at the finest scale; <em>vanishing moments</em> is how many smooth shapes it ignores (1: a constant, 2: also a straight ramp …). The more it has, the fewer fine atoms a smooth wave needs: a sawtooth analysed with Daubechies 8 has only ${sparse(0, 3, 0).nz} non-zero atoms out of 2047, because the ramp makes no fine atoms and only its jump does. Short wavelets are precise in time and sound sharper; long ones separate the octaves cleanly. <a href="#wavelets">The wavelet chooses the atom</a> draws them.</p>
${wtable}
<h3 id="intro-synth">How the synthesizer works</h3>
<p>Every note takes one <b>voice</b>. A voice has <b>three oscillators</b> — A1, A2 and B1 — a sub oscillator, a conventional filter and an amplifier; the effects are shared by all the voices. The three oscillators make their cycle out of atoms in two different ways, and the levels in <a href="#mix">OSC MIX</a> decide how much of each you hear (a new patch plays A1 alone).</p>
<ul>
<li><b>A1 and A2 are subtractive</b> (<a href="${hrefA}">details</a>). They start from a classic wave — saw, square, pulse, triangle, sine or a noise cycle — analyse it with their wavelet and keep every band as a separate layer. SPARSITY keeps only the strongest atoms and silences the rest, as a lossy codec does. SOURCE PHASE, WIDTH (the pulse width or the triangle's skew) and WAVELET MORPH change <em>what the atoms see</em>: the transform is not shift-invariant, so the same wave moved inside the cycle, or seen through another wavelet, is made of other atoms, and the filter, SPARSITY and the window then act on it differently. The <b>SCALE FILTER</b> finally gives each band a gain — low-pass, high-pass, band-pass or band-reject, with a slope, a resonance, key tracking, an envelope and velocity — and the <b>POSITION</b> window confines it to one part of the cycle.</li>
<li><b>B1 is additive</b> (<a href="${hrefB}">details</a>). It analyses nothing: an atom <em>pattern</em> (ramp, mirror, alternate, Walsh, impulse or random) writes the atoms directly, an inverse transform turns every band into a layer, and 11 <b>drawbars</b> — one per band, as on an organ but with octave bands instead of harmonics — set the level of each band, TILT sloping them. Every band has its own envelope (SCALE ATTACK, SPREAD, BODY, BRIGHT, SCALE SUSTAIN), so the fine detail of a note can arrive late and die before its body, as in a real string or bell. The same SCALE FILTER and POSITION window shape the result.</li>
<li><b>The layers are played, not recomputed.</b> The transform runs when you change something that alters the atoms (the wave, the wavelet, SPARSITY, the pattern …), in the background and with a crossfade. Every voice then reads the 11 layers like wavetables at the pitch of the note and multiplies each one by a gain: those 11 gains are what the SCALE FILTER sets, recomputed every 32 samples, so a sweep is smooth.</li>
<li><b>The sub oscillator</b> is one sine, triangle or square, one or two octaves below the note, once per voice, outside the scale filters.</li>
</ul>
${figInline(`path-${E}`, '<b>Figure 3.</b> The signal path. In every voice the oscillators and the sub oscillator are mixed, filtered and shaped by the AMP ENVELOPE; the voices are then added and go through the effects, the master volume and the limiter. The modulation sources move the controls of all of it.')}
<p>After the mix the voice goes through a conventional <b>FILTER</b>, a four-pole (24 dB per octave) resonant low-pass with its own envelope and two characters: <b>LADDER</b> (dark, gritty) and <b>OTA</b> (rounder, smoother). It cuts <em>frequencies</em>, where the SCALE FILTERs cut <em>scales</em>: use both. It is open by default. The <b>AMP ENVELOPE</b> and the velocity then shape the voice. <b>UNISON</b> stacks up to ${PK.v_unison.max} detuned copies of every oscillator, spread across the stereo field, and up to ${PK.v_voices.max} voices can sound at once (<a href="#voicefx">Voice, filter and effects</a>).</p>
<p>The voices are added and go through <b>SATURATION</b>, a triple <b>CHORUS</b>, a ping-pong <b>DELAY</b> and a <b>REVERB</b>; the master <b>VOLUME</b>, an output guard and a soft limiter keep the result below 0 dBFS (<a href="#effects">Effects</a>).</p>
<h3 id="intro-mod">Modulation</h3>
<p>There are three envelopes: the <b>AMP ENVELOPE</b> (loudness), the <b>MOD ENVELOPE</b> (it moves the cutoff of every scale filter, and the wavelet morph) and the <b>FILTER ENVELOPE</b> (the cutoff of the voice FILTER); each oscillator also has its own envelope and a pitch envelope (<a href="#env">Envelopes</a>). <b>LFO 1</b> moves the pitch (vibrato), the scale cutoff, the window position, the wavelet morph, SPARSITY and the resonance. <b>LFO 2</b> and <b>LFO 3</b> each move <em>one control of your choice</em> (TARGET) — any control of the scale filters, the windows, the wavelet oscillators or the voice FILTER — in every oscillator at once (<a href="#lfo">LFO 1, LFO 2 and LFO 3</a>).</p>
<p>When an LFO moves a <em>wavelet</em> control — a scale cutoff, the resonance, SPARSITY, the window, the source phase, the morph between two wavelets, the drawbar tilt … — the harmonics are re-coupled according to the wavelet, and the timbre swims in a way an ordinary filter sweep cannot. That is <b>SuperModulation</b>, and the first category of the presets (${SUPERMOD.length} sounds) is made of it: see <a href="#supermod">SuperModulation</a>.</p>
<h3 id="intro-play">Playing it, and choosing sounds</h3>
<p><b>CHORD MODE</b> turns the keyboard into a chord harp: one octave of keys chooses the chord type, and every key above it plays the whole chord with one finger, with a bass note if you like (<a href="#chord">Chord mode</a>). The <b>TUNING</b> switch gives the keyboard the quarter tones of Arabic music and the 53 commas of Turkish music, with a MAQAM and a TONIC (<a href="#oriental">Oriental keyboard</a>).</p>
<p>The instrument opens on <b>${esc(SPEC.PRESETS[SPEC.DEFAULT_PRESET].name)}</b>. There are <b>${SPEC.PRESETS.length} presets</b>, all kept by their author, OktoPierre, after his own listening: <b>TOP Sounds</b> first, then the ${SPEC.CATEGORIES.length} categories. Click the name in the preset box to open the preset browser; in the plug-in it shows the author's stars at the right of every sound. Your own sounds go to the user bank (SAVE PRESET), and EXPORT / IMPORT carry them as files (<a href="#presets">Presets</a>).</p>
<p>${a ? `This is Manual A: it describes the subtractive oscillators A1 and A2 in detail (<a href="#tone">The subtractive oscillators</a>); <a href="manual-b.html">Manual B</a> describes the additive oscillator B1.` : `This is Manual B: it describes the additive oscillator B1 in detail (<a href="#tone">The additive oscillator</a>); <a href="manual-a.html">Manual A</a> describes the subtractive oscillators A1 and A2.`} To start sounding at once, go to the <a href="#quick">Quick start</a>.</p>`;
}

// ---------------------------------------------------------------- 1. quick start
function quickStart(E) {
  const a = isA(E);
  return `<p>From closed to sounding in a few steps — pick the column for the version you use.</p>
<div class="cols2">
<div class="card"><h4>Web app <span class="badge">BROWSER</span></h4><ol class="steps">
<li>Double-click <code>web/index.html</code> to open it in Chrome or Edge (Firefox also works). No installation and no web server are needed — or open the page of the project: ${SPEC.APP.url ? '' : ''}<code>pierrearnaudguyot.github.io/Okto-MultiWave-Synth</code>.</li>
<li>Click <b>Play the synth</b> in the welcome window (or <b>Run the demo</b> for a tour of the presets): browsers only allow sound after a click. The status bar turns green: <i>Audio on</i>.</li>
<li>The app opens on <b>${SPEC.PRESETS[SPEC.DEFAULT_PRESET].name}</b>. Play with the mouse on the keyboard, the digit keys ${kbd('1')} … ${kbd('0')}, the letter row ${kbd('A')} ${kbd('S')} ${kbd('D')} ${kbd('F')} …, or a MIDI keyboard.</li>
<li>Click the folder tabs ${ctl('OSC1 A1')} ${ctl('OSC2 A2')} ${ctl('OSC3 B1')} under the header to see each oscillator's cards. The tabs only choose the <em>panel shown</em>: what you hear is set by the three levels in the <b>OSC MIX</b> card (a lit dot on a folder tab says the oscillator is heard).</li>
<li>${a ? `Hold a note, show the ${ctl('A1')} panel and slowly turn ${P(SLK[0].fcut)} of the SCALE FILTER down. In the SCALOGRAM the rows switch off from the top as bands are removed. Then step the wavelet with ◀ ▶ and sweep again: same filter, different atoms.`
    : `Click the folder tab ${ctl('OSC3 B1')}, raise ${P(SLK[2].lvl)} in OSC MIX and lower ${P(SLK[0].lvl)} to hear the additive oscillator alone. Pull the drawbars down one by one from the right: the sound loses brightness band by band. Then click the ${ctl('PATTERN')} buttons to hear the other atom patterns.`}</li>
</ol></div>
<div class="card"><h4>Ableton Live <span class="badge">VST3 / VST2</span></h4><ol class="steps">
<li>Download the plug-in zip from its <a href="${VST_URL}">release page</a> (the web app's ${ctl('DOWNLOAD VST')} button opens it) and unzip it. Copy the whole <code>OktoMultiWaveSynth.vst3</code> folder into your VST3 folder (<code>C:\\Program Files\\Common Files\\VST3</code>; <code>vst\\install.bat</code> does it and asks for administrator rights) <b>or</b> into your VST2 plug-in folder.</li>
<li>In Live open <b>Preferences → Plug-ins</b>, switch on <b>Use VST3 Plug-in System Folders</b> (or <b>Use VST2 Plug-in Custom Folder</b>) and click <b>Rescan</b>.</li>
<li>In the browser open <b>Plug-ins → ${SPEC.APP.credit.replace(/^created by /, '')} → Okto MultiWave Synth</b> and drag it onto a MIDI track. A new instance starts on <b>${SPEC.PRESETS[SPEC.DEFAULT_PRESET].name}</b>.</li>
<li>Arm the track and play a MIDI keyboard, or press ${kbd('M')} to use Live's Computer MIDI Keyboard. The panel is the same as in the web app.</li>
</ol></div>
</div>
${tip(`<p>Want to hear what it can do first? ${ctl('▶ DEMO')} (web app) plays Beethoven's <i>Appassionata</i> while the presets change every few seconds.</p>`)}`;
}

// ---------------------------------------------------------------- 2. the panel
// The numbered callouts of the panel screenshot: a pin sits 4 px inside the top left corner of a widget (panel coordinates, from the layout of tools/spec.js).
const secOf = id => { const s = SPEC.SECTIONS.find(q => q.id === id); if (!s) throw new Error('manual: no section ' + id); return s; };
const at = (id, wx = 0, wy = 0) => { const s = secOf(id); return { x: s.x + wx + 4, y: s.y + wy + 4 }; };
const pins = E => {
  const a = isA(E);
  const tid = a ? 'tone_a1' : 'tone_b1';
  const tone = a ? [
    { ...at(tid, 12, 32), title: 'WAVE', desc: 'the source waveform of the oscillator.', href: 'tone' },
    { ...at(tid, 12, 70), title: 'ATOM SHAPE', desc: 'one atom of the selected wavelet.', href: 'tone' },
    { ...at(tid, 12, 180), title: 'WAVELET · WAVELET 2', desc: 'the atom shape; the second one is for WAVELET MORPH.', href: 'tone' },
    { ...at(tid, 276, 70), title: 'SOURCE CYCLE', desc: 'the wave before (grey) and after sparsity; “K / nz atoms kept”.', href: 'tone' },
    { ...at(tid, 408, 70), title: 'PHASE', desc: 'SOURCE PHASE: moves the wave inside the cycle before the analysis.', href: 'tone' },
    { ...at(tid, 280, 146), title: 'WIDTH · SPARSITY', desc: 'pulse width / triangle skew; how many atoms are kept.', href: 'tone' },
  ] : [
    { ...at(tid, 12, 32), title: 'PATTERN', desc: 'the atom pattern that writes the coefficients.', href: 'tone' },
    { ...at(tid, 12, 70), title: 'Drawbars 1–11', desc: 'the level of each of the 11 bands.', href: 'tone' },
    { ...at(tid, 356, 70), title: 'ATOM SHAPE · WAVELET', desc: 'one atom of the selected wavelet; the wavelet below it.', href: 'tone' },
    { ...at(tid, 356, 180), title: 'TILT · SEED', desc: 'dB per band across the drawbars; the seed of the RANDOM pattern.', href: 'tone' },
    { ...at(tid, 12, 198), title: 'Band envelope', desc: 'SCALE ATTACK, SPREAD, BODY, BRIGHT, SCALE SUSTAIN: the time behaviour of each band.', href: 'tone' },
  ];
  const fid = a ? 'filter_a1' : 'filter_b1', pid = a ? 'position_a1' : 'position_b1', oid = a ? 'osc_a1' : 'osc_b1';
  const header = (x, y, title, desc, href) => ({ x, y, title, desc, href });
  return [
    { ...at('oscframe', 12, 4), title: 'Folder tabs', desc: 'OSC1 A1 · OSC2 A2 · OSC3 B1: which oscillator\'s cards are shown on the plate; a lit dot = it is heard (the sound is set by OSC MIX).', href: 'oscillators' },
    header(392, 12, 'Preset browser', '◀ ▶ step through the presets; click the name for the list.', 'presets'),
    header(868, 12, 'DOWNLOAD VST / SAVE PRESET', 'the web app links to the plug-in; the plug-in has SAVE PRESET here.', 'plugin'),
    header(942, 12, 'MANUAL', 'this manual on an A tab, the other one on a B tab.', 'panel'),
    header(1032, 8, 'VOLUME and meter', 'master level and stereo peak meter.', 'effects'),
    ...tone,
    { ...at('mix'), title: 'OSC MIX', desc: 'three levels, one per oscillator; below them the SUB OSC.', href: 'oscillators' },
    { ...at('display'), title: 'SCOPE · SCALOGRAM', desc: 'one cycle of the whole sound (every oscillator that plays) and its atoms in the 11 bands.', href: 'tone' },
    { ...at(fid), title: 'SCALE FILTER', desc: 'a gain for each wavelet band: type, cutoff, slope, resonance, key tracking, envelope, velocity.', href: 'filter' },
    { ...at(pid), title: 'POSITION', desc: 'confines the filter or the detail to part of the cycle.', href: 'filter' },
    { ...at(oid), title: 'TUNE · OWN ENVELOPE · PITCH ENVELOPE', desc: 'the oscillator\'s own pitch, its own loudness envelope and its pitch envelope.', href: 'osc-card' },
    { ...at('flt'), title: 'FILTER', desc: 'a 24 dB resonant low-pass in every voice (LADDER or OTA), with its own envelope; open by default.', href: 'flt' },
    { ...at('ampenv'), title: 'AMP ENVELOPE', desc: 'loudness of the whole sound.', href: 'env' },
    { ...at('modenv'), title: 'MOD ENVELOPE', desc: 'moves the cutoff of every oscillator by its ENV AMT.', href: 'env' },
    { ...at('lfo'), title: 'LFO 1', desc: 'pitch, cutoff, position, wavelet morph, sparsity, resonance and envelope-to-wavelet.', href: 'lfo' },
    { ...at('lfo2'), title: 'LFO 2 / LFO 3', desc: 'each moves one control chosen by TARGET: any scale-filter, wavelet or FILTER control, in every oscillator.', href: 'lfo' },
    { ...at('voice'), title: 'VOICE', desc: 'portamento, octave, tuning, polyphony, glide, unison.', href: 'voice' },
    { ...at('fx'), title: 'EFFECTS', desc: 'saturation, chorus, ping-pong delay and reverb.', href: 'effects' },
    { ...at('play', 14, 36), title: 'CHORD MODE · BASS', desc: 'shows the chord-harp card and turns the keyboard into chords; BASS adds the low note.', href: 'chord' },
    { ...at('play', 146, 36), title: 'TUNING', desc: 'the three-position switch of the oriental keyboard: Western, Arabic, Turkish.', href: 'oriental' },
    { ...at('keys', 82, 0), title: 'Wheels · keyboard', desc: 'pitch bend, modulation; five octaves.', href: 'panel' },
  ];
};

function panelChapter(E) {
  const a = isA(E);
  const ann = annotated(`panel-${E}.png`, `The whole instrument with the ${a ? 'A1' : 'B1'} oscillator shown`, pins(E));
  const hdr = [
    ['▶ DEMO (web app)', 'Plays the demo, Beethoven\'s Appassionata: a tour of the presets, a new one about every 4 seconds. It says STOP while it runs.'],
    ['Folder tabs', `The strip of three tabs under the header — ${ctl('OSC1 A1')} · SUBTRACTIVE and ${ctl('OSC2 A2')} · SUBTRACTIVE (yellow), ${ctl('OSC3 B1')} · ADDITIVE (blue) — chooses the oscillator whose cards are shown on the plate below it; a lit dot says the oscillator is heard. It does not change the sound, and does not mark a preset as modified.`],
    ['Preset box', 'The name of the sound; a dot after it means it was modified since it was loaded. ◀ ▶ step; a click opens the preset browser.'],
    ['DOWNLOAD VST · SAVE PRESET', 'The web app\'s button opens the plug-in\'s release page; in the plug-in the same place holds SAVE PRESET.'],
    ['MANUAL', 'Opens the manual of the oscillator shown — Manual A on A1 or A2, Manual B on B1; each links to the other.'],
    ['VOLUME · meter', 'Master level (−36 … +6 dB) and the stereo peak meter.'],
  ];
  return `<p>The panel is the same in the web app and the plug-in, apart from a few buttons (the web app's DEMO and DOWNLOAD VST, the plug-in's size button, SAVE PRESET and the SYNC buttons of the tempo sync). From top to bottom: the header; the strip of three <b>folder tabs</b> with the plate under it that holds the cards of the oscillator shown (WAVELET, SCALE FILTER, POSITION, TUNE · OWN ENVELOPE · PITCH ENVELOPE) and, at the top right and common to every oscillator, <b>OSC MIX</b> and the <b>SCOPE</b> of the whole sound; the voice <b>FILTER</b>, the AMP ENVELOPE and the MOD ENVELOPE; LFO 1, <b>LFO 2/3</b> and VOICE; EFFECTS and the <b>PLAY</b> card (CHORD MODE, BASS, TUNING); the keyboard row. With <b>CHORD MODE</b> on, the chord-harp card appears below and the window grows. The credit line “${CREDIT}” sits under the wheels.</p>
<figure>${ann.image}<figcaption>The web app with the ${a ? 'A1' : 'B1'} oscillator shown. Click a number to jump to its description.</figcaption></figure>
${ann.legend}
<h3 id="header-controls">The header</h3>
${table(['Control', 'What it does'], hdr.map(r => [ctl(r[0]), r[1]]), 'compact')}
<h3 id="handling">Working with the controls</h3>
${table(['Gesture', 'Effect'], [
    ['Drag up / down', 'Changes the value; a full sweep takes about 180 pixels (120 on a drawbar).'],
    [`${kbd('Shift')} + drag`, 'Five times finer.'],
    ['Mouse wheel', `Steps of 1 % of the range (0.2 % with ${kbd('Shift')}); one step on stepped controls.`],
    [`Double-click, or ${kbd('Ctrl')} + click`, 'Resets the control to its default.'],
    ['Hover', 'The label under a knob shows its value with its unit.'],
    ['Right-click (web app)', 'MIDI learn: then move a knob or fader on your controller (Esc cancels, Delete unlinks).'],
    ['Greyed-out control', `Has no effect with the current settings (WIDTH unless the wave is PULSE or TRI, SEED unless the pattern is RANDOM, the sub oscillator's OCT and SHAPE while its LEVEL is 0).`],
  ], 'compact')}`;
}

// ---------------------------------------------------------------- 3. three oscillators
function oscillatorsChapter(E) {
  const mix = [
    [SLK[0].lvl, 'The level of oscillator A1 (subtractive). 100 % on a new patch.', 'The tone card of each oscillator has the same knob.'],
    [SLK[1].lvl, 'The level of A2 (subtractive).', 'A second subtractive voice: a detuned copy, an octave, a different wave or filter.'],
    [SLK[2].lvl, 'The level of B1 (additive).', 'Often the body, the choir or the shimmer on top of the subtractive oscillators.'],

    ['sub_level', 'The sub oscillator: a sine, triangle or square one or two octaves below the note, unfiltered, once per voice.', 'Adds weight; it does not go through the scale filters.'],
    ['sub_oct', '−1 or −2 octaves.', ''],
    ['sub_shape', 'Sine, triangle or square.', ''],
  ];
  return `<p>Okto MultiWave Synth plays <b>up to three oscillators in every voice</b>: <b>A1</b> and <b>A2</b> (wavelet subtractive) and <b>B1</b> (wavelet additive). A new patch plays A1 alone; the three levels in the <b>OSC MIX</b> card decide which oscillators sound and how loud. Each oscillator is a small instrument of its own — its tone, its SCALE FILTER, its POSITION window, its tuning, its own envelope and its pitch envelope — while the AMP ENVELOPE, MOD ENVELOPE, LFOs, VOICE settings, effects and sub oscillator are shared by the whole voice.</p>
<ul>
<li><b>One panel at a time.</b> The folder tabs ${ctl('OSC1 A1')} ${ctl('OSC2 A2')} ${ctl('OSC3 B1')} under the header choose the oscillator: they show one oscillator's cards on the plate (yellow for A1 and A2, blue for B1) while the other two keep their settings and keep sounding. A lit dot on a folder tab says its oscillator is heard (its level is above 0). Switching a tab never changes the sound and never marks a preset as modified. <b>OSC MIX</b> and the <b>SCOPE</b> are common to every oscillator, so they stay in place at the top right whatever tab is shown; the scope and the scalogram draw one cycle of the <em>whole</em> sound (every oscillator that plays, and the sub oscillator, at C4).</li>
<li><b>Levels cost nothing at 0.</b> An oscillator whose level is 0 is not computed and its wave tables are not even built, so presets that use two oscillators cost about twice one — not three times. A level is smoothed over 20 ms, so it can be moved while playing.</li>
<li><b>Most presets use two oscillators or more</b> (the ${SPEC.TOP} TOP Sounds that come from the Wavelet Synthesizer have one or two). The type at the start of the name of the other presets — <code>AA</code>, <code>AB</code>, <code>AAB</code> — says which.</li>
</ul>
<h3 id="mix">OSC MIX and SUB OSC</h3>
${controls(mix)}
<h3 id="osc-card">TUNE, OWN ENVELOPE and PITCH ENVELOPE</h3>
<p>The wide card at the bottom of the plate belongs to the oscillator shown (the folder tab says which). It is what turns three oscillators into a sound with a front and a body.</p>
${controls([
    [SLK[0].oct, 'Transposes the oscillator by whole octaves.', 'A2 an octave down under A1 is the classic "saw + sub saw".'],
    [SLK[0].semi, 'Transposes by semitones.', '+7 gives a fifth; +12 an octave.'],
    [SLK[0].fine, 'Fine tuning in cents.', '±6–15 cents between two oscillators gives a beating, chorused sound.'],
    [SLK[0].eon, `Switches the oscillator's <b>own envelope</b> on. The oscillator is then multiplied by its own ADSR <em>as well as</em> the AMP ENVELOPE, so it can only be shorter than the voice: a short decay makes it a percussive attack (a click, a pluck, a breath); a slow attack makes it fade in under the others.`, 'The ADSR display next to it draws the shape.'],
    [SLK[0].ea, 'Attack of the own envelope (linear).', ''],
    [SLK[0].ed, 'Decay to the sustain level (exponential; the time to fall by 60 dB).', '20–80 ms for a click, 200–600 ms for a pluck.'],
    [SLK[0].es, 'Sustain level.', '0 % makes a one-shot attack that dies by itself.'],
    [SLK[0].er, 'Release after the key is released.', ''],
    [SLK[0].pamt, `The <b>pitch envelope</b>: the oscillator starts this many semitones away from the note and glides to it (negative = it starts below).`, '+12 … +30 with a short TIME is a kick or a zap; a small value is a "blip" on every note.'],
    [SLK[0].ptime, 'How long the glide takes to come back to the note: exponential, the time to fall by 60 dB (half of the distance is covered in about a tenth of it).', ''],
  ])}
<p class="small muted">The table shows the ranges and defaults of A1's controls; A2 and B1 have the same ones. The own envelope has no effect while its switch is off.</p>
<h3 id="ideas">Ideas, and presets to study</h3>
${table(['Idea', 'How', 'Look at'], [
    ['A percussive attack', `One oscillator with its own envelope: a noise cycle played low (OCTAVE −2 or −3) through a high-pass at band 6–9, DECAY 20–40 ms, SUSTAIN 0; the other oscillator is the body.`,
      pick('a percussive own envelope', 3, p => p.cat === 'Drums & Perc' && [0, 1, 2].some(s => uses(p, s) && pv(p, SLK[s].eon) >= 0.5 && pv(p, SLK[s].es) === 0 && pv(p, SLK[s].ed) < 0.15))],
    ['A pitch drop', 'A sine with PITCH ENV +12 … +30 semitones and a TIME of 30–60 ms.',
      pick('a pitch envelope of +12 semitones or more', 3, p => p.cat === 'Drums & Perc' && [0, 1, 2].some(s => uses(p, s) && pv(p, SLK[s].pamt) >= 12))],
    ['A fat pair', 'Two oscillators of the same kind a few cents apart, or an octave apart with different cutoffs.',
      pick('two detuned subtractive oscillators', 3, p => (p.cat === 'Bass' || p.cat === 'Pad') && uses(p, 0) && uses(p, 1) && pv(p, SLK[0].oct) === pv(p, SLK[1].oct) && Math.abs(pv(p, SLK[0].fine) - pv(p, SLK[1].fine)) >= 4)],
    ['Additive body, subtractive attack', 'B1 for the body (drawbars, atoms), A1 as a short, bright start.',
      pick('A1 with its own envelope under B1', 3, p => uses(p, 0) && uses(p, 2) && !uses(p, 1) && pv(p, SLK[0].eon) >= 0.5)],
    ['Two LFOs on the wavelet', 'LFO 2 on one wavelet control (the SPARSITY, the window position, the SOURCE PHASE …), LFO 3 on another, at unrelated speeds; then set their amounts to 0 one at a time to hear what each does.',
      pick('LFO 2 and LFO 3 both on', 3, p => p.cat === 'SuperModulation' && pv(p, 'lfo2_amt') > 0 && pv(p, 'lfo3_amt') > 0)],
    ['A real filter on top', 'The voice FILTER with an envelope: a low cutoff, some RESO and a positive ENV AMT with a short decay is the classic synth bass or pluck; aim LFO 3 at FILTER CUTOFF for a wah.',
      pick('a bass with the FILTER and its envelope', 3, p => p.cat === 'Bass' && pv(p, 'vf_cut') < PK.vf_cut.max && pv(p, 'vf_env') > 0)],
  ], 'compact')}`;
}

// ---------------------------------------------------------------- 4. the tone of the oscillator
function toneChapter(E) {
  const a = isA(E), k = a ? SLK[0] : SLK[2];
  const wavelets = SPEC.WAVELETS.map(w => w.h.length);
  const F = a ? { sparse: 4, atoms: 5 } : { tiling: 4, patterns: 5, env: 6, atoms: 7 };   // figure numbers, in the order of the page: Figures 1-3 are in the introduction
  const wdesc = a ? [
    'A square step up and down: sharp, digital, 8-bit; every removed band halves the number of steps of the wave.',
    'Short and lopsided: asymmetric ringing, gritty and slightly metallic.', 'A good all-rounder with mild, asymmetric ringing.',
    'Longer and smoother; filter sweeps start to sound analogue.', 'Almost symmetric: cleaner, more balanced edges than Daubechies 8.',
    'Nearly symmetric and very smooth for its length.', 'Long and almost sine-like: each band is close to a pure octave of harmonics — the smoothest, most "Fourier-like" filtering.',
  ] : [
    'Each band is a square-wave pattern: hard, bright, chip-like. RAMP with TILT −6 dB/band builds an exact sawtooth staircase.',
    'Short and lopsided: buzzy, slightly metallic band timbres.', 'A good all-rounder; bands still carry a few neighbouring harmonics.',
    'Smooth bands; the octave structure becomes clear and organ-like.', 'Like Daubechies 8 but almost symmetric: a little rounder.',
    'Nearly symmetric and very smooth for its length.', 'Each RAMP band is practically a sine at its octave: the cleanest drawbar-organ sound.',
  ];
  const wtable = table(['Wavelet', 'Taps', 'Character'], SPEC.WAVELETS.map((w, i) => [`<b>${w.name}</b>`, String(wavelets[i]), wdesc[i]]), 'compact');
  const bands = `<p>Every oscillator plays <b>one cycle of 2048 samples</b>, analysed by a periodic wavelet transform into <b>11 bands</b>: band <i>b</i> has 2<sup><i>b</i>−1</sup> atoms and covers about one octave of harmonics (band 1 the fundamental, band 2 the 2nd harmonic, band 3 harmonics 3–4, band 4 harmonics 5–8 …). The analysis is pitch-synchronous, so the bands follow the note. To keep high notes alias-free each band is stored in octave-wise band-limited versions: <b>the finest bands only exist on low notes</b> — at middle C only bands 1–7 are played, at C2 bands 1–9. The SCALOGRAM draws the atoms of the 11 bands of the oscillator shown (B1 at the bottom).${a ? ' <a href="#intro-wavelets">Figure 1</a> draws the bands.' : ''}</p>
${a ? '' : figInline('tiling-b', `<b>Figure ${F.tiling}.</b> The 11 bands of one cycle: 1 to 1024 atoms. An atom pattern (RAMP, MIRROR, …) writes which atoms exist; the drawbars set how loud each band is.`)}`;
  const wl = `<h3 id="wavelets">The wavelet chooses the atom</h3>
<p>Each oscillator has its own ${ctl('WAVELET')} (the step control under the atom picture): seven classic wavelets from the 2-tap Haar step to the 40-tap Daubechies 20. Short wavelets are precise in time — sharp edges, crisp POSITION window borders — but their bands overlap; long wavelets separate the octaves cleanly. ${a ? 'For sweeps that sound like a conventional filter choose Daubechies 8 or longer; for stepped, digital colours Haar or Daubechies 2.' : 'For a clean, organ-like staircase choose Daubechies 8 or longer; for hard, chip-like bands Haar.'}</p>
${fig(`atoms-${E}.svg`, `<b>Figure ${F.atoms}.</b> One atom of each wavelet, as the ATOM SHAPE display draws it. “Taps” is the length of the wavelet filter.`)}
${wtable}
<p><b>WAVELET MORPH</b> builds every oscillator with a second wavelet too (${ctl('WAVELET 2')}) and moves between the two with ${P('wmorph')}, LFO 1 (its ${ctl('WAVELET')} knob) and the mod envelope (${ctl('ENV&gt;WAV')}); it acts on each oscillator that plays and is heard where the wavelet shapes the sound.</p>`;
  let body;
  if (a) {
    const rows = [
      [{ key: k.wave, range: 'SAW · SQUARE · PULSE · TRI · SINE · NOISE' }, 'The waveform that is analysed: one cycle, its average removed and its peak normalised.', 'SAW and NOISE have detail in every band: the most to filter.'],
      [k.width, `Only for ${ctl('PULSE')} and ${ctl('TRI')} (greyed out otherwise). PULSE: the part of the cycle spent high. TRI: where the peak sits — 50 % is symmetric.`, 'With Haar, 25 %, 50 % and 75 % leave almost nothing to filter.'],
      [k.sparsity, 'Keeps only the largest atoms of the cycle and silences the rest: 0 % keeps every atom the wave needs, 50 % about the square root of that number, 100 % a single atom. The SOURCE CYCLE display reads “K / nz ATOMS KEPT”.', 'A lossy-codec timbre: glassy, slightly digital tones. Each change rebuilds the tables (crossfaded).'],
      [{ key: k.phase, range: '0 – 360°' }, 'SOURCE PHASE: moves the wave inside the cycle before the analysis. The wavelet transform is not shift-invariant, so the same wave at another phase is made of other atoms and the filter, SPARSITY and the window act on it differently.', 'Strong with Haar, Daubechies 2 and 4; weak with Daubechies 20. LFO 2 can move it (TARGET PHASE).'],
      [{ key: k.wavelet, range: 'Haar · DB2 · DB4 · DB8 · Sym8 · Coif3 · DB20' }, 'The shape of the atoms.', 'Changing it while holding a note crossfades.'],
    ];
    body = `<p>An <b>A</b> oscillator creates its raw material from a source wave: draw the cycle, analyse it, optionally thin out the atoms, split it into 11 band layers (plus a "dry" layer: their sum, the unfiltered wave). Every voice then plays these layers with gains set by the SCALE FILTER.</p>
${bands}
${controls(rows)}
${table(['Wave', 'One cycle', 'Character'], [
      [ctl('SAW'), 'Ramps down across the cycle, jumps back up at the start.', 'All harmonics; fine atoms only at the jump. The classic subtractive source.'],
      [ctl('SQUARE'), 'High for the first half, low for the second.', 'Odd harmonics, hollow. With Haar it is a single atom: nothing to filter.'],
      [ctl('PULSE'), 'High for WIDTH of the cycle.', 'Thinner and more nasal away from 50 %.'],
      [ctl('TRI'), 'Rises to the peak at WIDTH × 360°, then falls.', 'Soft, flute-like.'],
      [ctl('SINE'), 'One sine cycle.', 'Little to filter; a pure reference, or a sub body.'],
      [ctl('NOISE'), 'One fixed random cycle.', 'Played at the note\'s pitch it is a buzzy, pitched timbre, not hiss. A noise oscillator is band-limited at the note: for dense, loud noise (hats, clicks) play it low (OCTAVE −2 or −3) and use the high bands.'],
    ], 'compact')}
<div class="callout feature"><span class="ttl">A BEAUTIFUL CONSEQUENCE</span><h3>The square wave that will not filter</h3>
<p>With the Haar wavelet the band-1 atom <em>is</em> one cycle of a square wave, so a ${ctl('SQUARE')} analysed with Haar is exactly <b>one atom</b>: the low-pass has nothing to remove. For progressive sweeps on a square choose a smooth wavelet (Daubechies 8, Symlet 8, Daubechies 20), or use the effect on purpose.</p>
${fig('haar-square.png', '<b>Haar + SQUARE:</b> a single atom, in band 1.', 'shot')}${fig('db20-square.png', '<b>Daubechies 20 + SQUARE:</b> atoms in every band, clustered at the two edges.', 'shot')}</div>
<h3 id="sparsity">Sparsity</h3>
<p>Keeping only the K largest atoms is what wavelet lossy codecs do to save bits; here it is a timbre control. The range is relative to the wave: a SAW analysed with Daubechies 8 has only ${sparse(0, 3, 0).nz} non-zero atoms (a straight ramp needs no fine atoms, only the jump does). SPARSITY keeps K = nz<sup>1 − SPARSITY</sup> of them, so the knob does something over its whole range for every wave; sources that need few atoms change in clear jumps.</p>
${fig('sparsity-a.svg', `<b>Figure ${F.sparse}.</b> A SAW analysed with Daubechies 8 (${sparse(0, 3, 0).nz} non-zero atoms) at five SPARSITY settings (grey = the original).`)}
${wl}`;
  } else {
    const rows = [
      [k.pattern, `The atom pattern that writes the coefficients: ${ctl('RAMP')}, ${ctl('MIRROR')}, ${ctl('ALT')}, ${ctl('WALSH')}, ${ctl('IMPULSE')}, ${ctl('RANDOM')}. Each band layer is peak-normalised, so the drawbars set the real level of a band.`, 'RAMP + TILT −6 dB/band with Haar is a sawtooth staircase; MIRROR is hollow and organ-like; IMPULSE puts all the detail at 0°; RANDOM is bell-like.'],
      [k.seed, `Only for the ${ctl('RANDOM')} pattern: which random atoms.`, 'Different seeds are different bells.'],
      [k.tilt, 'Slopes the drawbars: dB per band, positive = brighter, negative = darker, applied on top of the drawbars.', 'A quick way to change the brightness of a whole sound.'],
      [k.bar1, 'The drawbars 1 … 11: the level of each band (band 1 at the left). The level is normalised by max(1, the sum of the bars), so pulling bars down makes the sound darker and quieter.', 'Hover a bar to read its band.'],
      [k.atk, 'SCALE ATTACK: how long the finer bands take to arrive after the body.', 'A slow attack on the high bands makes a bowed or breathy start.'],
      [k.spread, 'SPREAD: moves the band timing up or down the bands (positive: the fine bands are late and die early; negative: the other way).', ''],
      [k.body, 'BODY: how long the low bands last.', 'With BRIGHT shorter than BODY the fine detail dies before the body, as in a real string.'],
      [k.bright, 'BRIGHT: how long the high bands last.', ''],
      [k.sus, 'SCALE SUSTAIN: the level the bands settle on while the key is held.', ''],
      [{ key: k.wavelet, range: 'Haar · DB2 · DB4 · DB8 · Sym8 · Coif3 · DB20' }, 'The shape of the atoms.', 'Changing it while holding a note crossfades.'],
    ];
    body = `<p>A <b>B</b> oscillator builds its sound from atoms: a pattern writes the coefficients of the 11 bands, the drawbars (with TILT) set their levels, and a <b>scale envelope</b> gives every band its own time behaviour — before the oscillator's filter, window, own envelope and the AMP ENVELOPE shape the whole.</p>
${bands}
${controls(rows)}
${fig('patterns-b.svg', `<b>Figure ${F.patterns}.</b> The six atom patterns, drawn with the same drawbars.`)}
${fig('scaleenv-b.svg', `<b>Figure ${F.env}.</b> The scale envelope: the level of each band over the life of a note (BODY, BRIGHT, SPREAD, SCALE ATTACK).`)}
${fig('organ.png', 'B1 with a RAMP pattern: the drawbars at their positions, the scope and the scalogram.', 'shot')}
${wl}`;
  }
  return body;
}
function sparse(wave, wavelet, s, width) {
  const p = C.defaults(); const Q = C.P;
  p[Q.osc_view] = 0; p[Q.a_wave] = wave; p[Q.wavelet] = wavelet; p[Q.a_sparsity] = s || 0; p[Q.a_width] = width == null ? 0.5 : width;
  const t = C.buildTables(p, false);
  return { K: t.kept, nz: t.nonzero };
}

// ---------------------------------------------------------------- 5. filter and position
function filterChapter(E) {
  const a = isA(E), k = a ? SLK[0] : SLK[2];
  const rows = [
    [k.ftype, `Shape of the gain curve over the bands: ${ctl('LOW-PASS')} keeps the coarse bands, ${ctl('HIGH-PASS')} the fine ones, ${ctl('BAND-PASS')} about one band around the cutoff, ${ctl('BAND-REJ')} removes the band at the cutoff.`, 'Band-pass on a low cutoff gives thin, nasal tones.'],
    [k.fcut, 'Where the filter acts, in bands: 1 = the fundamental, 11 = the finest atoms, 12 = beyond them (a low-pass is fully open).', a ? 'At middle C only bands 1–7 exist: cutoffs 8–12 sound the same there.' : 'Default 12 = open.'],
    [k.fslope, 'How steeply the bands beyond the cutoff are attenuated; one band ≈ one octave, so 24 dB/band behaves like a 24 dB/octave filter. For BAND-REJ it sets the notch width.', 'Steep slopes act like faders that switch bands on and off.'],
    [k.fres, 'Boosts the bands around the cutoff by up to 24 dB. A band boost, not feedback: it never self-oscillates.', 'Resonance adds level: watch the meter.'],
    [k.fkey, '100 %: the cutoff follows the note. 0 %: it stays at a fixed frequency (C4 = 261.63 Hz).', '50 % is the familiar "darker as you go up".'],
    [k.fenv, 'How far the MOD ENVELOPE moves this oscillator\'s cutoff: −11 … +11 bands at its peak.', 'Each oscillator has its own amount: the same envelope can open one and close another.'],
    [k.fvel, 'Velocity → cutoff: the shift is amount × (velocity − 1).', '+2 … +3 bands: soft notes darker.'],
  ];
  const pos = [
    [k.pcen, 'Centre of the window inside the cycle, 0° … 360°.', a ? '180° is the falling edge of SQUARE.' : 'With IMPULSE all the detail sits at 0°.'],
    [k.pwid, 'How much of the cycle the window covers.', 'Narrow windows are automatically widened on high notes (no aliasing).'],
    [k.pdep, a ? 'How strongly the window confines the filter: 0 % = off (the filter acts everywhere); 100 % = the filter acts only inside the window, outside it the dry cycle plays.'
      : 'How strongly the window confines the detail: 0 % = off; 100 % = bands 2–11 exist only inside the window, outside it only band 1 sounds.', 'LFO 1 and LFO 2 can move the window.'],
  ];
  return `<p>${a ? 'The <b>SCALE FILTER</b> does not cut frequencies: it gives each of the 11 bands its own gain and the sound is the sum of the band layers. A low-pass removes the fine atoms and keeps the coarse ones. There is no phase shift and no feedback, and the <em>character</em> of a sweep depends on the wavelet: with Haar every removed band halves the number of steps of the wave, with Daubechies 20 the bands are nearly pure octaves.'
    : 'The <b>SCALE FILTER</b> multiplies the band levels set by the drawbars, the tilt and the scale envelope: think of it as a second set of drawbars you can move with an envelope, an LFO, velocity and the keyboard. Its default cutoff of 12 is open. The level normalisation of the drawbars is computed before the filter, so closing the filter really makes the sound darker and quieter.'}
Every oscillator has its own filter and window; the tabs show the cards of the oscillator selected. The table lists the controls of ${a ? 'A1' : 'B1'}; the other oscillators of the same kind have the same ones.</p>
<h3 id="filter">SCALE FILTER</h3>
${controls(rows)}
${fig(`filter-${E}.svg`, '<b>Gain per band at CUTOFF 6</b> for the four filter types, computed with the instrument\'s own code (24 dB/band).')}
<p>The cutoff actually used by a voice, recomputed every 32 samples: <code>cutoff = CUTOFF + ENV AMT × mod envelope + LFO 1 CUTOFF × LFO 1 (+ LFO 2 and LFO 3 aimed at CUTOFF) + VEL AMT × (velocity − 1) + (1 − KEY TRK) × log₂(261.63 Hz ÷ note frequency)</code>. (The voice <b>FILTER</b> of the next chapters is another filter, on frequencies: do not mix them up.)</p>
<h3 id="position">POSITION window</h3>
<p>${a ? 'Wavelet atoms live at definite places in the cycle, so an A oscillator can filter <em>one part</em> of the cycle and leave the rest untouched: soften only the falling edge of a square, or darken only the reset of a saw.' : 'Atoms live at definite places in the cycle, so a B oscillator can decide <em>where</em> the detail is allowed to exist: coarse band 1 everywhere, bands 2–11 only in part of the cycle — a moving "focus", a pulse-width-like effect locked to the pitch.'}</p>
${controls(pos)}
${fig(`window-${E}.svg`, '<b>The window over one cycle</b> (centre 180°, width 40 %) at three depths; the WINDOW display draws the same curve.')}`;
}

// ---------------------------------------------------------------- 6. envelopes
function envChapter() {
  return `<p>Two ADSR envelopes run for every voice, plus the <b>own envelope</b> and <b>pitch envelope</b> of each oscillator (see <a href="#osc-card">TUNE, OWN ENVELOPE and PITCH ENVELOPE</a>). Attacks are linear; decays and releases are exponential (the time given is the time to fall by 60 dB).</p>
<h3 id="amp-env">AMP ENVELOPE</h3>
${controls([
    ['amp_a', 'Rise from silence to full level.', '1–5 ms is click-free for most sounds; 0.3–1 s for pads.'],
    ['amp_d', 'Fall from full level to the sustain level.', 'For plucks set SUSTAIN 0 % and use DECAY as the note length.'],
    ['amp_s', 'Level held while the key (or the sustain pedal) is down.', ''],
    ['amp_r', 'Fade after the key is released. The voice is freed at −100 dB.', 'Long releases overlap: raise VOICES for pads.'],
    ['amp_vel', 'How much velocity sets the loudness. 0 % = every note equally loud.', 'The computer keyboard plays at velocity 80 %.'],
  ])}
<h3 id="mod-env">MOD ENVELOPE</h3>
<p>It moves the cutoff of <b>every oscillator</b> by that oscillator's ${ctl('ENV AMT')} (so with ENV AMT at 0 it does nothing there), and the WAVELET MORPH by ${ctl('ENV&gt;WAV')}. It ignores velocity — use ${ctl('VEL AMT')} for that.</p>
${controls([
    ['mod_a', 'Attack of the modulation envelope.', 'A slow mod attack gives brassy swells.'], ['mod_d', 'Decay to the mod sustain level.', ''],
    ['mod_s', 'Mod level held while the key is down.', ''], ['mod_r', 'Mod release.', ''],
  ])}`;
}

// ---------------------------------------------------------------- 7. LFOs
function lfoChapter() {
  return `<p>Three LFOs: <b>LFO 1</b>, and <b>LFO 2</b> and <b>LFO 3</b>, which share a card (its two tabs, ${ctl('LFO 2')} and ${ctl('LFO 3')}, show one or the other; a lit dot on a tab says that LFO is on, its AMOUNT is not 0). They are shared by all voices and oscillators and run freely (not restarted by new notes): in a chord every voice moves together. For a movement that starts with each note use the MOD ENVELOPE.</p>
<h3 id="lfo1">LFO 1</h3>
${controls([
    ['lfo_shape', `${ctl('SINE')}, ${ctl('TRI')}, ${ctl('SAW')}, ${ctl('SQR')} or ${ctl('S&amp;H')} (sample &amp; hold: a new random value per cycle).`, ''],
    ['lfo_rate', 'Speed, one cycle per 20 s to 20 per second. In the plug-in, with SYNC on, a note value at the host\'s tempo.', '5–6 Hz for vibrato.'],
    ['lfo_pitch', 'Vibrato depth in cents (the mod wheel adds up to 50 more).', ''],
    ['lfo_cut', 'Moves the cutoff of every oscillator by up to ± this many bands.', ''],
    ['lfo_pos', 'Moves the POSITION window of every oscillator by up to ± this many degrees.', 'Only audible where the window\'s DEPTH is above 0 %.'],
    ['lfo_wav', 'Moves the WAVELET MORPH.', 'Needs a WAVELET 2 different from the oscillator\'s WAVELET.'],
    ['lfo_sp', 'Moves the SPARSITY of every subtractive oscillator by up to ± this share of the range: the atoms that are kept come and go, and the timbre swings between a rich tone and a few atoms.', 'Starts to show where the wavelet is not Haar (a Daubechies 8 saw has only 96 atoms). The tables are built at nine sparsities while this is above 0 %.'],
    ['lfo_res', 'Moves the RESO of every scale filter by up to ± this many dB (kept between 0 and 24 dB): the resonant peak of the filter pulses.', 'Needs a cutoff inside the sound (bands 3–8) and a little resonance to start from.'],
    ['lfo_ew', 'Makes the reach of the MOD ENVELOPE on the WAVELET MORPH (ENV&gt;WAV) swing: ENV&gt;WAV + this amount × LFO 1.', 'Needs a WAVELET 2 different from the oscillator\'s WAVELET, and an ENV&gt;WAV above 0 or a MORPH to move.'],
  ])}
<h3 id="lfo2">LFO 2 and LFO 3</h3>
<p>LFO 2 and LFO 3 are the same LFO twice: each moves <b>one control, in every oscillator at once</b>, by the same amount: the one chosen in its ${ctl('TARGET')} menu — ${ctl('CUTOFF')}, ${ctl('SLOPE')}, ${ctl('RESO')}, ${ctl('KEY TRK')}, ${ctl('ENV AMT')} or ${ctl('VEL AMT')} of the scale filters, ${ctl('POSITION')}, ${ctl('WIDTH')} or ${ctl('DEPTH')} of the windows, the ${ctl('PHASE')}, ${ctl('SPARSITY')} or ${ctl('SRC WIDTH')} of the subtractive oscillators, the ${ctl('TILT')}, ${ctl('ODD BARS')}, ${ctl('EVEN BARS')} or ${ctl('SCALE SUS')} of the additive ones, the ${ctl('MORPH')} between two wavelets, or the ${ctl('FILTER CUTOFF')} or ${ctl('FILTER RESONANCE')} of the voice FILTER: every control of the wavelet oscillators, of the scale filter and of the voice filter. Each oscillator keeps its own base value; the LFO moves them in step. The two LFOs can aim at different controls (two independent movements) or at the same one (their moves add up). A target acts on <em>every</em> oscillator that has the control, and cannot be limited to one: aim it at a control that only one kind has (SPARSITY, PHASE or SRC WIDTH for the subtractive oscillators; TILT, ODD BARS, EVEN BARS or SCALE SUS for the additive one) to move that kind only.</p>
${controls([
    ['lfo2_target', 'What LFO 2 moves (the menu at the right of the three knobs; the mouse wheel steps through it). LFO 3 has the same menu.', 'LFO 1 already has CUTOFF and POSITION: give LFO 2 another target for two independent movements.'],
    ['lfo2_shape', 'The same five shapes as LFO 1, on a knob with five positions after AMOUNT (SINE, TRI, SAW, SQR, S&amp;H; the name of the shape is under the knob; a click steps to the next shape).', ''],
    ['lfo2_rate', 'Speed, independent of LFO 1; note values with SYNC in the plug-in.', 'A rate that does not divide LFO 1\'s makes the two drift against each other.'],
    ['lfo2_amt', 'How far the target moves: up to ± this share of half its range, kept in range (FILTER CUTOFF: half of its ten octaves, so 30 % is about ± 1.5 octaves). 0 % (the default) switches LFO 2 off.', 'Start around 20–30 %.'],
    ['lfo3_target', 'What LFO 3 moves: the same menu as LFO 2. When both aim at the same control their moves add.', 'Use LFO 3 for a second control of the wavelet oscillators: LFO 2 on SPARSITY, LFO 3 on the WINDOW position, for instance.'],
    ['lfo3_shape', lfoShape('lfo3_shape'), ''],
    ['lfo3_rate', 'Speed, independent of the two other LFOs; note values with SYNC in the plug-in.', 'Rates that do not divide each other make the LFOs drift apart.'],
    ['lfo3_amt', 'How far the target moves, as for LFO 2. 0 % (the default) switches LFO 3 off.', ''],
  ])}
<p><b>PHASE, SPARSITY and SRC WIDTH</b> (SOURCE WIDTH: the pulse width of a PULSE source or the skew of a TRI one) change what the wavelet transform sees, so the subtractive oscillators' tables are built at several values — 12 phases round the cycle, 9 sparsities from 0 to 100 %, 9 widths from 2 to 98 % (about 1 MB per set) — and each voice crossfades between the two nearest: a smooth scan through the timbres. At AMOUNT 0 nothing extra is built. One kind of scan per oscillator at a time: SPARSITY (from LFO 1, LFO 2 or LFO 3) comes first, then PHASE, then SRC WIDTH. TILT, ODD BARS, EVEN BARS and SCALE SUS move the additive oscillators' drawbars (odd = bands 1, 3, 5 …; even = bands 2, 4, 6 …) and the level their bands decay to; MORPH adds to the WAVELET MORPH position. <b>FILTER CUTOFF</b> moves the cutoff of the voice FILTER (in octaves: the whole range is ten octaves) and <b>FILTER RESONANCE</b> its resonance; either one switches the filter on, even while its own settings are open.</p>
<h3 id="supermod">SuperModulation</h3>
<p>The idea of the instrument is that every timbre control acts on the <em>scales</em> of one cycle of the wave — and so can an LFO, while the note sounds. Moving the cutoff of a scale filter, the resonance, the SPARSITY, the window, the SOURCE PHASE or the morph between two wavelets does not sweep a Fourier filter: the harmonics are re-coupled according to the wavelet, so the timbre swims in a way an ordinary filter sweep does not. The <b>SuperModulation</b> category of the presets (the first one in the lists, ${SUPERMOD.length} sounds) is made of such sounds: oscillators of different character and LFOs that move several of these controls at unrelated speeds. LFO 2 and / or LFO 3 are on a control in ${N_LFO23} of the ${SPEC.PRESETS.length} factory presets (${N_SM_LFO23} of the ${SUPERMOD.length} SuperModulation ones). Open one, then set the amounts of the LFOs to 0 one by one to hear what each does.</p>
<h3 id="lfo-sync">Tempo sync (plug-in only)</h3>
<p>In the plug-in a ${ctl('SYNC')} button belongs to LFO 1, to LFO 2 and to LFO 3 (each has its own) and to the delay. Lit, the RATE (or the delay's TIME) becomes a note value at the host's tempo (120 BPM when the host gives none) and follows its tempo changes. The note values run from ${PK.lfo_div.choiceShort[0]} to ${PK.lfo_div.choiceShort[PK.lfo_div.choiceShort.length - 1]} for the LFOs and ${PK.fx_ddiv.choiceShort[0]} to ${PK.fx_ddiv.choiceShort[PK.fx_ddiv.choiceShort.length - 1]} for the delay (T = triplet, D = dotted). SYNC sets the speed only; the LFO is not restarted on the beat. SYNC is off by default, and the web app has none (a browser page has no tempo).</p>`;
}

// ---------------------------------------------------------------- 8. voice and effects
function voiceChapter() {
  return `<h3 id="voice">VOICE</h3>
${controls([
    [{ key: 'v_porta', label: 'PORTAMENTO', range: 'OFF · POLY · LEGATO', def: 'POLY' }, 'When notes glide; GLIDE sets how long (0 = nothing glides). POLY: every voice glides from its own previous note, so chord changes glide voice by voice. LEGATO: only while another key is held.', 'LEGATO for expressive leads, POLY for gliding chords.'],
    ['v_oct', 'Transposes the whole instrument by octaves (each oscillator also has its own TUNE).', ''],
    ['v_fine', 'Fine tuning in cents.', ''],
    ['v_voices', 'Notes sounding at once; 1 = monophonic legato with last-note priority.', 'Pads need 8 or more.'],
    ['v_glide', 'Portamento time.', '30–80 ms for leads.'],
    ['v_unison', 'Stacked copies of every note (1–4).', 'Cost = voices × unison × oscillators.'],
    ['v_detune', 'Spread of the unison copies in cents.', '8–15 cents for warmth.'],
    ['v_width', 'Spreads the unison copies across the stereo field.', 'No effect with UNISON 1.'],
  ])}
<p>When all voices are busy a new note takes the oldest released voice first, then the oldest held one. Each note plays at about −8 dB to leave headroom for chords. A preset can switch mono ↔ poly; a note off always finds its voice.</p>
<h3 id="flt">FILTER</h3>
<p>The <b>FILTER</b> card (below the plate, next to the AMP ENVELOPE) is a conventional filter in every voice: a <b>four-pole (24 dB per octave) resonant low-pass</b> that works on the voice <em>after</em> its oscillators are mixed and <em>before</em> its AMP ENVELOPE. It cuts <em>frequencies</em>, on top of the SCALE FILTERs, which cut scales. Two characters, chosen with the ${ctl('LADDER')} | ${ctl('OTA')} switch: <b>LADDER</b> saturates at every stage — dark and gritty, and the resonance thins the low end as it rises; <b>OTA</b> saturates only the input of its feedback loop and keeps part of the low end — rounder and smoother. The cutoff a voice uses is <code>CUTOFF × 2<sup>ENV AMT × 8 × FILTER ENVELOPE + KEY TRK × (note − C4) ÷ 12 + LFO 2 + LFO 3</sup></code> (the exponent is in octaves). <b>It is open by default</b> (CUTOFF at its maximum, no resonance, no drive, no envelope): then it is not even computed and costs nothing. Turning any of its controls, or aiming an LFO at it, switches it on.</p>
${controls([
    ['vf_type', `${ctl('LADDER')}: every stage saturates, the resonance takes the low end away; ${ctl('OTA')}: only the input of the loop saturates, the low end is partly kept.`, 'LADDER for gritty basses and leads, OTA for rounder pads and keys.'],
    ['vf_cut', 'The frequency above which the sound is attenuated (24 dB per octave); exponential scale, 20 Hz to 20 kHz. At the top it is open.', 'Play a note and sweep it; add RESO for the classic wah.'],
    ['vf_res', 'Feeds the output back to the input: a peak at the cutoff. At 100 % the filter is just above the point where it sings by itself.', 'The resonance adds level: watch the meter.'],
    ['vf_drive', 'Saturates the sound before the filter (a tanh, level-compensated): 0 % = clean.', 'With a resonance it makes the filter growl.'],
    ['vf_key', 'How much the cutoff follows the note (100 % = one octave of cutoff per octave of pitch, from C4).', 'High notes stay as bright as low notes.'],
    ['vf_env', 'How far the FILTER ENVELOPE (the ADSR next to it) moves the cutoff: up to ± 8 octaves. Negative values close the filter as the envelope rises.', 'Combine a moderate cutoff with a positive ENV AMT and a short decay for the classic "pluck" of a synth bass.'],
    ['vf_a', 'Attack of the FILTER ENVELOPE.', 'A slow attack opens a pad.'], ['vf_d', 'Decay to the sustain level.', ''],
    ['vf_s', 'Level the envelope holds while the key is down (0 % = the filter closes again, 100 % = it stays open).', ''], ['vf_r', 'Release.', ''],
  ])}
<p>Each voice has its own filter and its own FILTER ENVELOPE, started by its note; the cutoff glides smoothly from block to block, so it does not zipper. LFO 2 and LFO 3 can move the CUTOFF (<code>FILTER CUTOFF</code>) and the RESONANCE (<code>FILTER RESONANCE</code>) of every voice together.</p>
<h3 id="effects">EFFECTS</h3>
<p>After the voice FILTER (above), in the order of the sound: <b>saturation</b> → <b>string-machine triple chorus</b> → <b>ping-pong delay</b> → <b>reverb</b> → DC blocker → master volume → soft limiter (never above 0 dBFS).</p>
${controls([
    ['fx_drive', 'Saturation: a smooth tanh soft-clipper driven by up to +24 dB, level-compensated. 0 % = bypassed.', '20–40 % thickens basses.'],
    ['ch_mix', 'Chorus amount: three delay lines swept by a slow and a fast LFO, 120° apart, spread left / centre / right.', 'Widens pads, strings and organs.'],
    ['ch_rate', 'Speed of the chorus LFOs.', ''], ['ch_depth', 'Depth of the sweep.', ''],
    ['fx_dtime', 'Delay time (up to 4 s). Changing it while echoes ring makes them glide in pitch. With SYNC on in the plug-in, a note value.', ''],
    ['fx_dfb', 'Feedback: more repeats. The echoes alternate left and right and get darker.', 'Above 70 % the repeats last for seconds.'],
    ['fx_dmix', 'Level of the echoes.', ''], ['fx_rsize', 'Reverb decay, from a small room to a long hall.', ''], ['fx_rmix', 'Level of the reverb.', '15–25 % for most sounds; 40 % + for pads.'],
    [{ key: 'master', label: 'VOLUME' }, 'Master output level, the small knob in the header.', 'Lower it when the meter sits at the top.'],
  ])}
<p>The smoothing of the delay, its filter, the master level and the reverb damping have the same time constants at 44.1, 48 and 96 kHz. An instance with nothing sounding and no echo left to come does not compute its effects (it costs nothing while idle).</p>`;
}

// ---------------------------------------------------------------- 9. chord mode
function chordChapter() {
  return `<p>The <b>CHORD MODE</b> button of the <b>PLAY</b> card (above the keyboard) turns the keyboard into a <b>chord harp</b>: the panel grows and the <b>CHORD KEYBOARD</b> card appears below it. With CHORD MODE off the card is not shown and the keyboard plays plain notes.</p>
${fig('chord-card.png', 'The CHORD KEYBOARD card with G major 7 held (FOLDED) and a string of the strum plate touched.', 'shot')}
<ul>
<li><b>One octave chooses the chord type</b> and makes no sound: ${ctl('KEYS OCT')} (C3–B3 by default, tinted purple on the keyboard). Every key <b>above</b> it plays the whole chord with one finger; keys pressed while the root is held play as themselves; keys <b>below</b> it play a bass line.</li>
<li><b>Twelve pads</b> in the layout of the selector octave — Maj, Min, 7, m7, Maj7, Sus2, Sus4, Dim, Aug, 5, Add9, Note: the white keys carry the major and bright chords, the black keys the minor, altered or bare ones. A click on a pad chooses the type and switches CHORD MODE on. ${SPEC.CHORDS.length} chord types in all (the Chord Type parameter has the others: 6, m6, m7b5, dim7, 9, m9, maj9, 7sus4, mMaj7, 6/9).</li>
<li>${ctl('VOICING')}: ${ctl('STACKED')} (root + intervals) or ${ctl('FOLDED')} (the chord's notes inside the octave of the root, as on an electronic chord harp); ${ctl('STRUM')} (0–100 ms) starts the notes one after the other; the <b>strum plate</b> strums the chord with the mouse.</li>
<li>${ctl('BASS')} (a button of the PLAY card, <b>on by default</b>) adds a bass note with every chord: the root <b>two octaves below</b>, a little louder (+3 dB), never lower than C1. A chord keeps the level of a triad whatever its size (the notes of a seventh with its bass are turned down a little), so chords never press on the limiter.</li>
<li><b>The chord follows the left hand.</b> Hold a note with the right hand and press another chord on the selector octave: the held chord changes <i>at once</i>, even for the note already pressed. Only the notes of the chord now played sound — the notes that are not in the new chord fade out in a few milliseconds, the ones the two chords share go on without being played again. The left hand has a <b>memory</b>: the last chord chosen stays chosen after its key is released and applies to the next right-hand note. Clicking a pad, ${ctl('VOICING')} or ${ctl('BASS')} while a note is held changes the held chord the same way.</li>
<li>The chord's notes are ordinary notes: sustain, portamento, voice allocation and every sound parameter work as usual, and a chord never uses more voices than VOICES. A note shared by the chord and a held key sounds until both release it.</li>
<li>The chord settings are plug-in parameters (automatable, saved with the Live Set) but <b>never part of a preset</b>: loading a sound does not change how you play. A selector key updates the Chord Type parameter.</li>
</ul>`;
}

// ---------------------------------------------------------------- 9b. oriental keyboard
function orientalChapter() {
  const sc = SPEC.PARAMS[SPEC.PARAMS.findIndex(p => p.key === 'mt_scale')].choices;
  return `<p>The <b>oriental keyboard</b> plays quarter tones, as arranger keyboards with oriental scales do. The three-position switch ${ctl('TUNING')} sits in the <b>PLAY</b> card:</p>
<ul>
<li>${ctl('WEST')} — equal temperament, as always (the default).</li>
<li>${ctl('ARAB')} — the <b>Arabic</b> tuning: 24 tones to the octave, the quarter tone being 50 cents. The keys that are half-flat in the scale chosen are lowered by a quarter tone.</li>
<li>${ctl('TURK')} — the <b>Turkish</b> tuning of the makams: 53 commas to the octave (a comma is 22.6 cents; the values of the Arel-Ezgi-Uzdilek system), so a third or a seventh is a comma or two away from the Western one.</li>
</ul>
<p>Outside WEST two more controls show in the PLAY card: ${ctl('MAQAM')} chooses the scale (${sc.join(', ')}) and ${ctl('TONIC')} the key it starts on (the scale is moved to it: Rast on D is Rast starting at D). The keys the tuning moves carry a small amber arrow on the keyboard (pointing down: lower than the piano key). A key that is not a degree of the scale keeps its piano pitch, so the sharps and flats you need stay in tune.</p>
<ul>
<li>Every note follows the tuning: the keys, the chord harp's notes (a chord on Rast has its half-flat third), the sub oscillator, the notes a MIDI file plays — except the <b>demo</b>, which always plays in equal temperament so that it is not out of tune with the music.</li>
<li>TUNING, MAQAM and TONIC are <em>playing</em> settings, like CHORD MODE: they are automatable parameters, saved with the Live Set, and never part of a preset.</li>
<li>Outside WEST the panel changes its colours: the accent (knob rings, tabs, scope, buttons) turns <b>sand-gold</b> with ARAB and <b>carmine red</b> with TURK (the additive oscillator takes coral, then amber), and the PLAY card has a pattern of octagons and eight-pointed stars in the colours of the tuning.</li>
<li>Examples. <b>Rast on C, Arabic</b>: play C D E F G A B C — E and B are a quarter tone low, the rest is as on the piano. <b>Bayati on D</b>: D then E, a quarter tone flat, F G A B♭ C. <b>Hicaz on D, Turkish</b>: D E♭ F♯ G A B♭ C with the commas of the Turkish system.</li>
</ul>
<p class="small muted">The tunings are the usual approximations of keyboards (half-flat = −50 cents; Turkish values rounded to a comma): they do not replace an oud or a ney, but they make the characteristic intervals playable on a piano keyboard. In the Arabic tuning Rast retunes the third and the seventh, Bayati and Saba the second degree, and Hijaz and Nahawand use the piano's semitones (nothing to retune); the Turkish tuning gives all five their commas.</p>`;
}

// ---------------------------------------------------------------- 10. presets
const oscOf = p => SL.filter(s => p.values[s.k.lvl] > 0).map(s => s.name).join(' + ');   // SPEC.SLOTS holds parameter indices
// the one-line description of a preset: the TOP Sounds of the Wavelet Synthesizer have theirs in top_desc.js, the others in the spec
const descOf = p => {
  const d = SPEC.PRESETS.indexOf(p) < SPEC.TOP ? (TOP_DESC[p.name] || [])[1] : SPEC.DESCRIPTIONS[p.name];
  if (!d) console.warn('manual: no description for ' + p.name);
  return (d || '').replace(/^./, c => c.toUpperCase());
};
function presetTable() {
  const star = p => (TOP_NAMES.has(p.name) ? '<span class="fav" title="In TOP Sounds">★</span> ' : '');
  const opens = p => (p.name === SPEC.PRESETS[SPEC.DEFAULT_PRESET].name ? ' <span class="small muted">(the synth opens here)</span>' : '');
  const th = h => `<thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead>`;
  // TOP Sounds, in their order
  const topRows = TOP_LIST.map(i => { const p = SPEC.PRESETS[i]; return `<tr><td>${esc(p.name)}${opens(p)}</td><td class="small">${p.cat}</td><td class="small">${oscOf(p)}</td></tr>`; }).join('');
  // the categories, in the factory order: the sounds of the Wavelet Synthesizer first, then the others from the best rated to the least rated
  let body = '';
  for (const cat of SPEC.CATEGORIES) {
    const list = SPEC.PRESETS.filter(p => p.cat === cat);
    if (!list.length) continue;
    body += `<tr class="cat"><td colspan="3">${cat} · ${list.length}</td></tr>`;
    for (const p of list) body += `<tr><td>${star(p)}${esc(p.name)}${opens(p)}</td><td class="small">${oscOf(p)}</td><td>${descOf(p)}</td></tr>`;
  }
  return `<h4 id="top-list">TOP Sounds · ${TOP_LIST.length}</h4>
<div class="tbl"><table class="presets toplist">${th(['Preset', 'Category', 'Oscillators'])}<tbody>${topRows}</tbody></table></div>
<h4 id="category-list">The ${SPEC.CATEGORIES.length} categories · ${SPEC.PRESETS.length} presets</h4>
<div class="tbl"><table class="presets rated">${th(['Preset', 'Oscillators', 'Sound'])}<tbody>${body}</tbody></table></div>`;
}
function presetsChapter(E) {
  const first = SPEC.PRESETS[SPEC.DEFAULT_PRESET], cats = SPEC.CATEGORIES.map(c => `${c} (${SPEC.PRESETS.filter(p => p.cat === c).length})`).filter(x => !/\(0\)$/.test(x));
  return `<p>Okto MultiWave Synth has <b>${SPEC.PRESETS.length} factory presets</b>. They are the sounds that its author, OktoPierre, kept after listening to the candidates and rating them: only the presets he rated more than one star (3 or more on his scale of 1 to 10) are in the instrument.</p>
<ul>
<li><b>TOP Sounds</b> come first (${TOP_LIST.length}): the ${SPEC.TOP} sounds of the Wavelet Synthesizer beta 0.7 that he kept (they sound exactly as there; one or two oscillators), ${N_EXTRA} more of his best rated sounds and favourites, sorted from the best to the least rated. <b>The synth opens on the first of them, ${esc(first.name)}.</b></li>
<li>Then come the <b>${SPEC.CATEGORIES.length} categories</b>: ${cats.slice(0, -1).join(', ')} and ${cats[cats.length - 1]}. A category lists all its sounds (the TOP Sounds that belong to it are marked ★) from the best rated to the least rated.</li>
<li>The name of a sound starts with its <b>type</b>, the letters in the colours of the oscillators (A yellow, B blue): <code>A</code> one subtractive oscillator, <code>AA</code> two, <code>AB</code> one subtractive and the additive one, <code>AAB</code> two and the additive one, <code>B</code> the additive one alone; then a title, for example <code>${esc(SPEC.PRESETS[SPEC.TOP].name)}</code>.</li>
</ul>
<p>The <b>SuperModulation</b> category (${SUPERMOD.length} sounds) holds the sounds whose life is the LFOs moving the scale filter, the sparsity, the window, the source phase, the morph and the additive scales (see <a href="#supermod">SuperModulation</a>). The <b>Other</b> section (${SPEC.PRESETS.filter(p => p.cat === 'Other').length} sounds) holds the SuperModulation sounds that have no stars (the author rated the best ones and kept only those in SuperModulation): they are all playable, just not selected.</p>
<p><b>Choosing a sound.</b> The preset box shows the name of the sound; ◀ ▶ step through the factory presets and clicking the name opens the <b>preset browser</b> at the right of the panel: TOP Sounds and the categories, one click plays a sound, the arrow keys ${kbd('↑')} ${kbd('↓')} ${kbd('←')} ${kbd('→')} too. The browser follows the preset box: it shows the category of the sound and the sound itself. In the plug-in the browser also shows the author's <b>stars</b> at the right of every sound (five stars, with half stars: 1 to 10); click to give your own rating, click the same rating to clear it. The ratings are saved in the presets file, and EXPORT carries them.</p>
<h3 id="saving">Saving your own sounds</h3>
<ul>
<li><b>Web app.</b> The buttons at the right of the status bar: <b>Save preset</b> keeps the sound in this browser's storage (the USER PRESETS group), <b>Export</b> downloads it as a <code>.json</code> file, <b>Import</b> loads one. User presets live in that browser profile only: use Export for anything you want to keep.</li>
<li><b>Plug-in.</b> See <a href="#plugin">The plug-in</a>: SAVE PRESET, the user bank, the presets file. You can also keep sounds with Live (a device preset, an Instrument Rack, the Live Set).</li>
</ul>
<h3 id="preset-list">All the presets</h3>
<p class="small muted">★ = in TOP Sounds. Each list is sorted from the best to the least rated by the author. The oscillators are the ones whose level is above 0.</p>
${presetTable()}`;
}

// ---------------------------------------------------------------- 12. plug-in
function pluginChapter() {
  return `<p>The plug-in runs the same sound engine with the same panel. It is a single self-contained file inside an <code>OktoMultiWaveSynth.vst3</code> bundle folder, which also carries these manuals; nothing else needs to be installed. The same file is a VST3 and a VST2 plug-in (a copy named <code>OktoMultiWaveSynth.dll</code> sits next to it for VST2 hosts). Windows 10/11, 64-bit.</p>
<h3 id="plugin-install">Installation</h3>
<ol class="steps">
<li>Download the zip from the <a href="${VST_URL}">release page</a> and unzip it.</li>
<li>Copy the <b>whole</b> <code>OktoMultiWaveSynth.vst3</code> folder into <code>C:\\Program Files\\Common Files\\VST3</code> (<code>vst\\install.bat</code> does it and asks for administrator rights), or into the VST2 plug-in folder you use.</li>
<li>In Live: <b>Preferences → Plug-ins</b>, switch on <b>Use VST3 Plug-in System Folders</b> (or the VST2 custom folder), <b>Rescan</b>. If both are on and see the folder, Live lists the plug-in twice; use either.</li>
</ol>
<p class="small muted">It installs next to the Wavelet Synthesizer and the WaveChord Synth: its own name, class IDs, VST2 ID and presets file.</p>
<h3 id="vst-diff">What is specific to the plug-in</h3>
<ul>
<li><b>No welcome window, no DEMO or DOWNLOAD VST button, no status bar.</b> Audio runs as soon as the plug-in is loaded. The window-size button (70–150 %) is next to the logo.</li>
<li><b>Tempo sync</b>: the SYNC buttons of the delay and the two LFOs (see <a href="#lfo-sync">Tempo sync</a>).</li>
<li><b>Presets</b>: ◀ ▶ step through the factory presets (those you deleted are skipped); a click on the name opens the <b>preset browser</b> (FACTORY and USER BANK tabs; ${ctl('HIDE ▸')} folds it away), a right-click the classic menu. In the browser: ▲ ▼ move a sound within its list, a sound dragged onto a category moves there (onto TOP Sounds it joins them), the arrow keys choose, and the buttons ${ctl('TO BANK…')}, ${ctl('RESTORE')}, ${ctl('DELETE')}, ${ctl('EXPORT…')}, ${ctl('IMPORT…')} manage your sounds.</li>
<li><b>SAVE PRESET</b> (left of MANUAL) overwrites the preset playing: a factory preset is <em>adjusted</em> in place, optionally under a new name (RESTORE brings the original back); a sound of the user bank is replaced.</li>
<li><b>The presets file</b>: everything above lives in one readable text file, <code>OKTOMULTIWAVE presets.txt</code>, kept next to the <code>.vst3</code> folder (the folder must allow writing: <code>C:\\Program Files\\Common Files\\VST3</code> needs administrator rights, so install into a folder you own, or run Live as administrator once). It is written atomically after every edit and read again when another instance changes it. A file longer than 16 MB is never written over.</li>
<li><b>Automation</b>: every sound parameter and the chord harp's six settings can be automated; the oscillator tabs (OSC) are a panel choice, not part of a sound.</li>
<li><b>Stars</b>: the preset browser shows five stars (half stars: 1 to 10) at the right of every sound; click to rate, click the same rating to clear it. <b>Every sound starts with no stars</b> in the plug-in: the ratings are yours, saved in the presets file, and <b>EXPORT carries them</b>. The web app shows the author's own stars (1 to 10), read only.</li>
<li><b>KeyAttac</b>: the USER BANK of the plug-in starts with a folder of that name: the ${SPEC.KEYATTAC.length} factory presets the author starred, retouched to be very percussive (the attacks at their minimum, a short decay to a low sustain, the release kept long) and set for big chords. They are yours: rename, move or delete them (a sound deleted stays deleted).</li>
</ul>`;
}

// ---------------------------------------------------------------- 13. troubleshooting
function troubleChapter() {
  const qa = [
    ['No sound at all in the web app', 'Browsers only allow sound after a click: click <b>Play the synth</b> in the welcome window (or a key of the keyboard). The status bar must say <i>Audio on</i>. Only one window or tab plays at a time: another tab of the app may have taken the audio.'],
    ['I click an oscillator tab and the sound does not change', 'By design: the tabs only choose the panel shown. The sound is set by the three levels in the OSC MIX card. A tab shows the cards of an oscillator whose level may be 0.'],
    ['A knob I turn has no effect', 'Check the level of the oscillator whose panel you are editing (OSC MIX) — an oscillator at 0 is silent — and whether the control is greyed out (WIDTH, SEED, the sub oscillator). With the filter wide open, the cutoff does nothing.'],
    ['The filter does nothing on a SQUARE with Haar', 'A square analysed with Haar is a single atom (see Manual A): choose a smoother wavelet.'],
    ['A preset sounds quieter or louder than another', 'The presets are matched to the loudness of the TOP Sounds, but very short sounds (hats, clicks) are measured over 50 ms. Use the master VOLUME, or the level knobs.'],
    ['The plug-in does not appear in Live', 'Copy the <b>whole</b> bundle folder (not only the file inside), check <b>Use VST3 Plug-in System Folders</b> and press <b>Rescan</b>; the folder must be 64-bit Windows.'],
    ['SAVE PRESET says it cannot write', 'The presets file sits next to the <code>.vst3</code> folder; that folder must allow writing (see <a href="#vst-diff">What is specific to the plug-in</a>).'],
    ['The CPU is high', 'Cost = voices × unison copies × oscillators that are on, and the voice FILTER (about the cost of one more oscillator) when it is not open. Lower UNISON or VOICES, turn off oscillators you do not hear, open the FILTER, avoid an LFO on PHASE with many voices.'],
  ];
  return qa.map(([q, a]) => `<details class="qa"><summary>${q}</summary><p>${a}</p></details>`).join('\n');
}

// ---------------------------------------------------------------- 14. more
function moreChapter() {
  return `<p>Okto MultiWave Synth is built on the <b>Wavelet Synthesizer</b>. Its manuals explain the ideas behind each oscillator kind in depth — partials versus atoms, how many atoms a wave needs, source phase, the scale envelope, the full recipes — for the original panel, where the two engines shared one filter and one window:</p>
<ul>
<li><a href="${WS_MANUALS}manual-a.html">Wavelet Synthesizer — Manual A (Wavelet Subtractive)</a></li>
<li><a href="${WS_MANUALS}manual-b.html">Wavelet Synthesizer — Manual B (Wavelet Additive)</a></li>
</ul>
<p>Everything in them about a source wave, an atom pattern, the scale filter or the position window applies to each oscillator of Okto MultiWave Synth (each has its own); what they say about the A/B MIX knob is replaced by the three levels of OSC MIX.</p>
<h3 id="glossary">Glossary</h3>
${table(['Term', 'Meaning'], [
    ['Atom', 'One small wiggle of a wavelet transform; all atoms of a wavelet have the same shape, in sizes an octave apart.'],
    ['Band', 'All atoms of one size: band <i>b</i> has 2<sup><i>b</i>−1</sup> atoms, about one octave of harmonics. A cycle has 11 bands.'],
    ['Scale', 'The size of an atom, i.e. the octave: a "scale filter" acts on bands, not on frequencies.'],
    ['Wavelet', 'The shape of the atoms: Haar, Daubechies 2/4/8/20, Symlet 8, Coiflet 3.'],
    ['Sparsity', 'Keeping only the largest atoms of a cycle (like a lossy codec).'],
    ['Source phase', 'Moving the source wave inside the cycle before the analysis: other atoms, other timbre.'],
    ['Position window', 'A bump inside the cycle that confines the filter (A) or the detail (B) to one part of it.'],
    ['SuperModulation', 'An LFO moving the wavelet-domain controls — scale cutoff and resonance, sparsity, window, source phase and width, wavelet morph, additive scales — while a note sounds; also the first category of presets.'],
    ['FILTER', 'The voice filter: a four-pole resonant low-pass (LADDER or OTA character) with its own ADSR, before the AMP ENVELOPE. It is open by default.'],
    ['Scale filter', 'The filter of each oscillator, which gives each wavelet band its own gain (it cuts scales, not frequencies).'],
    ['Quarter tone, comma', 'Half of a semitone (50 cents), used by the Arabic tuning; the Turkish tuning divides the octave into 53 commas of 22.6 cents.'],
    ['Own envelope', 'An oscillator\'s private ADSR; it multiplies the AMP ENVELOPE.'],
    ['Pitch envelope', 'A glide of an oscillator from some semitones away to the note.'],
    ['OSC MIX', 'The three oscillator levels.'],
    ['TOP Sounds', `OktoPierre's selection (${TOP_LIST.length} presets), first in the preset lists, sorted from the best to the least rated.`],
  ], 'compact')}`;
}

// ---------------------------------------------------------------- 15. about
function aboutChapter() {
  return `<p><b>Okto MultiWave Synth</b> ${SPEC.APP.version} (${SPEC.APP.date}), created by <b>Pierre Arnaud GUYOT</b> (OktoPierre), on the basis of his Wavelet Synthesizer beta 0.7 and his chord keyboard (WaveChord). Free software under the GNU General Public License v3 or later, WITHOUT ANY WARRANTY: <a href="https://github.com/PierreArnaudGUYOT/Okto-MultiWave-Synth">github.com/PierreArnaudGUYOT/Okto-MultiWave-Synth</a>.</p>
<ul>
<li>Demo music: MIDI from the <a href="https://www.mutopiaproject.org">Mutopia Project</a> — Beethoven's Piano Sonata No. 23 <i>Appassionata</i>, Op. 57 III (public domain).</li>
<li>VST3 interface headers: Steinberg Media Technologies, MIT licence. Wavelet filter coefficients generated with PyWavelets (MIT).</li>
<li>Thanks to Jeremi Palmigani (Saoul Machine), Flo (Go Tiger) and Arnaud Grignard for testing and review of the Wavelet Synthesizer.</li>
</ul>`;
}

// ---------------------------------------------------------------- pages
function manual(E) {
  const a = isA(E);
  const sections = [
    { id: 'intro', title: 'What this synthesizer is, and what wavelets are', html: introChapter(E), subs: [{ id: 'intro-wavelets', title: 'What is a wavelet?' }, { id: 'intro-seven', title: 'The seven wavelets' }, { id: 'intro-synth', title: 'How the synthesizer works' }, { id: 'intro-mod', title: 'Modulation' }, { id: 'intro-play', title: 'Playing it, and choosing sounds' }] },
    { id: 'quick', title: 'Quick start', html: quickStart(E) },
    { id: 'panel', title: 'The panel', html: panelChapter(E), subs: [{ id: 'header-controls', title: 'The header' }, { id: 'handling', title: 'Working with the controls' }] },
    { id: 'oscillators', title: 'Three oscillators', html: oscillatorsChapter(E), subs: [{ id: 'mix', title: 'OSC MIX and SUB OSC' }, { id: 'osc-card', title: 'Tune, own envelope, pitch envelope' }, { id: 'ideas', title: 'Ideas, and presets to study' }] },
    { id: 'tone', title: a ? 'The subtractive oscillators A1 · A2' : 'The additive oscillator B1', html: toneChapter(E), subs: [{ id: 'wavelets', title: 'The wavelet chooses the atom' }] },
    { id: 'filterpos', title: 'Scale filter and position window', html: filterChapter(E), subs: [{ id: 'filter', title: 'Scale filter' }, { id: 'position', title: 'Position window' }] },
    { id: 'env', title: 'Envelopes', html: envChapter(), subs: [{ id: 'amp-env', title: 'Amp envelope' }, { id: 'mod-env', title: 'Mod envelope' }] },
    { id: 'lfo', title: 'LFO 1, LFO 2 and LFO 3', html: lfoChapter(), subs: [{ id: 'lfo1', title: 'LFO 1' }, { id: 'lfo2', title: 'LFO 2 and LFO 3' }, { id: 'supermod', title: 'SuperModulation' }, { id: 'lfo-sync', title: 'Tempo sync' }] },
    { id: 'voicefx', title: 'Voice, filter and effects', html: voiceChapter(), subs: [{ id: 'voice', title: 'Voice' }, { id: 'flt', title: 'Filter' }, { id: 'effects', title: 'Effects' }] },
    { id: 'chord', title: 'Chord mode', html: chordChapter() },
    { id: 'oriental', title: 'Oriental keyboard', html: orientalChapter() },
    { id: 'presets', title: 'Presets', html: presetsChapter(E), subs: [{ id: 'saving', title: 'Saving your own sounds' }, { id: 'preset-list', title: 'All the presets' }] },
    { id: 'plugin', title: 'The plug-in', html: pluginChapter(), subs: [{ id: 'plugin-install', title: 'Installation' }, { id: 'vst-diff', title: 'What is specific to the plug-in' }] },
    { id: 'trouble', title: 'Troubleshooting', html: troubleChapter() },
    { id: 'more', title: 'More, and a glossary', html: moreChapter(), subs: [{ id: 'glossary', title: 'Glossary' }] },
    { id: 'about', title: 'About', html: aboutChapter() },
  ];
  return {
    engine: E, title: `Okto MultiWave Synth — Manual ${E.toUpperCase()}: ${a ? 'subtractive oscillators A1 A2' : 'additive oscillator B1'}`,
    description: `User manual of Okto MultiWave Synth, ${a ? 'the wavelet subtractive oscillators A1 and A2' : 'the wavelet additive oscillator B1'}: panel, controls, presets, chord mode.`,
    hero: hero(E), sections,
    footer: `<footer class="foot"><p>Okto MultiWave Synth ${SPEC.APP.version} · <a href="manual-${a ? 'b' : 'a'}.html">Manual ${a ? 'B' : 'A'}</a> · ${SPEC.APP.copyright} · GPL v3 or later</p></footer>`,
  };
}
module.exports = { manual };
