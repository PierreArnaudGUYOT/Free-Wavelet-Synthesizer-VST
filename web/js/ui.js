// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.7). Release beta 0.2.
// Panel UI built from WS_SPEC (same layout as the VST editor).
'use strict';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = n => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
const KB_LO = 36, KB_HI = 96;
const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hexRGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };   // '#ff7b4a' -> [255, 123, 74]
// A preset name: an optional number (the new presets, "012 ", "1000 "), the letters of its engine(s) or oscillators ("A", "AB", "A1B1"), " · ", its title
const splitName = (name) => { const m = /^(\d{3,4} )?((?:[AB][12]?)+) · (.*)$/.exec(name); return m ? { num: m[1] || '', eng: m[2], title: m[3] } : null; };
// the letters in their colours: A teal, B orange (the digits stay dim)
const engHTML = (eng) => eng.replace(/[AB]/g, c => `<span class="${c.toLowerCase()}">${c}</span>`).replace(/[12]/g, d => `<span class="d">${d}</span>`);
const SVGNS = 'http://www.w3.org/2000/svg';
// beta 0.6: where the free plug-in is published (the header's DOWNLOAD VST; index.html's welcome window links there too)
const VST_RELEASES = 'https://github.com/PierreArnaudGUYOT/Free-Wavelet-Synthesizer-VST/releases/latest';   // the official release page (version 1.0.3: the Free-Wavelet-Synthesizer-VST repository)
// version 1.0.9: the owner's feedback form (a Google Form: it opens without a Google account; the header's SEND FEEDBACK; index.html's welcome window links to the same address)
const FEEDBACK_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSdqkWNwanzcDDURcKepEK_U1P8b_HyR8B5_Gk48xtuQOYHqgQ/viewform';

function el(tag, cls, parent, style) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) Object.assign(e.style, style);
  if (parent) parent.appendChild(e);
  return e;
}
function svg(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
// angle 0 = 12 o'clock, clockwise
function arcPath(cx, cy, r, a0, a1) {
  if (Math.abs(a1 - a0) < 1e-4) return '';
  const x0 = cx + r * Math.sin(a0), y0 = cy - r * Math.cos(a0), x1 = cx + r * Math.sin(a1), y1 = cy - r * Math.cos(a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} ${sweep} ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

// Okto MultiWave Synth: a rounded rectangle path (the pads, the displays of the chord card)
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function pill(ctx, text, x, y, align, color) {
  ctx.font = '600 9.5px Segoe UI, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 8, x0 = align === 'right' ? x - w + 4 : x - 4;
  ctx.fillStyle = 'rgba(12,15,19,0.78)';
  ctx.fillRect(x0, y - 10, w, 14);
  ctx.fillStyle = color; ctx.textAlign = 'left';
  ctx.fillText(text, x0 + 4, y);
}

class SynthUI {
  constructor(device, SPEC, C, host) {
    this.dev = device; this.SPEC = SPEC; this.C = C; this.host = host;
    this.P = C.P; this.params = SPEC.PARAMS;
    this.byParam = new Map();   // param index -> [widget]
    this.canvases = [];
    this.sections = [];
    this.scale = 1;
    this.mode = 0; this.view = 0;   // the oscillator shown (A1 A2 B1) and its engine
    this.orient = false;            // beta 0.3.4: the oriental colour code (TUNING ARAB or TURK)
    this.orientMode = 0;            // version 1.0.5: 0 WEST, 1 ARAB (sand-gold), 2 TURK (carmine): the palette
    this.chordOn = false;           // CHORD MODE: the chord card is shown and the panel is taller
    this.live = null;
    this.tip = el('div', 'tip', document.body, { display: 'none' });
    this.atomCache = new Map();
    this.cycle = new Float64Array(C.N);
    this.mouseNotes = new Map();
    // beta 0.3: the preset browser at the right of the panel (as in the VST plug-in; here to select presets only).
    // "#nobrowser" in the address leaves it out (the manual's screenshots of the panel alone).
    this.browserOn = !/nobrowser/.test(location.hash);
    this.bOpen = this.browserOn;
    try { if (localStorage.getItem('mw.browser') === 'closed') this.bOpen = false; } catch (_) { /* storage unavailable */ }
    this.build();
    if (this.browserOn) this.makeBrowser();
    window.addEventListener('resize', () => this.fit());
    this.fit();
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ building
  build() {
    this.orientVars(this.dev);
    for (const s of this.SPEC.SECTIONS) {
      const card = s.title !== '';
      const se = el('div', 'section' + (card ? ' card' : '') + (s.vtitle ? ' vt' : '') + (s.tabbed ? ' tabbed' : ''), this.dev, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' });
      if (card) {
        const t = el('div', 'title', se);
        const parts = s.title.split(' · ');
        t.innerHTML = parts.length > 1 ? `<b>${parts[0]}</b> · ${parts.slice(1).join(' · ')}` : s.accentTitle ? `<b>${s.title}</b>` : s.title;   // beta 0.3.3: vtitle = a vertical strip at the left
      }
      se.dataset.sid = s.id;   // beta 0.3: addressable by the layout mock-ups (tools of the owner's review)
      this.sections.push({ spec: s, el: se });
      for (const w of s.widgets) this.makeWidget(w, se, s);
      this.sections[this.sections.length - 1].canvases = this.canvases.filter(c => c.sec === s);
    }
  }

  reg(param, widget) {
    if (param == null) return;
    const i = this.P[param];
    if (!this.byParam.has(i)) this.byParam.set(i, []);
    this.byParam.get(i).push(widget);
    // right-click: MIDI learn (link a knob or fader of a MIDI controller to this control)
    if (widget.el && this.host.midiLearn) widget.el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.host.midiLearn(i); });
  }

  // Shows the MIDI CC linked to each control in its tooltip. map: { cc: paramKey }
  setMidiMap(map) {
    const ccOf = {};
    for (const cc of Object.keys(map)) ccOf[map[cc]] = cc;
    for (const [i, list] of this.byParam) for (const w of list) {
      if (!w.el) continue;
      if (w.baseTitle === undefined) w.baseTitle = w.el.title || this.params[i].name;
      const cc = ccOf[this.params[i].key];
      w.el.title = w.baseTitle + (cc !== undefined ? ` — MIDI CC ${cc} (right-click to change)` : ' — right-click for MIDI learn');
    }
  }

  makeWidget(w, parent, sec) {
    // beta 0.6: the plug-in's tempo SYNC (buttons and note-value knobs) has no place here: the web app has no tempo. The
    // widgets they replace (`vis`) are therefore always shown: RATE in hertz, the delay TIME in seconds.
    if (w.only === 'vst') return;
    const box = el('div', 'w ' + w.type, parent, { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px' });
    const ab = { x: sec.x + w.x, y: sec.y + w.y, sec };
    // beta 0.2: a widget that shows only while a performance setting is on (BASS and the MAQAM / TONIC of the oriental tuning). The plug-in's
    // SYNC twins are not concerned: they keep the "always shown" rule above
    if (w.vis && this.params[this.P[w.vis]].perf) (this.visWidgets || (this.visWidgets = [])).push({ box, i: this.P[w.vis], on: !!w.visOn });
    switch (w.type) {
      case 'knobL': case 'knobM': case 'knobS': case 'knobT': return this.knob(w, box);
      case 'seg': return this.seg(w, box);
      case 'osctabs': return this.oscTabs(w, box, parent);   // beta 0.3: the folder tabs OSC1 | OSC2 | OSC3 and the frame of the oscillator cards
      case 'lfotabs': return this.lfoTabs(w, box);   // beta 0.3.4: the LFO 2 | LFO 3 tabs along the top of the LFO 2/3 card
      case 'step': return this.step(w, box);
      case 'menu': return this.menu(w, box);
      case 'drawbar': return this.drawbar(w, box);
      case 'logo': return this.logo(box);
      case 'presets': return this.presets(box);
      case 'manual': {   // beta 0.6: one button; version 1.0.6: the manual is one page
        const b = el('button', 'hbtn manual', box, { width: '100%', height: '100%' });
        b.innerHTML = 'USER<b>MANUAL</b>';
        b.onclick = () => this.host.openManual();
        this.manualBtn = b;
        return;
      }
      case 'download': {   // beta 0.6, web only: the plug-in's releases on GitHub
        const a = el('a', 'hbtn dl', box, { width: '100%', height: '100%' });
        a.href = VST_RELEASES; a.target = '_blank'; a.rel = 'noopener';
        a.innerHTML = 'DOWNLOAD<b>VST</b>';
        a.title = 'Download the free VST plug-in (Windows VST3 / VST2) from GitHub';
        return;
      }
      case 'feedback': {   // version 1.0.9, web only: the feedback form, in a new tab (no referrer sent)
        const a = el('a', 'hbtn fb', box, { width: '100%', height: '100%' });
        a.href = FEEDBACK_FORM; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.innerHTML = 'SEND<b>FEEDBACK</b>';
        a.title = 'Tell the developer what you think: a short form opens in a new tab (Google Forms, no account needed)';
        return;
      }
      case 'label': box.classList.add('wlabel'); el('span', '', box).textContent = w.text; return;   // (a span: the oriental PLAY card puts the caption on a plate)
      case 'toggle': return this.toggle(w, box);   // Okto MultiWave Synth: the web app shows toggles too (CHORD ON, BASS)
      case 'zoom': return;
      case 'credit': {
        // beta 0.7: "By OktoPierre · version · licence" at the bottom left, small and discreet as before beta 0.6
        const A = this.SPEC.APP;
        box.textContent = `${A.panelCredit} · ${A.version} · ${A.license}`;
        box.title = `${A.name} — ${A.copyright}. Free software under the GNU General Public License v3 or later, WITHOUT ANY WARRANTY (see the LICENSE file).` +
          (A.doi ? ` Cite: DOI ${A.doi} (https://doi.org/${A.doi}).` : '');
        return;
      }
      default: return this.canvasWidget(w, box, ab);
    }
  }

  // ------------------------------------------------------------------ knob
  knob(w, box) {
    const i = this.P[w.param], p = this.params[i];
    const big = w.type === 'knobL', small = w.type === 'knobS', tiny = w.type === 'knobT';
    const d = big ? 42 : small ? 30 : tiny ? 26 : 38, cx = w.w / 2, cy = big ? 22 : small ? 18 : tiny ? 15 : 20, r = d / 2;   // beta 0.3.4: the big knobs are 42 px discs (were 56)
    box.classList.add('knob');
    box.title = p.name;
    const s = svg('svg', { width: w.w, height: w.h }, box);
    const id = 'kg' + i + w.type;
    const defs = svg('defs', {}, s);
    // version 1.0.18 (the owner's choice, ClaudeProjects/maquettes_boutons_cuivre, "couleur 1, cuivre rosé"; the plug-in draws the same knob, vst/src/editor.cpp): the knob is the
    // picture img/bouton_cuivre_rose.png (knurled turned metal, a disc of radius 74.3 px in 156 px) with two soft shadows under it, lit from a fixed side (the picture does not
    // turn); the white dot (0.12 r, at 0.696 r from the centre) shows the value, with a small shadow above it. The ring and the value arc are those of before.
    const thin = small || tiny, A0 = -0.75 * Math.PI, A1 = 0.75 * Math.PI, ar = r + (thin ? 2 : 4), sw = thin ? 2.5 : 3;
    const f = svg('filter', { id: id + 's', x: '-60%', y: '-60%', width: '220%', height: '220%', 'color-interpolation-filters': 'sRGB' }, defs);
    [[2.2, 2.0, 0.35, 'b'], [0.8, 0.7, 0.55, 'a']].forEach(([dy, blur, op, k]) => {   // [vertical offset, blur, opacity]: a soft shadow and a tight contact shadow
      svg('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: blur, result: 'g' + k }, f);
      svg('feOffset', { in: 'g' + k, dx: 0, dy, result: 'o' + k }, f);
      svg('feFuncA', { type: 'linear', slope: op }, svg('feComponentTransfer', { in: 'o' + k, result: 's' + k }, f));
    });
    const fm = svg('feMerge', {}, f);
    for (const m of ['sb', 'sa', 'SourceGraphic']) svg('feMergeNode', { in: m }, fm);
    svg('path', { d: arcPath(cx, cy, ar, A0, A1), style: `stroke: rgba(255,255,255,0.18); stroke-width: ${sw}; fill: none; stroke-linecap: round` }, s);
    const val = svg('path', { d: '', style: `stroke: var(--accent); stroke-width: ${sw}; fill: none; stroke-linecap: round` }, s);
    const sz = r * 156 / 74.3;   // the picture is 2.0996 knob radii wide
    svg('image', { href: 'img/bouton_cuivre_rose.png', x: cx - sz / 2, y: cy - sz / 2, width: sz, height: sz }, svg('g', { filter: `url(#${id}s)` }, s));
    const dg = svg('radialGradient', { id: id + 'd', cx: '42%', cy: '38%', r: '62%' }, defs);
    for (const [o, c] of [['0%', '#ffffff'], ['60%', '#f3f1f0'], ['100%', '#cfcac8']]) svg('stop', { offset: o, style: 'stop-color: ' + c }, dg);
    const dotR = r * 0.12, dotD = r * 0.696;
    const dotSh = svg('circle', { r: dotR * 1.1, style: 'fill: rgba(35,12,6,0.55); stroke: none' }, s);
    const dot = svg('circle', { r: dotR, style: `fill: url(#${id}d); stroke: none` }, s);
    let label = null;
    if (!small) {
      label = el('div', 'label', box, { top: (big ? 48 : tiny ? 33 : 43) + 'px', fontSize: tiny ? '8.5px' : '' });
      label.textContent = p.short;
    }
    const bip = p.min < 0 && p.max > 0;
    const widget = {
      w, p, i, el: box,
      update: () => {
        const v = this.host.get(i), n = this.C.toNorm(p, v);
        const a = A0 + (A1 - A0) * n;
        const from = bip ? A0 + (A1 - A0) * this.C.toNorm(p, 0) : A0;
        val.setAttribute('d', arcPath(cx, cy, ar, Math.min(from, a), Math.max(from, a)));
        const dx = cx + dotD * Math.sin(a), dy = cy - dotD * Math.cos(a);
        dot.setAttribute('cx', dx.toFixed(2)); dot.setAttribute('cy', dy.toFixed(2));
        dotSh.setAttribute('cx', dx.toFixed(2)); dotSh.setAttribute('cy', (dy - dotR * 0.28).toFixed(2));
        if (label) {
          const showVal = widget.hover || widget.drag;
          // style 'value' (beta 0.6): the value is the label (a note value says more than "TIME")
          // style 'choice' (beta 0.3.4, the LFO SHAPE): a knob with a few positions, its choice (SINE TRI SAW SQR S&H) written under it in the accent colour
          const named = w.style === 'choice';
          label.textContent = named ? p.choiceShort[Math.round(v - p.min)] : showVal || w.style === 'value' ? this.C.format(p, v) : p.short;
          label.classList.toggle('value', named || !!showVal);
        }
        if (small && (widget.hover || widget.drag)) this.showTip(box, `${p.name}: <b>${this.C.format(p, v)}</b>`);
      },
    };
    this.dragBehaviour(box, widget, i, p, 180);
    this.reg(w.param, widget);
    widget.update();
  }

  // vertical drag, wheel and double-click shared by knobs and drawbars
  dragBehaviour(box, widget, i, p, range) {
    const stepped = p.curve === 'int' || p.curve === 'choice';
    // beta 0.3: a knob with few positions (SUB OCT, shapes) moves 24 px per step, and a click without moving steps to the
    // next value (round the end), so it never needs a long drag
    const few = stepped && p.max - p.min <= 4;
    if (few) range = 24 * (p.max - p.min);
    box.addEventListener('pointerenter', () => { widget.hover = true; widget.update(); });
    box.addEventListener('pointerleave', () => { widget.hover = false; if (!widget.drag) this.hideTip(); widget.update(); });
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { this.host.begin(i); this.host.set(i, p.def); this.host.end(i); return; }   // Ctrl+click = default
      box.setPointerCapture(e.pointerId);
      widget.drag = { y: e.clientY, n: this.C.toNorm(p, this.host.get(i)), shift: e.shiftKey, moved: false };
      box.classList.add('active');
      this.host.begin(i);
      widget.update();
    });
    box.addEventListener('pointermove', (e) => {
      if (!widget.drag) return;
      const dy = (e.clientY - widget.drag.y) / this.scale;
      if (Math.abs(dy) > 3) widget.drag.moved = true;
      const sens = e.shiftKey && !few ? range * 5 : range;
      let n = clamp(widget.drag.n - dy / sens, 0, 1);
      if (e.shiftKey !== widget.drag.shift) { widget.drag = { y: e.clientY, n: this.C.toNorm(p, this.host.get(i)), shift: e.shiftKey }; return; }
      const v = this.C.toPlain(p, n);
      if (v !== this.host.get(i)) this.host.set(i, v);
    });
    const end = (e) => {
      if (!widget.drag) return;
      if (few && !widget.drag.moved && e.type === 'pointerup') {   // a click: the next value
        const n = p.max - p.min + 1;
        this.host.set(i, ((Math.round(this.host.get(i)) - p.min + 1) % n) + p.min);
      }
      widget.drag = null;
      box.classList.remove('active');
      try { box.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
      this.host.end(i);
      if (!widget.hover) this.hideTip();
      widget.update();
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('dblclick', () => { this.host.begin(i); this.host.set(i, p.def); this.host.end(i); });
    box.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      const cur = this.host.get(i);
      let v;
      if (stepped) v = clamp(Math.round(cur) + dir, p.min, p.max);
      else v = this.C.toPlain(p, clamp(this.C.toNorm(p, cur) + dir * (e.shiftKey ? 0.002 : 0.01), 0, 1));
      this.host.begin(i); this.host.set(i, v); this.host.end(i);
    }, { passive: false });
  }

  // ------------------------------------------------------------------ selectors
  seg(w, box) {
    const i = this.P[w.param], p = this.params[i];
    box.classList.add('seg');
    if (w.style === 'engine') box.classList.add('engine');
    if (w.style === 'uline') box.classList.add('uline');   // beta 0.3.4: the LFO 1 wave selector, underlined
    // version 1.0.17 (the 20 new source waves): more than 8 choices show the first SEG_SHOWN and a last button MORE ▾ over a native list of the others
    const SEG_SHOWN = 6, more = p.choiceShort.length > 8 && !w.style;
    const btns = p.choiceShort.slice(0, more ? SEG_SHOWN : undefined).map((label, k) => {
      const b = el('button', '', box);
      b.textContent = label;
      b.title = p.name + ': ' + p.choices[k];
      b.onclick = () => { this.host.begin(i); this.host.set(i, k); this.host.end(i); };
      return b;
    });
    let moreBtn = null, moreLab = null, moreSel = null;
    if (more) {
      moreBtn = el('button', 'segmore', box);
      moreLab = el('span', '', moreBtn);
      moreSel = el('select', 'segmore-list', moreBtn);
      moreSel.title = p.name + ': the other waves';
      p.choices.forEach((c, k) => { if (k >= SEG_SHOWN) { const o = el('option', '', moreSel); o.value = k; o.textContent = c; } });
      moreSel.onchange = () => { const k = +moreSel.value; this.host.begin(i); this.host.set(i, k); this.host.end(i); };
    }
    const widget = { w, p, i, el: box, update: () => {
      const v = Math.round(this.host.get(i));
      btns.forEach((b, k) => b.classList.toggle('on', k === v));
      if (moreBtn) {
        const on = v >= SEG_SHOWN;
        moreBtn.classList.toggle('on', on);
        moreLab.textContent = (on ? p.choiceShort[v] : 'MORE') + ' ▾';
        if (on) moreSel.value = v; else moreSel.selectedIndex = -1;
      }
    } };
    this.reg(w.param, widget);
    widget.update();
  }

  showOsc(v) { const i = this.P.osc_view; this.host.begin(i); this.host.set(i, v); this.host.end(i); }

  // beta 0.3: the three folder tabs OSC1 | OSC2 | OSC3 above the cards of the oscillator shown, and the frame round those cards in the colour of its
  // engine. The frame is an L: OSC MIX and the SCOPE are common to every oscillator and sit outside it, at the top right. A lit dot says the oscillator is
  // heard (its level is above 0).
  oscTabs(w, box, sec) {
    const i = this.P[w.param], SL = this.SPEC.SLOTS, S = this.SPEC.SECTIONS, g = id => S.find(q => q.id === id);
    box.classList.add('osctabs');
    const me = g('oscframe'), tone = g('tone_' + SL[0].id), mix = g('mix'), flt = g('filter_' + SL[0].id);
    // the notch: half way between the tone card and OSC MIX, half way between the bottom of OSC MIX / SCOPE and the second row (section coordinates)
    const W = me.w, H = me.h, r = 12, x0 = 0.5, x1 = W - 0.5, y0 = 38.5, y1 = H - 0.5;
    const xn = (tone.x + tone.w + mix.x) / 2 - me.x, yn = (mix.y + mix.h + flt.y) / 2 - me.y;
    const NSVG = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NSVG, 'svg');
    svg.setAttribute('class', 'oscframe'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const path = document.createElementNS(NSVG, 'path');
    // Crépuscule: the outline is one shape, the folder tab of the oscillator shown and the plate, drawn flat: the accent colour, solid, and a 10 % tint inside (svg.oscframe in synth.css; the 1.0.5 "trail of light" gradients are gone)
    const outline = v => {
      const tabL = Math.max(v * 182, x0), tabR = v * 182 + 176, tt = 0.5, rt = 9;
      return 'M' + x0 + ',' + y0 + ' ' + (tabL > x0 + 0.5 ? 'H' + tabL + ' ' : '') + 'V' + (tt + rt) + ' Q' + tabL + ',' + tt + ' ' + (tabL + rt) + ',' + tt + ' H' + (tabR - rt) + ' Q' + tabR + ',' + tt + ' ' + tabR + ',' + (tt + rt) + ' V' + y0 +
        ' H' + (xn - r) + ' Q' + xn + ',' + y0 + ' ' + xn + ',' + (y0 + r) + ' V' + (yn - r) + ' Q' + xn + ',' + yn + ' ' + (xn + r) + ',' + yn + ' H' + (x1 - r) + ' Q' + x1 + ',' + yn + ' ' + x1 + ',' + (yn + r) +
        ' V' + (y1 - r) + ' Q' + x1 + ',' + y1 + ' ' + (x1 - r) + ',' + y1 + ' H' + (x0 + r) + ' Q' + x0 + ',' + y1 + ' ' + x0 + ',' + (y1 - r) + ' Z';
    };
    svg.appendChild(path);
    sec.insertBefore(svg, sec.firstChild);
    const SLOTS_ = SL;
    this.outlinePaint = () => { path.setAttribute('d', outline(Math.round(this.host.get(i)))); };
    const tabs = SL.map((sl, s) => {
      const b = el('button', 'otab ' + (sl.mode === 0 ? 'ea' : 'eb'), box);
      b.style.left = (s * 182) + 'px';
      el('span', 'dot', b);
      el('span', 'tx', b).innerHTML = '<span class="t1">OSC' + (s + 1) + '</span><span class="t2">' + (sl.mode === 0 ? 'SUBTRACTIVE' : 'ADDITIVE') + '</span>';   // version 1.0.12: "OSC1" (it read "OSC1 A1")
      b.title = 'Show the oscillator ' + sl.name + ' (a lit dot: it is heard, its level in OSC MIX is above 0)';
      b.onclick = () => this.showOsc(s);
      return { b, s, sl };
    });
    const update = () => {
      const v = Math.round(this.host.get(i));
      for (const t of tabs) {
        t.b.classList.toggle('on', t.s === v);
        t.b.classList.toggle('heard', this.host.get(t.sl.k.lvl) > 0);
      }
      this.outlinePaint();
    };
    const widget = { w, p: this.params[i], i, el: box, update };
    this.reg(w.param, widget);
    for (const sl of SL) {   // the dots follow the levels
      if (!this.byParam.has(sl.k.lvl)) this.byParam.set(sl.k.lvl, []);
      this.byParam.get(sl.k.lvl).push({ update });
    }
    update();
  }

  // beta 0.3.4: the LFO 2 | LFO 3 tabs along the top of the LFO 2/3 card (the parameter lfo_view; the card of the LFO shown is the one visible): the tab of the LFO shown is
  // filled with the accent colour, a lit dot says the LFO is heard (its amount is not 0). The bar also holds the plug-in's SYNC button (not in the web app: no tempo here).
  lfoTabs(w, box) {
    const i = this.P[w.param], amts = [this.P.lfo2_amt, this.P.lfo3_amt];
    box.classList.add('lfotabs');
    el('div', 'tabbar', box);
    const tabs = [0, 1].map(k => {
      const b = el('button', 'ltab', box, { left: (6 + k * 60) + 'px' });
      el('span', 'dot', b);
      el('span', 'tx', b).innerHTML = '<span class="t1">LFO ' + (k + 2) + '</span>';
      b.title = 'Show LFO ' + (k + 2) + ' (a lit dot: its amount is not 0)';
      b.onclick = () => { this.host.begin(i); this.host.set(i, k); this.host.end(i); };
      return b;
    });
    const update = () => {
      const v = Math.round(this.host.get(i));
      tabs.forEach((b, k) => { b.classList.toggle('on', k === v); b.classList.toggle('heard', Math.abs(this.host.get(amts[k])) > 0.001); });
    };
    const widget = { w, p: this.params[i], i, el: box, update };
    this.reg(w.param, widget);
    for (const a of amts) { if (!this.byParam.has(a)) this.byParam.set(a, []); this.byParam.get(a).push({ update }); }   // the dots follow the amounts
    update();
  }

  step(w, box) {
    const i = this.P[w.param], p = this.params[i];
    box.classList.add('step');
    const prev = el('button', '', box); prev.textContent = '◀'; prev.title = 'Previous ' + p.name.toLowerCase();
    const name = el('div', 'name', box);
    const next = el('button', '', box); next.textContent = '▶'; next.title = 'Next ' + p.name.toLowerCase();
    const go = d => {
      const n = p.max - p.min + 1;
      const v = ((Math.round(this.host.get(i)) - p.min + d) % n + n) % n + p.min;
      this.host.begin(i); this.host.set(i, v); this.host.end(i);
    };
    prev.onclick = () => go(-1); next.onclick = () => go(1); name.onclick = () => go(1);
    name.title = p.name + ' (click to cycle)';
    const narrow = w.w < 200;
    const widget = { w, p, i, el: box, update: () => { const v = Math.round(this.host.get(i)); name.innerHTML = (narrow ? '' : `<small>${p.short}</small>`) + p.choices[v]; } };
    this.reg(w.param, widget);
    widget.update();
  }

  // beta 0.3: a choice parameter as a small drop-down menu (LFO 2 TARGET): the current choice and ▾; click opens the list
  menu(w, box) {
    const i = this.P[w.param], p = this.params[i];
    box.classList.add('menu');
    box.title = p.name;
    if (w.text) el('span', '', el('div', 'mcap', box)).textContent = w.text;   // beta 0.6: its caption above it (a span: the oriental PLAY card puts it on a plate)
    const btn = el('button', '', box);
    const set = (k) => { this.host.begin(i); this.host.set(i, k); this.host.end(i); };
    const close = () => { if (this.mpop) { this.mpop.remove(); this.mpop = null; } };
    btn.onclick = (e) => {
      e.stopPropagation();
      if (this.mpop) { close(); return; }
      const pop = el('div', 'mpop', box);
      const cur = Math.round(this.host.get(i));
      p.choices.forEach((c, k) => {
        const it = el('div', 'it' + (k === cur ? ' cur' : ''), pop);
        it.textContent = c;
        it.onclick = (ev) => { ev.stopPropagation(); set(k); close(); };
      });
      this.mpop = pop;
    };
    if (!this.menuCloser) {
      this.menuCloser = true;
      document.addEventListener('pointerdown', (e) => { if (this.mpop && !this.mpop.parentNode.contains(e.target)) { this.mpop.remove(); this.mpop = null; } });
    }
    box.addEventListener('wheel', (e) => {
      e.preventDefault();
      set(clamp(Math.round(this.host.get(i)) + (e.deltaY < 0 ? -1 : 1), p.min, p.max));
    }, { passive: false });
    // (beta 0.3.4: the TARGET menu is only 80 px wide: a name that does not fit is cut with an ellipsis)
    const widget = { w, p, i, el: box, update: () => { btn.innerHTML = `<i>${p.choiceShort[Math.round(this.host.get(i))]}</i><span>▾</span>`; } };
    this.reg(w.param, widget);
    widget.update();
  }

  drawbar(w, box) {
    const i = this.P[w.param], p = this.params[i];
    box.classList.add('drawbar');
    box.title = p.name;
    const track = el('div', 'track', box);
    const fill = el('div', 'fill', track);
    const cap = el('div', 'cap', box);
    const num = el('div', 'num', box);
    num.textContent = p.short;
    const widget = {
      w, p, i, el: box,
      update: () => {
        const v = this.host.get(i);
        fill.style.height = (v * 100) + '%';
        cap.style.top = ((1 - v) * (w.h - 10)) + 'px';
        if (widget.hover || widget.drag) this.showTip(box, `Band ${p.short} level: <b>${Math.round(v * 100)}%</b>`);
      },
    };
    this.dragBehaviour(box, widget, i, p, 120);
    this.reg(w.param, widget);
    widget.update();
  }

  logo(box) {
    box.classList.add('logo');
    const mark = el('div', 'mark', box);
    mark.innerHTML = '<svg viewBox="0 0 32 32" width="24" height="24"><path d="M3 16h5l3-9 4 18 4-13 3 7h7" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    const t = el('div', 'txt', box);
    t.innerHTML = '<b>OKTOWAVE</b><span>FRACTAL WAVELET SYNTHESIZER</span>';   // version 1.0 (the product's name in the header)
  }

  presets(box) {
    box.classList.add('presets');
    const prev = el('button', 'arrow', box); prev.textContent = '◀'; prev.title = 'Previous preset';
    const name = el('div', 'pname', box);
    const next = el('button', 'arrow', box); next.textContent = '▶'; next.title = 'Next preset';
    prev.onclick = () => this.host.presetStep(-1);
    next.onclick = () => this.host.presetStep(1);
    // the name opens the preset browser when it is hidden, else the classic menu
    name.onclick = (e) => { e.stopPropagation(); if (this.browser && !this.bOpen) this.setBrowser(true); else this.togglePresetMenu(box); };
    this.presetNameEl = name;
    document.addEventListener('pointerdown', (e) => { if (this.pmenu && !this.pmenu.contains(e.target)) this.closePresetMenu(); });
  }
  setPresetName(nm, dirty) {
    if (this.presetNameEl) this.presetNameEl.innerHTML = `<span>${nm.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>${dirty ? '<span class="dirty" title="Modified">•</span>' : ''}<span class="chev">▼</span>`;
    if (this.browser) {
      // beta 0.2: a new sound (the preset box, its arrows, a MIDI program change, the demo) shows its bank in the browser, so that the
      // sound selected is always seen there; a knob moved on the same sound leaves the bank the player is looking at
      const cur = this.host.presetList().find(x => x.current), id = cur ? cur.id : null;
      if (id !== this.bShown) { this.bShown = id; this.bReveal(); }
      this.renderBrowser();   // the sound playing is highlighted there
    }
  }
  togglePresetMenu(box) {
    if (this.pmenu) { this.closePresetMenu(); return; }
    const m = el('div', 'pmenu', box);
    const list = this.host.presetList();
    // Groups fold like the banks of a hardware synth: favourites, user presets and the group of the current preset
    // start open; a click on a group title opens or closes it (remembered while the page is open).
    const cur = list.find(x => x.current);
    if (!this.openGroups) this.openGroups = new Set(['★ TOP SOUNDS', 'USER PRESETS']);
    if (cur) this.openGroups.add(cur.group);
    const counts = {};
    for (const x of list) counts[x.group] = (counts[x.group] || 0) + 1;
    let grp = null, body = m;
    list.forEach(item => {
      if (item.group !== grp) {
        grp = item.group;
        const g = grp, open = this.openGroups.has(g);
        const h = el('div', 'grp fold' + (open ? ' open' : ''), m);
        h.innerHTML = `<span class="tw">${open ? '▾' : '▸'}</span>${g.replace(/&/g, '&amp;')}<span class="cnt">${counts[g]}</span>`;
        body = el('div', 'gbody', m);
        if (!open) body.style.display = 'none';
        const b = body;
        h.onclick = (e) => {
          e.stopPropagation();
          const nowOpen = b.style.display === 'none';
          b.style.display = nowOpen ? '' : 'none';
          h.classList.toggle('open', nowOpen);
          h.firstChild.textContent = nowOpen ? '▾' : '▸';
          if (nowOpen) this.openGroups.add(g); else this.openGroups.delete(g);
        };
      }
      const it = el('div', 'it' + (item.current ? ' cur' : ''), body);
      const n = el('span', '', it);
      const mm = splitName(item.name);   // the number (new presets), the engine letters in their colours (AB = both engines mixed)
      if (mm) {
        if (mm.num) n.appendChild(document.createTextNode(mm.num));
        const e = el('b', 'eng', n);
        e.innerHTML = engHTML(mm.eng);
        n.appendChild(document.createTextNode(' · ' + mm.title));
      } else n.textContent = item.name;
      if (item.deletable) {
        const d = el('span', 'del', it); d.textContent = '✕'; d.title = 'Delete user preset';
        d.onclick = (e) => { e.stopPropagation(); this.host.deletePreset(item.id); this.closePresetMenu(); };
      }
      it.onclick = () => { this.host.loadPreset(item.id); this.closePresetMenu(); };
    });
    this.pmenu = m;
    const c = m.querySelector('.it.cur');
    if (c && c.offsetTop + c.offsetHeight > m.clientHeight) m.scrollTop = c.offsetTop - m.clientHeight / 2;   // bring the current preset into view
  }
  closePresetMenu() { if (this.pmenu) { this.pmenu.remove(); this.pmenu = null; } }

  // ------------------------------------------------------------------ canvases
  canvasWidget(w, box, ab) {
    const screen = ['scope', 'scalogram', 'atom', 'source', 'window', 'adsr'].includes(w.type);
    if (screen) box.classList.add('screen');
    const cv = el('canvas', 'disp', box);
    const c = { w, box, cv, ctx: cv.getContext('2d'), ab, sec: ab.sec, dirty: true };
    this.canvases.push(c);
    if (w.type === 'keyboard') this.keyboardInput(c);
    if (w.type === 'wheels') this.wheelInput(c);
    if (w.type === 'chordpads') this.padsInput(c);     // Okto MultiWave Synth
    if (w.type === 'strumplate') this.plateInput(c);
  }

  sizeCanvases() {
    const pr = (window.devicePixelRatio || 1) * this.scale;
    for (const c of this.canvases) {
      const W = Math.round(c.w.w * pr), H = Math.round(c.w.h * pr);
      if (c.cv.width !== W || c.cv.height !== H) {
        c.cv.width = W; c.cv.height = H;
        c.cv.style.width = c.w.w + 'px'; c.cv.style.height = c.w.h + 'px';
      }
      c.pr = pr; c.dirty = true;
    }
  }

  fit() {
    const stage = this.dev.parentElement;
    const DH = this.SPEC.DEVICE.h + (this.chordOn ? this.SPEC.CHORD_H : 0);   // CHORD MODE adds the chord card
    const W = 1100 + (this.browser && this.bOpen ? 360 : 0);   // the panel, and the preset browser at its right
    const aw = stage.clientWidth - 24, ah = stage.clientHeight - 24;
    const s = clamp(Math.min(aw / W, ah / DH), 0.45, 2.5);
    this.scale = s;
    const left = Math.max(0, (stage.clientWidth - W * s) / 2), top = Math.max(0, (stage.clientHeight - DH * s) / 2);
    this.dev.style.height = DH + 'px';
    this.dev.style.transform = `scale(${s})`;
    this.dev.style.left = left + 'px';
    this.dev.style.top = top + 'px';
    if (this.browser) {
      this.browser.style.display = this.bOpen ? '' : 'none';
      this.browser.style.transform = `scale(${s})`;
      this.browser.style.left = (left + 1104 * s) + 'px';
      this.browser.style.top = (top + 8 * s) + 'px';
    }
    this.sizeCanvases();
  }

  // ---------------------------------------------------------------- preset browser (beta 0.3)
  // Same layout as the VST plug-in's: FACTORY / USER PRESETS tabs, the sound types with their number of sounds (beta 0.5:
  // TOP Sounds = OktoPierre's selection, the first presets; then the categories, each in his order — Source Phase last
  // since beta 0.7),
  // and the sounds of the type selected; one click plays a sound, the arrow keys too (↑ ↓ sounds, ← → categories).
  // Selection only: saving stays in the status bar (Save preset / Export / Import).
  bLists() {
    const S = this.SPEC, P = S.PRESETS;
    const lists = [{ label: 'TOP Sounds', presets: S.TOP_LIST.slice() }];   // (version 1.0.3: the list of the plug-in, the best first)
    for (const c of S.CATEGORIES) {
      const l = [];
      for (let k = 0; k < P.length; k++) if (P[k].cat === c) l.push(k);
      l.sort((a, b) => P[a].rank - P[b].rank);
      lists.push({ label: c, presets: l });
    }
    return lists;
  }
  // beta 0.5: an arrow key while the browser is open ('up' / 'down' play the sound above / below, 'left' / 'right' show the
  // category above / below); true when used
  browserKey(dir) {
    if (!this.bOpen || !this.browser) return false;
    const lists = this.bLists();
    if (dir === 'left' || dir === 'right') {
      const n = this.bTab === 0 ? lists.length : 1;
      this.bCat = Math.max(0, Math.min(n - 1, this.bCat + (dir === 'left' ? -1 : 1)));
      this.renderBrowser();
      return true;
    }
    const all = this.host.presetList(), cur = all.find(x => x.current);
    const ids = this.bTab === 0 ? (lists[this.bCat] || lists[0]).presets.map(k => 'f:' + k) : all.filter(x => x.id.startsWith('u:')).map(x => x.id);
    if (!ids.length) return true;
    const at = cur ? ids.indexOf(cur.id) : -1;
    const to = at < 0 ? (dir === 'down' ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, at + (dir === 'down' ? 1 : -1)));
    if (to !== at) this.host.loadPreset(ids[to]);
    return true;
  }
  makeBrowser() {
    const b = el('div', 'browser', this.dev.parentElement);
    b.id = 'browser';
    b.innerHTML = '<div class="bhead"><span class="btitle">PRESET BROWSER</span><button class="bhide" title="Hide the preset browser ' +
      '(a click on the preset name brings it back)">HIDE ▸</button></div><div class="btabs"><button data-t="0"></button><button data-t="1"></button></div>' +
      '<div class="bcols"><div class="bcats"></div><div class="bright"><div class="bhd"></div><div class="blist"></div></div></div><div class="bstatus"></div>';
    this.browser = b;
    this.orientVars(b);   // beta 0.3.4: the oriental colour code reaches the browser too
    this.bTab = 0; this.bCat = 0;
    b.querySelector('.bhide').onclick = () => this.setBrowser(false);
    b.querySelectorAll('.btabs button').forEach(t => { t.onclick = () => { this.bTab = +t.dataset.t; this.bCat = 0; if (this.bTab === 0) this.bReveal(); this.renderBrowser(); }; });
    this.bReveal();
    this.renderBrowser();
  }
  setBrowser(open) {
    this.bOpen = open;
    try { localStorage.setItem('mw.browser', open ? 'open' : 'closed'); } catch (_) { /* storage unavailable */ }
    if (open) { this.bReveal(); this.renderBrowser(); }
    this.fit();
  }
  // the category of the sound playing (TOP Sounds when it is there and already shown)
  bReveal() {
    const cur = this.host.presetList().find(x => x.current);
    if (!cur) return;
    if (cur.id.startsWith('u:')) { this.bTab = 1; this.bCat = 0; return; }
    const k = +cur.id.slice(2), lists = this.bLists();
    this.bTab = 0;
    if (lists[this.bCat] && lists[this.bCat].presets.includes(k)) return;
    const c = lists.findIndex((l, i) => i > 0 && l.presets.includes(k));
    if (c >= 0) this.bCat = c;
  }
  renderBrowser() {
    const b = this.browser;
    if (!b) return;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const all = this.host.presetList(), user = all.filter(x => x.id.startsWith('u:')), cur = all.find(x => x.current);
    const lists = this.bLists(), P = this.SPEC.PRESETS;
    const tabs = b.querySelectorAll('.btabs button');
    tabs[0].textContent = `FACTORY  ${P.length}`; tabs[1].textContent = `USER PRESETS  ${user.length}`;
    tabs.forEach((t, i) => t.classList.toggle('on', i === this.bTab));
    const cats = b.querySelector('.bcats');
    cats.innerHTML = '';
    const rows = this.bTab === 0 ? lists.map(l => [l.label, l.presets.length]) : [['My presets', user.length]];
    rows.forEach(([label, n], i) => {
      const r = el('div', 'bcat' + (i === this.bCat ? ' sel' : '') + (n ? '' : ' empty'), cats);
      r.innerHTML = `<span>${esc(label)}</span><span class="n">${n}</span>`;
      r.onclick = () => { this.bCat = i; this.renderBrowser(); };
    });
    const items = this.bTab === 0
      ? (lists[this.bCat] || lists[0]).presets.map(k => ({ id: 'f:' + k, name: P[k].name, fav: this.bCat !== 0 && this.SPEC.TOP_LIST.includes(k), stars: P[k].stars || 0 }))   // (the TOP Sounds mark is not repeated in the TOP Sounds list itself)
      : user.map(x => ({ id: x.id, name: x.name, fav: false, stars: 0 }));
    b.querySelector('.bhd').textContent = `${(this.bTab === 0 ? (lists[this.bCat] || lists[0]).label : 'My presets').toUpperCase()}  ·  ${items.length}`;
    const list = b.querySelector('.blist');
    list.innerHTML = '';
    if (!items.length) el('div', 'bnone', list).textContent = 'No user presets yet: “Save preset” in the status bar keeps the sound you hear.';
    let curRow = null;
    for (const it of items) {
      const r = el('div', 'bsnd' + (cur && cur.id === it.id ? ' cur' : ''), list);
      const m = splitName(it.name);
      const eng = m ? `${esc(m.num)}<span class="eng">${engHTML(m.eng)} · </span>` : '';
      const mark = (it.fav ? '<span class="mk" title="In TOP Sounds, OktoPierre’s selection">★</span>' : '')
        + (it.stars ? `<span class="rate" title="OktoPierre’s rating: ${it.stars} / 10 (shown, not editable)" style="--r:${it.stars * 10}%">★★★★★</span>` : '');   // (version 1.0.3: his stars, 1 to 10 as five stars with half stars, read only)
      r.innerHTML = `${eng}<span class="nm">${esc(m ? m.title : it.name)}</span>${mark}`;
      r.title = it.name;
      r.onclick = () => this.host.loadPreset(it.id);
      if (cur && cur.id === it.id) curRow = r;
    }
    if (curRow) curRow.scrollIntoView({ block: 'nearest' });
    b.querySelector('.bstatus').textContent = this.bTab === 0 ? `${P.length} factory presets · one click plays a sound`
      : `${user.length} user preset(s) · Save preset / Export / Import in the status bar`;
  }

  showTip(anchor, html) {
    const r = anchor.getBoundingClientRect();
    this.tip.innerHTML = html;
    this.tip.style.display = 'block';
    const tw = this.tip.offsetWidth;
    this.tip.style.left = clamp(r.left + r.width / 2 - tw / 2, 4, window.innerWidth - tw - 4) + 'px';
    this.tip.style.top = Math.max(4, r.top - 30) + 'px';
  }
  hideTip() { this.tip.style.display = 'none'; }

  // ------------------------------------------------------------------ state from app
  // Version 1.0.7 (CPU review 7.3): a parameter change used to mark all the canvases dirty, so a knob dragged redrew the keyboard, the wheels, the voice LEDs ... at every frame. The displays of the
  // sound (scope, scalogram, atom, source, window, envelopes) still follow any parameter; the others only the few they read, and the oscillator shown / the tuning, which change their colour
  // (accent()). A type that is not listed here follows every parameter.
  canvasDeps() {
    if (this._canvasDeps) return this._canvasDeps;
    const P = this.P, col = [P.osc_view, P.mt_mode], chord = [P.chord_mode, P.chord_type, P.chord_oct, ...col];
    const d = { keyboard: [P.chord_mode, P.chord_oct, P.mt_scale, P.mt_tonic, ...col], wheels: [P.bend, P.modwheel, ...col], leds: [P.v_voices, ...col],
      chordpads: chord, chordname: chord, strumplate: chord, meter: [], fxheads: [] };
    for (const k in d) d[k] = new Set(d[k]);
    return (this._canvasDeps = d);
  }
  refresh(i) {
    const ws = this.byParam.get(i);
    if (ws) for (const w of ws) w.update();
    if (i === this.P.osc_view) this.setView(Math.round(this.host.get(i)));
    if (i === this.P.lfo_view) for (const sc of this.sections) sc.el.classList.toggle('hidden', this.secHidden(sc.spec));   // beta 0.3: LFO 2 | LFO 3
    if (i === this.P.mt_mode) this.updateOrient();   // beta 0.3.4: the oriental colour code
    if (i === this.P.chord_mode) { this.chordOn = this.host.get(i) >= 0.5; this.setView(this.view); this.fit(); }
    this.applyWidgetVis(i);
    this.updateEnables();
    const deps = this.canvasDeps();
    for (const c of this.canvases) { const d = deps[c.w.type]; if (!d || d.has(i)) c.dirty = true; }
  }
  refreshAll() {
    for (const [, ws] of this.byParam) for (const w of ws) w.update();
    this.chordOn = this.host.get(this.P.chord_mode) >= 0.5;
    this.updateOrient();
    this.setView(Math.round(this.host.get(this.P.osc_view)));
    this.applyWidgetVis();
    this.fit();
    this.updateEnables();
    for (const c of this.canvases) c.dirty = true;
  }
  // the widgets that depend on a performance setting (only the ones of parameter i when given)
  applyWidgetVis(i) {
    for (const x of this.visWidgets || []) if (i === undefined || x.i === i) x.box.style.display = (this.host.get(x.i) >= 0.5) === x.on ? '' : 'none';
  }
  // the oscillator shown (0..2 = A1 A2 B1): the cards of the other oscillators and a hidden chord card are not shown
  setView(v) {
    const m = this.SPEC.SLOTS[v].mode;
    this.view = v; this.mode = m;
    this.dev.classList.toggle('mode-a', m === 0);
    this.dev.classList.toggle('mode-b', m === 1);
    if (this.browser) this.browser.classList.toggle('mode-b', m === 1);
    for (const s of this.sections) s.el.classList.toggle('hidden', this.secHidden(s.spec));
  }
  secHidden(spec) {
    if (spec.view >= 0 && spec.view !== this.view) return true;
    return !!spec.vis && (this.host.get(this.P[spec.vis]) >= 0.5) !== !!spec.visOn;
  }
  updateEnables() {
    const P = this.P;
    const set = (i, on) => { const ws = this.byParam.get(i); if (ws) ws.forEach(w => w.el && w.el.classList.toggle('disabled', !on)); };
    for (const sl of this.SPEC.SLOTS) {   // the source width only means something for PULSE and TRIANGLE, the seed for RANDOM
      if (sl.mode === 0) { const wave = Math.round(this.host.get(sl.k.wave)); set(sl.k.width, wave === 2 || wave === 3); }
      else set(sl.k.seed, Math.round(this.host.get(sl.k.pattern)) === 5);
    }
  }
  // The live data arrives about 30 times a second. liveVer changes only when something the canvases show has changed: the animated
  // canvases are drawn again then (and at least twice a second, in case a state they show changed without it), not on every frame.
  setLive(d) {
    this.live = d;
    const sig = d.note + '|' + d.voices + '|' + d.slotLive + '|' + d.view + '|' + d.peakL.toFixed(4) + '|' + d.peakR.toFixed(4) + '|' + d.center + '|' + d.width + '|' + d.depth + '|' +
      d.keys.join(',') + '|' + (d.chord ? d.chord.root + ',' + d.chord.last + ',' + d.chord.notes.join(',') : '') + '|' + (d.slotLive ? d.gains.join(',') : '') +
      '|' + (d.mask ? d.mask + ',' + d.sg.join(',') + ',' + d.swin.join(',') : '');   // beta 0.3.1: the scope and the scalogram follow the live gains of every oscillator
    if (sig !== this.liveSig) { this.liveSig = sig; this.liveVer = (this.liveVer || 0) + 1; }
  }

  // ------------------------------------------------------------------ demo support
  // Highlights the controls of the parameters being animated by the demo.
  setHot(ids) {
    for (const e of this.hotEls || []) e.classList.remove('hot');
    this.hotEls = [];
    for (const id of ids) for (const w of this.byParam.get(id) || []) if (w.el) { w.el.classList.add('hot'); this.hotEls.push(w.el); }
  }
  // The DEMO button: ▶ DEMO plays the demo (Beethoven's Appassionata, a tour of the presets), ■ STOP while it runs.
  // d = { running, stop, play }
  makeDemoButton(d) {
    const b = el('button', 'hbtn demo-btn', this.dev);
    b.innerHTML = '&#9654; DEMO';
    b.title = 'Play the demo: Beethoven, Appassionata (III), with a tour of all the presets (a new preset about every 4 s, on a change of chord)';
    b.onclick = (e) => {
      e.stopPropagation();
      if (d.running()) d.stop(); else d.play();
    };
    this.demoBtn = b;
  }
  setDemoRunning(on) {
    if (!this.demoBtn) return;
    this.demoBtn.classList.toggle('running', on);
    this.demoBtn.innerHTML = on ? '&#9632; STOP' : '&#9654; DEMO';
  }
  // beta 0.3: the tables of the oscillator shown (atom, source, window displays) and the raw layers of every oscillator that plays (the scope and the scalogram)
  setTables(tb) { this.tables = tb; this.scope = this.C.buildScopeSets(this.host.values(), tb); for (const c of this.canvases) c.dirty = true; }

  // ------------------------------------------------------------------ drawing
  frame() {
    const now = performance.now();
    for (const c of this.canvases) {
      if (c.sec && this.secHidden(c.sec)) { c.dirty = true; continue; }
      const t = c.w.type;
      const animated = t === 'scope' || t === 'scalogram' || t === 'meter' || t === 'leds' || t === 'keyboard' || t === 'window' ||
        t === 'chordname' || t === 'strumplate';   // Okto MultiWave Synth: they show the chord sounding
      // an animated canvas: when the live data changed, while the meter falls back, and every half second anyway
      const moving = animated && (c.liveVer !== this.liveVer || (t === 'meter' && (this.mL > 1e-4 || this.mR > 1e-4)) || !(now - (c.drawn || 0) < 500));
      if (!c.dirty && !moving) continue;
      c.dirty = false; c.liveVer = this.liveVer; c.drawn = now;
      const ctx = c.ctx;
      ctx.setTransform(c.pr, 0, 0, c.pr, 0, 0);
      ctx.clearRect(0, 0, c.w.w, c.w.h);
      const fn = this['draw_' + t];
      if (fn) fn.call(this, ctx, c.w.w, c.w.h, c);
    }
  }

  // beta 0.3: A1 A2 yellow, B1 blue. Beta 0.3.4: while the TUNING switch is ARAB or TURK, the oriental colour code (ORIENT in tools/spec.js): terracotta / turquoise
  accentFor(mode) { return this.orient ? (mode === 0 ? this.orientPal().a : this.orientPal().b) : mode === 0 ? '#ffd166' : '#7ae7ff'; }   // Crépuscule: gold for A1 A2, cyan for B1 (the same as --accent-a / --accent-b in synth.css)
  accent() { return this.accentFor(this.mode); }
  accentRGB() { return hexRGB(this.accentFor(this.mode)); }
  // version 1.0.5: the palette of the tuning on (ARAB sand-gold, TURK carmine), with the tile and the opacity of the pattern
  orientPal() { const O = this.SPEC.ORIENT; return Object.assign({ tile: O.tile, opacity: O.opacity }, this.orientMode === 2 ? O.turk : O.arab); }

  // ------------------------------------------------------------------ the oriental colour code (beta 0.3.4)
  // the palette of ORIENT as CSS variables (the stylesheet's #device.orient rules use them) on the panel and on the preset browser
  orientVars(e) {
    const O = this.orientPal(), set = (k, v) => e.style.setProperty(k, v);
    set('--or-a', O.a); set('--or-b', O.b); set('--or-c1', O.c1); set('--or-c2', O.c2); set('--or-c3', O.c3); set('--or-c4', O.c4); set('--or-c5', O.c5);
    set('--or-pl0', O.pl[0]); set('--or-pl1', O.pl[1]); set('--or-dim', O.dim);
    O.g.forEach((c, i) => set('--or-g' + i, c)); O.glow.forEach((c, i) => set('--or-glow' + (i + 1), c)); set('--or-page', O.page);   // version 1.0.9: the panel in the colours of the pattern
    for (const k of ['a', 'b']) { const c = hexRGB(O[k]); set('--or-' + k + '-soft', `rgba(${c},0.16)`); set('--or-' + k + '-tint', `rgba(${c},0.07)`); set('--or-' + k + '-line', `rgba(${c},0.26)`); }
    set('--or-c2-line', `rgba(${hexRGB(O.c2)},0.25)`); set('--or-glow', `rgba(${hexRGB(O.a)},0.16)`); set('--or-c4-86', `rgba(${hexRGB(O.c4)},0.86)`);
  }
  updateOrient() {
    const mode = Math.round(this.host.get(this.P.mt_mode)), on = mode !== 0;
    if (on === this.orient && mode === this.orientMode) return;
    this.orient = on; this.orientMode = mode;
    this.dev.classList.toggle('orient', on);
    if (this.browser) this.browser.classList.toggle('orient', on);
    document.documentElement.classList.toggle('orient', on); document.body.classList.toggle('orient', on);   // version 1.0.9: the page's margins show the pattern
    if (on) {   // version 1.0.5: ARAB and TURK have their own colours: the variables and the pattern follow the mode
      this.orientVars(this.dev); if (this.browser) this.orientVars(this.browser);
      this.orientVars(document.documentElement); this.orientPage();
    }
    if (this.outlinePaint) this.outlinePaint();
    for (const c of this.canvases) c.dirty = true;
  }
  // the PLAY card's pattern: octagons and squares (4.8.8), an eight-pointed star in each octagon, one SVG tile of ORIENT.tile px; the octagons are centred on the card's inner
  // top-left corner and on every tile from it (the plug-in draws the same). It lies behind the controls and shows only in the oriental state (CSS)
  // version 1.0.9: the page's margins (the dark ground around the panel): the same pattern, ORIENT.pageTile px, as a repeated SVG background (the CSS variable --or-page-img), over the palette's dark ground
  orientPage() {
    const O = this.orientPal(), SO = this.SPEC.ORIENT, T = SO.pageTile;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}"><g opacity="${SO.pageOpacity}"><rect width="${T}" height="${T}" fill="${O.c4}"/>${this.orientTile(O, T)}</g></svg>`;
    document.documentElement.style.setProperty('--or-page-img', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
  }
  // (version 1.0.9: the tile's markup is a method of its own: the page's margins use it too, larger)
  orientTile(O, T) {
    const R = 0.5412 * T, dq = 0.2929 * T, c = T / 2, f = v => Math.round(v * 100) / 100;
    const reg = (cx, cy, n, r, rot) => { const a = []; for (let k = 0; k < n; k++) { const g = rot + 2 * Math.PI * k / n; a.push(f(cx + r * Math.cos(g)) + ',' + f(cy + r * Math.sin(g))); } return a.join(' '); };
    const star = (cx, cy, n, R1, r1, rot) => { const a = []; for (let k = 0; k < 2 * n; k++) { const g = rot + Math.PI * k / n, rr = k % 2 ? r1 : R1; a.push(f(cx + rr * Math.cos(g)) + ',' + f(cy + rr * Math.sin(g))); } return a.join(' '); };
    const dia = (x, y, d) => `${f(x)},${f(y - d)} ${f(x + d)},${f(y)} ${f(x)},${f(y + d)} ${f(x - d)},${f(y)}`;
    let tile = `<polygon points="${reg(c, c, 8, R, Math.PI / 8)}" fill="${O.c4}" stroke="${O.c1}" stroke-width="1.1" stroke-linejoin="round"/>` +
      `<polygon points="${star(c, c, 8, R * 0.86, R * 0.58, Math.PI / 8)}" fill="${O.c1}"/><polygon points="${star(c, c, 8, R * 0.5, R * 0.27, 0)}" fill="${O.c2}"/>` +
      `<circle cx="${c}" cy="${c}" r="${f(R * 0.12)}" fill="${O.c4}"/>`;
    for (const [x, y] of [[0, 0], [T, 0], [0, T], [T, T]]) tile += `<polygon points="${dia(x, y, dq)}" fill="${O.c5}" stroke="${O.c1}" stroke-width="1" stroke-linejoin="round"/><polygon points="${dia(x, y, dq * 0.45)}" fill="${O.c3}"/>`;
    return tile;
  }
  // (web update 2026-10-22: the PLAY card has no pattern any more, a card like the others; the tile's markup, orientTile, still serves the page's margins)

  currentGains() {
    const C = this.C, live = this.live;
    if (live && live.note >= 0 && live.slotLive && live.view === this.view) return { g: live.gains, center: live.center, width: live.width, depth: live.depth, note: live.note };
    const vals = this.host.values(), k = C.K[this.view];
    const g = C.staticGains(vals, new Float64Array(C.NB));
    return { g, center: vals[k.pcen], width: vals[k.pwid], depth: vals[k.pdep], note: -1 };
  }

  // beta 0.3.1: the live gains and windows of the oscillators that play in the last voice (null when no voice plays: the displays then show the static ones)
  liveSlots() { const d = this.live; return d && d.mask && d.sg ? { mask: d.mask, sg: d.sg, win: d.swin } : null; }

  // beta 0.3: the whole sound: one cycle of the mix of every oscillator that plays (and the sub oscillator); beta 0.3.1: moving with the live sound when a note plays
  draw_scope(ctx, W, H) {
    const C = this.C, sets = this.scope;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(W * k / 4 + 0.5, 4); ctx.lineTo(W * k / 4 + 0.5, H - 4); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath(); ctx.moveTo(0, H / 2 + 0.5); ctx.lineTo(W, H / 2 + 0.5); ctx.stroke();
    if (!sets) return;
    const vals = this.host.values();
    const names = this.SPEC.SLOTS.filter((sl, k) => sets[k]).map(sl => sl.name);
    if (vals[this.P.sub_level] > 0) names.push('SUB');
    const live = this.liveSlots(), y = C.globalCycle(vals, sets, this.cycle, live);
    let peak = 0.25;
    for (let i = 0; i < C.N; i++) peak = Math.max(peak, Math.abs(y[i]));
    const sy = (H / 2 - 8) / peak;
    ctx.beginPath();
    for (let x = 0; x <= W; x++) {
      const i = Math.min(C.N - 1, Math.floor(x / W * C.N));
      const v = H / 2 - y[i] * sy;
      if (x === 0) ctx.moveTo(x, v); else ctx.lineTo(x, v);
    }
    ctx.strokeStyle = this.accent(); ctx.lineWidth = 2; ctx.shadowColor = this.accent(); ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    pill(ctx, (names.length ? names.join(' + ') : 'NO OSCILLATOR') + ' · ONE CYCLE OF THE MIX', 8, 14, 'left', 'rgba(200,210,225,0.6)');
    if (live && this.live.note >= 0) pill(ctx, noteName(this.live.note) + ' · LIVE', W - 8, 14, 'right', this.accent());
  }

  // beta 0.3: the whole sound: the atoms of every oscillator that plays (root of the sum of the squares of what each shows)
  draw_scalogram(ctx, W, H) {
    const C = this.C, sets = this.scope;
    const lm = 26, pw = W - lm - 4, rh = (H - 6) / C.NB, top = 3;
    ctx.font = '600 8.5px Segoe UI, system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let b = 1; b <= C.NB; b++) {
      const yy = top + (C.NB - b) * rh;
      ctx.fillStyle = 'rgba(200,210,225,0.4)';
      ctx.fillText('B' + b, lm - 5, yy + rh / 2);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (!sets) return;
    const bands = C.scopeBands(this.host.values(), sets, this.liveSlots());
    const [r0, g0, b0] = this.accentRGB();
    const col = (t) => {
      if (t <= 0) return null;
      if (t < 0.75) { const k = t / 0.75; return `rgb(${Math.round(18 + (r0 - 18) * k)},${Math.round(22 + (g0 - 22) * k)},${Math.round(28 + (b0 - 28) * k)})`; }
      const k = (t - 0.75) / 0.25;
      return `rgb(${Math.round(r0 + (255 - r0) * k)},${Math.round(g0 + (255 - g0) * k)},${Math.round(b0 + (255 - b0) * k)})`;
    };
    for (let b = 1; b <= C.NB; b++) {
      const n = 1 << (b - 1), yy = top + (C.NB - b) * rh;
      const val = k => {
        let e = 0;
        for (const o of bands) { const v = Math.abs(o.coeffs[n + k]) * o.sc[b - 1]; e += v * v; }
        const v = Math.sqrt(e);
        return v > 0 ? clamp((20 * Math.log10(v) + 60) / 60, 0, 1) : 0;
      };
      if (n <= pw) {
        const cw = pw / n, gap = cw >= 4 ? 1 : 0;
        for (let k = 0; k < n; k++) {
          const c = col(val(k)); if (!c) continue;
          ctx.fillStyle = c; ctx.fillRect(lm + k * cw, yy + 0.5, Math.max(1, cw - gap), rh - 1);
        }
      } else {
        for (let x = 0; x < pw; x++) {
          const k0 = Math.floor(x / pw * n), k1 = Math.max(k0 + 1, Math.floor((x + 1) / pw * n));
          let t = 0; for (let k = k0; k < k1; k++) t = Math.max(t, val(k));
          const c = col(t); if (!c) continue;
          ctx.fillStyle = c; ctx.fillRect(lm + x, yy + 0.5, 1, rh - 1);
        }
      }
    }
  }

  draw_atom(ctx, W, H) {
    const C = this.C, wi = Math.round(this.host.get(C.K[this.view].wavelet));
    if (!this.atomCache.has(wi)) this.atomCache.set(wi, C.atomShape(wi));
    const a = this.atomCache.get(wi);
    const span = a.hi - a.lo + 1, margin = Math.max(4, span * 0.15), lo = a.lo - margin, hi = a.hi + margin;
    let peak = 0; for (let i = a.lo; i <= a.hi; i++) peak = Math.max(peak, Math.abs(a.x[i]));
    const sy = (H / 2 - 16) / peak, mid = H / 2 + 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(0, mid + 0.5); ctx.lineTo(W, mid + 0.5); ctx.stroke();
    const X = i => (i - lo) / (hi - lo) * W;
    const [r, g, b] = this.accentRGB();
    ctx.beginPath(); ctx.moveTo(X(lo), mid);
    const step = (hi - lo) / W;
    // Haar is a step function: sample with nearest neighbour so edges stay sharp
    for (let x = 0; x <= W; x++) {
      const i = Math.round(lo + x * step);
      const v = i >= a.lo && i <= a.hi ? a.x[i] : 0;
      ctx.lineTo(x, mid - v * sy);
    }
    ctx.lineTo(W, mid); ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.14)`; ctx.fill();
    ctx.strokeStyle = this.accent(); ctx.lineWidth = 2; ctx.shadowColor = this.accent(); ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(200,210,225,0.5)'; ctx.font = '600 9.5px Segoe UI, system-ui, sans-serif';
    ctx.fillText('ψ  ATOM SHAPE', 8, 14);
    ctx.textAlign = 'right'; ctx.fillText(C.FILTERS[wi].L + ' TAPS', W - 8, 14); ctx.textAlign = 'left';
  }

  draw_source(ctx, W, H) {
    const C = this.C, tb = this.tables;
    if (!tb || tb.mode !== 0) return;
    const vals = this.host.values();
    const k = C.K[this.view];
    const raw = C.sourceCycle(Math.round(vals[k.wave]), vals[k.width], vals[k.phase]);   // shifted by SOURCE PHASE
    const dry = tb.layers[C.DRY];
    let peak = 1; for (let i = 0; i < C.N; i++) peak = Math.max(peak, Math.abs(dry[i]));
    const sy = (H / 2 - 8) / peak;
    const path = (arr) => { ctx.beginPath(); for (let x = 0; x <= W; x++) { const i = Math.min(C.N - 1, Math.floor(x / W * C.N)); const v = H / 2 - arr[i] * sy; if (x) ctx.lineTo(x, v); else ctx.moveTo(x, v); } ctx.stroke(); };
    ctx.strokeStyle = 'rgba(200,210,225,0.2)'; ctx.lineWidth = 1.2; path(raw);
    ctx.strokeStyle = this.accent(); ctx.lineWidth = 1.8; path(dry);
    pill(ctx, 'SOURCE CYCLE', 7, 13, 'left', 'rgba(200,210,225,0.6)');
    pill(ctx, `${tb.kept} / ${tb.nonzero} ATOMS KEPT`, W - 7, H - 5, 'right', this.accent());
  }

  draw_window(ctx, W, H) {
    const C = this.C, st = this.currentGains();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.beginPath(); ctx.moveTo(0, H - 4.5); ctx.lineTo(W, H - 4.5); ctx.stroke();
    if (st.depth <= 0) {
      ctx.fillStyle = 'rgba(200,210,225,0.35)'; ctx.font = '600 9px Segoe UI, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('WINDOW OFF · RAISE DEPTH', W / 2, H / 2 + 3); ctx.textAlign = 'left';
      return;
    }
    ctx.beginPath();
    for (let x = 0; x <= W; x++) { const v = C.windowValue(x / W, st.center, st.width, st.depth); const yy = H - 4 - v * (H - 8); if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); }
    ctx.strokeStyle = this.accent(); ctx.lineWidth = 1.6; ctx.stroke();
  }

  draw_adsr(ctx, W, H, c) {
    const P = this.P;
    // the AMP and MOD envelopes, or an oscillator's own envelope (its four parameters in a row from the widget's param)
    const i0 = c.w.env === 'amp' ? P.amp_a : c.w.env === 'mod' ? P.mod_a : P[c.w.param];
    const a = this.host.get(i0), d = this.host.get(i0 + 1), s = this.host.get(i0 + 2), r = this.host.get(i0 + 3);
    const f = t => 0.06 + Math.log10(1 + t * 100) / Math.log10(1001);
    const wa = f(a), wd = f(d), wr = f(r), hold = 0.35, tot = wa + wd + hold + wr;
    const X = v => 4 + v / tot * (W - 8), Y = v => H - 4 - v * (H - 8);
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(wa), Y(1));
    for (let k = 1; k <= 16; k++) { const t = k / 16; ctx.lineTo(X(wa + wd * t), Y(s + (1 - s) * Math.pow(0.001, t))); }
    ctx.lineTo(X(wa + wd + hold), Y(s));
    for (let k = 1; k <= 16; k++) { const t = k / 16; ctx.lineTo(X(wa + wd + hold + wr * t), Y(s * Math.pow(0.001, t))); }
    const [rr, gg, bb] = this.accentRGB();
    ctx.lineTo(X(tot), Y(0)); ctx.closePath();
    ctx.fillStyle = `rgba(${rr},${gg},${bb},0.13)`; ctx.fill();
    ctx.strokeStyle = this.accent(); ctx.lineWidth = 1.6; ctx.stroke();
  }

  draw_leds(ctx, W, H) {
    const live = this.live, mask = live ? live.voices : 0;
    const maxV = Math.round(this.host.get(this.P.v_voices));
    const step = (W - 10) / 15;
    for (let k = 0; k < 16; k++) {
      const on = (mask >> k) & 1, avail = k < Math.max(1, maxV);
      ctx.beginPath(); ctx.arc(5 + k * step, 8.5, 4, 0, Math.PI * 2);
      ctx.fillStyle = on ? this.accent() : avail ? '#2a303a' : '#1a1e24';
      if (on) { ctx.shadowColor = this.accent(); ctx.shadowBlur = 8; }
      ctx.fill(); ctx.shadowBlur = 0;
    }
  }

  // the effects in the order of the sound, over their knobs (12 + 52 per knob); the plug-in puts its delay SYNC button at
  // the right of the delay's header, the web app has none and uses the whole width
  // (version 1.0.13: the owner could not read them, grey at 42 % and 9 px: in the accent colour of the card titles, 10 px)
  draw_fxheads(ctx) {
    ctx.font = '700 10px Segoe UI, system-ui, sans-serif'; ctx.textAlign = 'center';
    const groups = [['SATURATION', 8, 60], ['CHORUS', 64, 156], ['PING-PONG DELAY', 214, 162], ['REVERB', 376, 104], ['PUNCH', 480, 60]];   // (version 1.0.16: PUNCH)
    for (const [t, x, w] of groups) {
      ctx.fillStyle = this.accent(); ctx.fillText(t, x + w / 2, 12);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(x + 4, 17.5); ctx.lineTo(x + w - 4, 17.5); ctx.stroke();
    }
    ctx.textAlign = 'left';
  }

  draw_meter(ctx, W, H) {
    const live = this.live;
    this.mL = Math.max(live ? live.peakL : 0, (this.mL || 0) * 0.86);
    this.mR = Math.max(live ? live.peakR : 0, (this.mR || 0) * 0.86);
    const bw = (W - 2) / 2;
    [this.mL, this.mR].forEach((v, k) => {
      const db = 20 * Math.log10(v + 1e-9), t = clamp((db + 48) / 48, 0, 1);
      ctx.fillStyle = '#0c0f13'; ctx.fillRect(k * (bw + 2), 0, bw, H);
      const h = t * H;
      const grd = ctx.createLinearGradient(0, H, 0, 0);
      grd.addColorStop(0, '#2fd4c6'); grd.addColorStop(0.75, '#c8e86a'); grd.addColorStop(1, '#ff5d5d');
      ctx.fillStyle = grd; ctx.fillRect(k * (bw + 2), H - h, bw, h);
    });
  }

  draw_keyboard(ctx, W, H) {
    const whites = []; for (let n = KB_LO; n <= KB_HI; n++) if (!isBlack(n)) whites.push(n);
    const ww = W / whites.length, keys = this.host.keysDown();
    this.keyGeom = { ww, whites };
    // Okto MultiWave Synth: with CHORD on, the selector octave is tinted (its keys choose the chord type and make no sound)
    const P = this.P, chordOn = this.host.get(P.chord_mode) >= 0.5, selBase = 24 + 12 * Math.round(this.host.get(P.chord_oct));
    const sel = n => chordOn && n >= selBase && n < selBase + 12;
    whites.forEach((n, k) => {
      const x = k * ww, on = keys.has(n);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if (on) { g.addColorStop(0, this.accent()); g.addColorStop(1, '#e9fbf9'); }
      else if (sel(n)) { g.addColorStop(0, '#9d93e0'); g.addColorStop(1, '#cfc9f2'); }
      else { g.addColorStop(0, '#d9dee5'); g.addColorStop(1, '#f6f8fa'); }
      ctx.fillStyle = g; ctx.fillRect(x + 0.5, 0, ww - 1, H);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 0.5, H - 3, ww - 1, 3);
      if (n % 12 === 0) { ctx.fillStyle = on ? '#0d1014' : '#7a8594'; ctx.font = '600 9px Segoe UI, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(noteName(n), x + ww / 2, H - 8); ctx.textAlign = 'left'; }
    });
    const base = this.host.computerBase ? this.host.computerBase() : -1;
    if (base >= KB_LO && base <= KB_HI) {
      const k0 = whites.indexOf(base), k1 = whites.indexOf(Math.min(KB_HI, base + 16)) ;
      if (k0 >= 0) { const [r, g, b] = this.accentRGB(); ctx.fillStyle = `rgba(${r},${g},${b},0.6)`; ctx.fillRect(k0 * ww + 2, 0, ((k1 >= 0 ? k1 + 1 : whites.length) - k0) * ww - 4, 3); }
    }
    for (let n = KB_LO; n <= KB_HI; n++) {
      if (!isBlack(n)) continue;
      const k = whites.indexOf(n - 1), x = (k + 1) * ww - ww * 0.31, bw = ww * 0.62, bh = H * 0.6, on = keys.has(n);
      const g = ctx.createLinearGradient(0, 0, 0, bh);
      if (on) { g.addColorStop(0, this.accent()); g.addColorStop(1, '#0f5a54'); }
      else if (sel(n)) { g.addColorStop(0, '#4a4280'); g.addColorStop(1, '#1e1a3a'); }
      else { g.addColorStop(0, '#262b33'); g.addColorStop(1, '#0d0f12'); }
      ctx.fillStyle = g; ctx.fillRect(x, 0, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 2, bh - 5, bw - 4, 3);
    }
    // beta 0.2, the oriental tuning: a small amber arrow on every key the tuning moves (down = lower than the equal-tempered key)
    const mode = Math.round(this.host.get(P.mt_mode));
    if (mode > 0 && this.SPEC.MICRO) {
      const t = this.SPEC.MICRO[mode - 1][Math.round(this.host.get(P.mt_scale))], tonic = Math.round(this.host.get(P.mt_tonic));
      ctx.fillStyle = '#ffae42';
      for (let n = KB_LO; n <= KB_HI; n++) {
        const off = t[(((n - tonic) % 12) + 12) % 12];
        if (Math.abs(off) < 8) continue;
        const k = isBlack(n) ? whites.indexOf(n - 1) : whites.indexOf(n), cx = isBlack(n) ? (k + 1) * ww : k * ww + ww / 2, cy = isBlack(n) ? H * 0.5 : H * 0.72;
        ctx.beginPath();
        if (off < 0) { ctx.moveTo(cx - 3.5, cy - 3); ctx.lineTo(cx + 3.5, cy - 3); ctx.lineTo(cx, cy + 3); } else { ctx.moveTo(cx - 3.5, cy + 3); ctx.lineTo(cx + 3.5, cy + 3); ctx.lineTo(cx, cy - 3); }
        ctx.closePath(); ctx.fill();
      }
    }
  }

  keyAt(c, px, py) {
    const g = this.keyGeom; if (!g) return null;
    const H = c.w.h;
    if (py < H * 0.6) {
      for (let n = KB_LO; n <= KB_HI; n++) {
        if (!isBlack(n)) continue;
        const k = g.whites.indexOf(n - 1), x = (k + 1) * g.ww - g.ww * 0.31;
        if (px >= x && px <= x + g.ww * 0.62) return { n, vel: clamp(0.35 + 0.65 * py / (H * 0.6), 0.1, 1) };
      }
    }
    const k = clamp(Math.floor(px / g.ww), 0, g.whites.length - 1);
    return { n: g.whites[k], vel: clamp(0.35 + 0.65 * py / H, 0.1, 1) };
  }

  localPos(c, e) {
    const r = c.cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
  }

  keyboardInput(c) {
    const cv = c.cv;
    cv.style.cursor = 'pointer';
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      cv.setPointerCapture(e.pointerId);
      const p = this.localPos(c, e), k = this.keyAt(c, p.x, p.y);
      if (!k) return;
      this.mouseNotes.set(e.pointerId, k.n);
      this.host.noteOn(k.n, k.vel);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.mouseNotes.has(e.pointerId)) return;
      const p = this.localPos(c, e), k = this.keyAt(c, clamp(p.x, 0, c.w.w - 1), clamp(p.y, 0, c.w.h - 1));
      const cur = this.mouseNotes.get(e.pointerId);
      if (k && k.n !== cur) { this.host.noteOff(cur); this.host.noteOn(k.n, k.vel); this.mouseNotes.set(e.pointerId, k.n); }
    });
    const up = (e) => { const n = this.mouseNotes.get(e.pointerId); if (n != null) { this.host.noteOff(n); this.mouseNotes.delete(e.pointerId); } };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }

  draw_wheels(ctx, W, H) {
    const P = this.P, bend = this.host.get(P.bend), mod = this.host.get(P.modwheel);
    const ww = 24;
    [[0, (bend + 1) / 2, 'PITCH', true], [W - ww, mod, 'MOD', false]].forEach(([x, v, lab, center]) => {
      const h = H - 14;
      const g = ctx.createLinearGradient(x, 0, x + ww, 0);
      g.addColorStop(0, '#0b0d10'); g.addColorStop(0.5, '#1c2128'); g.addColorStop(1, '#0b0d10');
      ctx.fillStyle = g; ctx.fillRect(x, 0, ww, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      for (let y = 4; y < h; y += 5) { ctx.beginPath(); ctx.moveTo(x + 3, y + 0.5); ctx.lineTo(x + ww - 3, y + 0.5); ctx.stroke(); }
      if (center) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, h / 2 - 0.5, ww, 1); }
      const yy = (1 - v) * (h - 8) + 4;
      ctx.fillStyle = this.accent(); ctx.shadowColor = this.accent(); ctx.shadowBlur = 8;
      ctx.fillRect(x + 2, yy - 2, ww - 4, 4); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(200,210,225,0.45)'; ctx.font = '700 8px Segoe UI, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(lab, x + ww / 2, H - 2); ctx.textAlign = 'left';
    });
  }

  // ------------------------------------------------------------------ Okto MultiWave Synth: toggle, chord pads, chord name, strum plate
  // an on / off button (CHORD ON, BASS), lit when on: the plug-in's W_TOGGLE
  toggle(w, box) {
    const i = this.P[w.param], p = this.params[i];
    box.classList.add('toggle');
    const b = el('button', '', box);
    b.textContent = w.text || p.short;
    b.title = p.name;
    b.onclick = () => { this.host.begin(i); this.host.set(i, this.host.get(i) >= 0.5 ? 0 : 1); this.host.end(i); };
    const widget = { w, p, i, el: box, update: () => b.classList.toggle('on', this.host.get(i) >= 0.5) };
    this.reg(w.param, widget);
    widget.update();
  }

  // The twelve chord pads, laid out like the selector octave: the white-key family (Maj, 7, Maj7, Sus2, Sus4, Add9, Note)
  // above, the black-key family (Min, m7, Dim, Aug, 5) below, between them. key = 0..11 (C .. B).
  padRects(W) {
    const cw = W / 7, pw = cw - 4, ph = 32, rects = [];
    let wi = 0;
    for (let k = 0; k < 12; k++) {
      const black = isBlack(k);
      rects.push(black ? { x: (wi - 0.5) * cw + 2, y: 36, w: pw, h: ph, key: k } : { x: wi * cw + 2, y: 0, w: pw, h: ph, key: k });
      if (!black) wi++;
    }
    return rects;
  }
  draw_chordpads(ctx, W, H, c) {
    const P = this.P, S = this.SPEC, on = this.host.get(P.chord_mode) >= 0.5, cur = Math.round(this.host.get(P.chord_type));
    const base = 24 + 12 * Math.round(this.host.get(P.chord_oct));
    ctx.globalAlpha = on ? 1 : 0.45;
    for (const r of this.padRects(W)) {
      const type = S.CHORD_KEYS[r.key], active = type === cur, black = isBlack(r.key), hot = c.hover === r.key;
      roundRect(ctx, r.x, r.y, r.w, r.h, 6);
      ctx.fillStyle = active ? this.accent() : black ? (hot ? '#1c2129' : '#121519') : (hot ? '#343b47' : '#262c35');
      ctx.fill();
      if (!active) { ctx.strokeStyle = black ? '#2a303a' : '#3a4250'; ctx.lineWidth = 1; ctx.stroke(); }
      if (active) { ctx.shadowColor = this.accent(); ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0; }
      ctx.textAlign = 'center';
      ctx.fillStyle = active ? '#0d1014' : black ? '#aeb7c4' : '#eef2f7';
      ctx.font = '700 11px Segoe UI, system-ui, sans-serif';
      ctx.fillText(S.CHORDS[type].label, r.x + r.w / 2, r.y + 15);
      ctx.fillStyle = active ? 'rgba(13,16,20,0.75)' : '#566070';
      ctx.font = '600 8px Segoe UI, system-ui, sans-serif';
      ctx.fillText(noteName(base + r.key), r.x + r.w / 2, r.y + 27);
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
  }
  padAt(c, x, y) { for (const r of this.padRects(c.w.w)) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.key; return -1; }
  padsInput(c) {
    const cv = c.cv, P = this.P, S = this.SPEC;
    cv.style.cursor = 'pointer';
    c.hover = -1;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const p = this.localPos(c, e), k = this.padAt(c, p.x, p.y);
      if (k < 0) return;
      const i = P.chord_type;
      this.host.begin(i); this.host.set(i, S.CHORD_KEYS[k]); this.host.end(i);
      if (this.host.get(P.chord_mode) < 0.5) { this.host.begin(P.chord_mode); this.host.set(P.chord_mode, 1); this.host.end(P.chord_mode); }   // a pad switches CHORD on
    });
    cv.addEventListener('pointermove', (e) => { const p = this.localPos(c, e), k = this.padAt(c, p.x, p.y); if (k !== c.hover) { c.hover = k; c.dirty = true; } });
    cv.addEventListener('pointerleave', () => { if (c.hover !== -1) { c.hover = -1; c.dirty = true; } });
    cv.title = 'Chord type: click a pad (the keys of the selector octave do the same)';
  }

  // the chord sounding: its name (root and type), its notes; the type chosen while no root is held
  chordLive() {
    const P = this.P, live = this.live && this.live.chord;
    const type = Math.round(this.host.get(P.chord_type)), held = !!(live && live.root >= 0);
    return { on: this.host.get(P.chord_mode) >= 0.5, type, held, root: held ? live.root : live ? live.last : 60, notes: held ? live.notes : [] };
  }
  draw_chordname(ctx, W, H) {
    const S = this.SPEC, C = this.C, st = this.chordLive();
    ctx.fillStyle = '#0c0f13'; roundRect(ctx, 0, 0, W, H, 7); ctx.fill();
    ctx.strokeStyle = '#252b34'; ctx.lineWidth = 1; roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 7); ctx.stroke();
    pill(ctx, 'CHORD', 8, 14, 'left', 'rgba(200,210,225,0.6)');
    if (!st.on) {
      ctx.fillStyle = '#566070'; ctx.font = '600 10px Segoe UI, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('OFF · the keys play as usual', W / 2, H / 2 + 8); ctx.textAlign = 'left';
      return;
    }
    const name = C.chordName(st.root, st.type), letter = name.slice(0, /^.#/.test(name) ? 2 : 1), suffix = name.slice(letter.length);
    ctx.textAlign = 'left';
    ctx.font = '700 26px Segoe UI, system-ui, sans-serif';
    const lw = ctx.measureText(letter).width;
    ctx.font = '700 15px Segoe UI, system-ui, sans-serif';
    const sw = ctx.measureText(suffix).width, x0 = (W - lw - sw - 2) / 2;
    ctx.fillStyle = st.held ? this.accent() : '#8792a1';
    if (st.held) { ctx.shadowColor = this.accent(); ctx.shadowBlur = 10; }
    ctx.font = '700 26px Segoe UI, system-ui, sans-serif'; ctx.fillText(letter, x0, 38);
    ctx.font = '700 15px Segoe UI, system-ui, sans-serif'; ctx.fillText(suffix, x0 + lw + 2, 38);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.fillStyle = st.held ? '#eef2f7' : '#566070';
    ctx.font = '600 9.5px Segoe UI, system-ui, sans-serif';
    ctx.fillText(st.held ? st.notes.map(n => noteName(n)).join(' · ') : S.CHORDS[st.type].name + ' · play a key above ' + noteName(24 + 12 * Math.round(this.host.get(this.P.chord_oct)) + 11), W / 2, 60);
    ctx.textAlign = 'left';
  }

  // the strum plate: the chord's notes over three octaves as strings; drag across them (as on the touch plate of an electronic chord harp)
  draw_strumplate(ctx, W, H, c) {
    const C = this.C, st = this.chordLive(), keys = this.host.keysDown();
    const notes = C.plateNotes(st.root, st.type), n = notes.length, sw = W / n;
    c.plate = notes;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e1116'); g.addColorStop(1, '#171b22');
    ctx.fillStyle = g; roundRect(ctx, 0, 0, W, H, 7); ctx.fill();
    ctx.strokeStyle = '#252b34'; ctx.lineWidth = 1; roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 7); ctx.stroke();
    for (let k = 0; k < n; k++) {
      const x = Math.round((k + 0.5) * sw) + 0.5, lit = keys.has(notes[k]) || c.touch === notes[k];
      ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, H - 16);
      ctx.strokeStyle = lit ? this.accent() : 'rgba(200,210,225,0.32)'; ctx.lineWidth = lit ? 2.5 : 1.2;
      if (lit) { ctx.shadowColor = this.accent(); ctx.shadowBlur = 8; }
      ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = lit ? this.accent() : '#566070'; ctx.font = '600 7.5px Segoe UI, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(noteName(notes[k]), x, H - 4);
    }
    ctx.textAlign = 'left';
    pill(ctx, 'STRUM PLATE', 8, 14, 'left', 'rgba(200,210,225,0.5)');
  }
  plateInput(c) {
    const cv = c.cv;
    cv.style.cursor = 'ew-resize';
    c.touch = -1;
    const at = (e) => {
      const p = this.localPos(c, e), notes = c.plate || [];
      if (!notes.length) return { n: -1, vel: 0 };
      const k = clamp(Math.floor(p.x / (c.w.w / notes.length)), 0, notes.length - 1);
      return { n: notes[k], vel: clamp(0.4 + 0.6 * p.y / c.w.h, 0.2, 1) };
    };
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      cv.setPointerCapture(e.pointerId);
      const s = at(e); if (s.n < 0) return;
      c.touch = s.n; this.host.plateOn(s.n, s.vel);
    });
    cv.addEventListener('pointermove', (e) => {
      if (c.touch < 0) return;
      const s = at(e);
      if (s.n >= 0 && s.n !== c.touch) { this.host.plateOff(c.touch); c.touch = s.n; this.host.plateOn(s.n, s.vel); }
    });
    const up = () => { if (c.touch >= 0) { this.host.plateOff(c.touch); c.touch = -1; } };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.title = 'Strum plate: drag across the strings to strum the chord (the RELEASE of the amp envelope is how long they ring)';
  }

  wheelInput(c) {
    const cv = c.cv;
    cv.style.cursor = 'ns-resize';
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      const p = this.localPos(c, e);
      const which = p.x < c.w.w / 2 ? 'bend' : 'modwheel';
      cv.setPointerCapture(e.pointerId);
      drag = { which, y: p.y };
      move(e);
    });
    const move = (e) => {
      if (!drag) return;
      const p = this.localPos(c, e), h = c.w.h - 14;
      const v = clamp(1 - (p.y - 4) / (h - 8), 0, 1);
      this.host.set(this.P[drag.which], drag.which === 'bend' ? v * 2 - 1 : v);
    };
    cv.addEventListener('pointermove', move);
    const up = () => { if (drag && drag.which === 'bend') this.host.set(this.P.bend, 0); drag = null; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }
}
