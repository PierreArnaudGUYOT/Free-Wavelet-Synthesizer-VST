// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre). Release beta 0.1.
// Panel UI built from WS_SPEC (same layout as the VST editor).
'use strict';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = n => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
const KB_LO = 36, KB_HI = 96;
const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SVGNS = 'http://www.w3.org/2000/svg';

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
    this.mode = 0;
    this.live = null;
    this.tip = el('div', 'tip', document.body, { display: 'none' });
    this.atomCache = new Map();
    this.cycle = new Float64Array(C.N);
    this.mouseNotes = new Map();
    this.build();
    window.addEventListener('resize', () => this.fit());
    this.fit();
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------------ building
  build() {
    for (const s of this.SPEC.SECTIONS) {
      const card = s.title !== '';
      const se = el('div', 'section' + (card ? ' card' : ''), this.dev, { left: s.x + 'px', top: s.y + 'px', width: s.w + 'px', height: s.h + 'px' });
      if (card) {
        const t = el('div', 'title', se);
        const parts = s.title.split(' · ');
        t.innerHTML = parts.length > 1 ? `<b>${parts[0]}</b> · ${parts.slice(1).join(' · ')}` : s.title;
      }
      this.sections.push({ spec: s, el: se });
      for (const w of s.widgets) this.makeWidget(w, se, s);
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
    const box = el('div', 'w ' + w.type, parent, { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px' });
    const ab = { x: sec.x + w.x, y: sec.y + w.y };
    switch (w.type) {
      case 'knobL': case 'knobM': case 'knobS': case 'knobT': return this.knob(w, box);
      case 'seg': return this.seg(w, box);
      case 'step': return this.step(w, box);
      case 'menu': return this.menu(w, box);
      case 'drawbar': return this.drawbar(w, box);
      case 'logo': return this.logo(box);
      case 'presets': return this.presets(box);
      case 'manualA': case 'manualB': {
        const b = el('button', 'hbtn' + (w.type === 'manualB' ? ' b' : ''), box, { width: '100%', height: '100%' });
        b.innerHTML = `MANUAL<b>${w.type === 'manualA' ? 'A' : 'B'}</b>`;
        b.title = w.type === 'manualA' ? 'Engine A user manual — wavelet subtractive' : 'Engine B user manual — wavelet additive';
        b.onclick = () => this.host.openManual(w.type === 'manualA' ? 'A' : 'B');
        return;
      }
      case 'zoom': return;
      case 'credit': {
        const A = this.SPEC.APP;
        box.textContent = `${A.credit} · ${A.version} · ${A.license}`;
        box.title = `${A.name} — ${A.copyright}. Free software under the GNU General Public License v3 or later, WITHOUT ANY WARRANTY (see the LICENSE file).`;
        return;
      }
      default: return this.canvasWidget(w, box, ab);
    }
  }

  // ------------------------------------------------------------------ knob
  knob(w, box) {
    const i = this.P[w.param], p = this.params[i];
    const big = w.type === 'knobL', small = w.type === 'knobS', tiny = w.type === 'knobT';
    const d = big ? 56 : small ? 30 : tiny ? 26 : 38, cx = w.w / 2, cy = big ? 32 : small ? 18 : tiny ? 15 : 20, r = d / 2;
    box.classList.add('knob');
    box.title = p.name;
    const s = svg('svg', { width: w.w, height: w.h }, box);
    const id = 'kg' + i + w.type;
    const defs = svg('defs', {}, s);
    const grad = svg('radialGradient', { id, cx: '35%', cy: '30%', r: '75%' }, defs);
    svg('stop', { offset: '0%', 'stop-color': '#3a414c' }, grad);
    svg('stop', { offset: '100%', 'stop-color': '#161a1f' }, grad);
    const thin = small || tiny, A0 = -0.75 * Math.PI, A1 = 0.75 * Math.PI, ar = r + (thin ? 2 : 4);
    svg('path', { d: arcPath(cx, cy, ar, A0, A1), stroke: '#2a303a', 'stroke-width': thin ? 2.5 : 3, fill: 'none', 'stroke-linecap': 'round' }, s);
    const val = svg('path', { d: '', stroke: 'var(--accent)', 'stroke-width': thin ? 2.5 : 3, fill: 'none', 'stroke-linecap': 'round' }, s);
    svg('circle', { cx, cy, r: r - 1, fill: `url(#${id})`, stroke: '#0b0d10', 'stroke-width': 1.5 }, s);
    svg('circle', { cx, cy, r: r - 4, fill: 'none', stroke: 'rgba(255,255,255,0.05)', 'stroke-width': 1 }, s);
    const ptr = svg('line', { x1: cx, y1: cy - r * 0.25, x2: cx, y2: cy - r + 4, stroke: '#eef2f7', 'stroke-width': big ? 3 : tiny ? 2 : 2.2, 'stroke-linecap': 'round' }, s);
    let label = null;
    if (!small) {
      label = el('div', 'label', box, { top: (big ? 70 : tiny ? 33 : 43) + 'px', fontSize: big ? '10.5px' : tiny ? '8.5px' : '' });
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
        ptr.setAttribute('transform', `rotate(${(a * 180 / Math.PI).toFixed(2)} ${cx} ${cy})`);
        if (label) {
          const showVal = widget.hover || widget.drag;
          label.textContent = showVal ? this.C.format(p, v) : p.short;
          label.classList.toggle('value', !!showVal);
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
    const btns = p.choiceShort.map((label, k) => {
      const b = el('button', '', box);
      b.textContent = label;
      b.title = p.name + ': ' + p.choices[k];
      b.onclick = () => { this.host.begin(i); this.host.set(i, k); this.host.end(i); };
      return b;
    });
    const widget = { w, p, i, el: box, update: () => { const v = Math.round(this.host.get(i)); btns.forEach((b, k) => b.classList.toggle('on', k === v)); } };
    this.reg(w.param, widget);
    widget.update();
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
    const widget = { w, p, i, el: box, update: () => { btn.innerHTML = `${p.choiceShort[Math.round(this.host.get(i))]}<span>▾</span>`; } };
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
    t.innerHTML = '<b>OKTOWAVE</b><span>WAVELET SYNTHESIZER</span>';   // beta 0.3
  }

  presets(box) {
    box.classList.add('presets');
    const prev = el('button', 'arrow', box); prev.textContent = '◀'; prev.title = 'Previous preset';
    const name = el('div', 'pname', box);
    const next = el('button', 'arrow', box); next.textContent = '▶'; next.title = 'Next preset';
    prev.onclick = () => this.host.presetStep(-1);
    next.onclick = () => this.host.presetStep(1);
    name.onclick = (e) => { e.stopPropagation(); this.togglePresetMenu(box); };
    this.presetNameEl = name;
    document.addEventListener('pointerdown', (e) => { if (this.pmenu && !this.pmenu.contains(e.target)) this.closePresetMenu(); });
  }
  setPresetName(nm, dirty) {
    if (this.presetNameEl) this.presetNameEl.innerHTML = `<span>${nm.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>${dirty ? '<span class="dirty" title="Modified">•</span>' : ''}<span class="chev">▼</span>`;
  }
  togglePresetMenu(box) {
    if (this.pmenu) { this.closePresetMenu(); return; }
    const m = el('div', 'pmenu', box);
    const list = this.host.presetList();
    // Groups fold like the banks of a hardware synth: favourites, user presets and the group of the current preset
    // start open; a click on a group title opens or closes it (remembered while the page is open).
    const cur = list.find(x => x.current);
    if (!this.openGroups) this.openGroups = new Set(['★ FAVOURITES', 'USER PRESETS']);
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
      const mm = /^(AB|A|B) · (.*)$/.exec(item.name);   // engine letters in their colours (AB = both engines mixed)
      if (mm) {
        const e = el('b', 'eng', n);
        for (const ch of mm[1]) el('span', ch.toLowerCase(), e).textContent = ch;
        n.appendChild(document.createTextNode(mm[2]));
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
    const c = { w, box, cv, ctx: cv.getContext('2d'), ab, dirty: true };
    this.canvases.push(c);
    if (w.type === 'keyboard') this.keyboardInput(c);
    if (w.type === 'wheels') this.wheelInput(c);
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
    const aw = stage.clientWidth - 24, ah = stage.clientHeight - 24;
    const s = clamp(Math.min(aw / 1100, ah / 720), 0.45, 2.5);
    this.scale = s;
    this.dev.style.transform = `scale(${s})`;
    this.dev.style.left = Math.max(0, (stage.clientWidth - 1100 * s) / 2) + 'px';
    this.dev.style.top = Math.max(0, (stage.clientHeight - 720 * s) / 2) + 'px';
    this.sizeCanvases();
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
  refresh(i) {
    const ws = this.byParam.get(i);
    if (ws) for (const w of ws) w.update();
    if (i === this.P.engine) this.setMode(Math.round(this.host.get(i)));
    this.updateEnables();
    for (const c of this.canvases) c.dirty = true;
  }
  refreshAll() {
    for (const [, ws] of this.byParam) for (const w of ws) w.update();
    this.setMode(Math.round(this.host.get(this.P.engine)));
    this.updateEnables();
    for (const c of this.canvases) c.dirty = true;
  }
  setMode(m) {
    this.mode = m;
    this.dev.classList.toggle('mode-a', m === 0);
    this.dev.classList.toggle('mode-b', m === 1);
    for (const s of this.sections) {
      const hide = (s.spec.mode === 'A' && m !== 0) || (s.spec.mode === 'B' && m !== 1);
      s.el.classList.toggle('hidden', hide);
    }
  }
  updateEnables() {
    const P = this.P, wave = Math.round(this.host.get(P.a_wave)), pat = Math.round(this.host.get(P.b_pattern));
    const set = (key, on) => { const ws = this.byParam.get(P[key]); if (ws) ws.forEach(w => w.el && w.el.classList.toggle('disabled', !on)); };
    set('a_width', wave === 2 || wave === 3);
    set('b_seed', pat === 5);
  }
  setLive(d) { this.live = d; }

  // ------------------------------------------------------------------ demo support
  // Highlights the controls of the parameters being animated by the demo.
  setHot(ids) {
    for (const e of this.hotEls || []) e.classList.remove('hot');
    this.hotEls = [];
    for (const id of ids) for (const w of this.byParam.get(id) || []) if (w.el) { w.el.classList.add('hot'); this.hotEls.push(w.el); }
  }
  // DEMO split button: ▶ DEMO plays the default demo (first song), ▾ opens the list of songs.
  // d = { running, stop, songs, play(i), loadFile }
  makeDemoButton(d) {
    const b = el('button', 'hbtn demo-btn', this.dev);
    b.innerHTML = '&#9654; DEMO';
    b.title = 'Play the default demo: Beethoven, Appassionata (III), with a tour of all the presets (a new preset about every 4 s, on a change of chord)';
    const arrow = el('button', 'hbtn demo-arrow', this.dev);
    arrow.innerHTML = '&#9662;';
    arrow.title = 'Choose another demo song or load your own MIDI file';
    const close = () => { if (this.dmenu) { this.dmenu.remove(); this.dmenu = null; } };
    b.onclick = (e) => {
      e.stopPropagation();
      close();
      if (d.running()) d.stop(); else d.play(0);
    };
    arrow.onclick = (e) => {
      e.stopPropagation();
      if (this.dmenu) { close(); return; }
      const m = el('div', 'pmenu demo-menu', this.dev);
      el('div', 'grp', m).textContent = 'DEMO SONGS · FREE MIDI (MUTOPIA PROJECT)';
      const mmss = s => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
      d.songs().forEach((s, i) => {
        const it = el('div', 'it', m);
        it.innerHTML = `<span>${s.composer} — <b>${(s.short || s.title).replace(/</g, '&lt;')}</b>${s.tour ? ' <i class="tag">DEFAULT</i>' : ''}</span><span class="dur">${mmss(s.duration)}</span>`;
        it.title = s.title + (s.license && s.license !== 'Public Domain' ? ` (MIDI licence: ${s.license})` : ' (public domain)') +
          (s.tour ? ' — default demo (▶ DEMO): a tour of the factory presets, a new one every 4 s' : '');
        it.onclick = () => { close(); d.play(i); };
      });
      el('div', 'sep', m);
      const ld = el('div', 'it', m);
      ld.innerHTML = '<span>Load a MIDI file…</span><span class="dur">.mid</span>';
      ld.title = 'Play your own MIDI file with the same parameter animations (drums on channel 10 are ignored)';
      ld.onclick = () => { close(); d.loadFile(); };
      this.dmenu = m;
    };
    document.addEventListener('pointerdown', (e) => { if (this.dmenu && !this.dmenu.contains(e.target) && e.target !== arrow) close(); });
    this.demoBtn = b;
  }
  setDemoRunning(on) {
    if (!this.demoBtn) return;
    this.demoBtn.classList.toggle('running', on);
    this.demoBtn.innerHTML = on ? '&#9632; STOP' : '&#9654; DEMO';
  }
  setTables(tb) { this.tables = tb; for (const c of this.canvases) c.dirty = true; }

  // ------------------------------------------------------------------ drawing
  frame() {
    for (const c of this.canvases) {
      const t = c.w.type;
      const animated = t === 'scope' || t === 'scalogram' || t === 'meter' || t === 'leds' || t === 'keyboard' || t === 'window';
      if (!c.dirty && !animated) continue;
      c.dirty = false;
      const ctx = c.ctx;
      ctx.setTransform(c.pr, 0, 0, c.pr, 0, 0);
      ctx.clearRect(0, 0, c.w.w, c.w.h);
      const fn = this['draw_' + t];
      if (fn) fn.call(this, ctx, c.w.w, c.w.h, c);
    }
  }

  accent() { return this.mode === 0 ? '#2fd4c6' : '#ffae42'; }
  accentRGB() { return this.mode === 0 ? [47, 212, 198] : [255, 174, 66]; }

  currentGains() {
    const C = this.C, live = this.live;
    if (live && live.note >= 0 && live.mode === this.mode) return { g: live.gains, center: live.center, width: live.width, depth: live.depth, note: live.note };
    const vals = this.host.values();
    const g = C.staticGains(vals, new Float64Array(C.NB));
    return { g, center: vals[this.P.p_center], width: vals[this.P.p_width], depth: vals[this.P.p_depth], note: -1 };
  }

  draw_scope(ctx, W, H) {
    const C = this.C, tb = this.tables;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(W * k / 4 + 0.5, 4); ctx.lineTo(W * k / 4 + 0.5, H - 4); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath(); ctx.moveTo(0, H / 2 + 0.5); ctx.lineTo(W, H / 2 + 0.5); ctx.stroke();
    if (!tb || tb.mode !== this.mode) return;
    const st = this.currentGains();
    const y = C.displayCycle(tb, st.g, st.center, st.width, st.depth, this.cycle);
    const ghost = tb.mode === 0 ? tb.layers[C.DRY] : null;
    let peak = 0.25;
    for (let i = 0; i < C.N; i++) { peak = Math.max(peak, Math.abs(y[i])); if (ghost) peak = Math.max(peak, Math.abs(ghost[i])); }
    const sy = (H / 2 - 8) / peak;
    if (st.depth > 0) {
      const [r, g, b] = this.accentRGB();
      for (let x = 0; x < W; x += 2) {
        const wv = C.windowValue(x / W, st.center, st.width, 1);
        if (wv > 0.01) { ctx.fillStyle = `rgba(${r},${g},${b},${0.10 * wv * st.depth})`; ctx.fillRect(x, 0, 2, H); }
      }
    }
    const path = (arr) => {
      ctx.beginPath();
      for (let x = 0; x <= W; x++) {
        const i = Math.min(C.N - 1, Math.floor(x / W * C.N));
        const v = H / 2 - arr[i] * sy;
        if (x === 0) ctx.moveTo(x, v); else ctx.lineTo(x, v);
      }
      ctx.stroke();
    };
    if (ghost) { ctx.strokeStyle = 'rgba(200,210,225,0.18)'; ctx.lineWidth = 1.2; path(ghost); }
    ctx.strokeStyle = this.accent(); ctx.lineWidth = 2; ctx.shadowColor = this.accent(); ctx.shadowBlur = 8;
    path(y);
    ctx.shadowBlur = 0;
    pill(ctx, tb.mode === 0 ? 'ONE CYCLE · DRY (GREY) vs FILTERED' : 'ONE CYCLE · SUM OF ATOM BANDS', 8, 14, 'left', 'rgba(200,210,225,0.6)');
    if (st.note >= 0) pill(ctx, noteName(st.note) + ' · LIVE', W - 8, 14, 'right', this.accent());
  }

  draw_scalogram(ctx, W, H) {
    const C = this.C, tb = this.tables;
    const lm = 26, pw = W - lm - 4, rh = (H - 6) / C.NB, top = 3;
    ctx.font = '600 8.5px Segoe UI, system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let b = 1; b <= C.NB; b++) {
      const yy = top + (C.NB - b) * rh;
      ctx.fillStyle = 'rgba(200,210,225,0.4)';
      ctx.fillText('B' + b, lm - 5, yy + rh / 2);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (!tb || tb.mode !== this.mode) return;
    const st = this.currentGains();
    const [r0, g0, b0] = this.accentRGB();
    const col = (t) => {
      if (t <= 0) return null;
      if (t < 0.75) { const k = t / 0.75; return `rgb(${Math.round(18 + (r0 - 18) * k)},${Math.round(22 + (g0 - 22) * k)},${Math.round(28 + (b0 - 28) * k)})`; }
      const k = (t - 0.75) / 0.25;
      return `rgb(${Math.round(r0 + (255 - r0) * k)},${Math.round(g0 + (255 - g0) * k)},${Math.round(b0 + (255 - b0) * k)})`;
    };
    const sq = 1 / Math.sqrt(C.N);
    for (let b = 1; b <= C.NB; b++) {
      const n = 1 << (b - 1), yy = top + (C.NB - b) * rh;
      const scale = tb.bandScale[b - 1] * Math.pow(2, (b - 1) / 2) * sq * Math.abs(st.g[b - 1]);
      const val = k => {
        const v = Math.abs(tb.coeffs[n + k]) * scale;
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
    if (st.depth > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath();
      for (let x = 0; x <= pw; x++) {
        const wv = C.windowValue(x / pw, st.center, st.width, st.depth);
        const yy = top + (1 - wv) * (H - 6);
        if (x === 0) ctx.moveTo(lm + x, yy); else ctx.lineTo(lm + x, yy);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
  }

  draw_atom(ctx, W, H) {
    const C = this.C, wi = Math.round(this.host.get(this.P.wavelet));
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
    const raw = C.sourceCycle(Math.round(vals[this.P.a_wave]), vals[this.P.a_width]);
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
    const P = this.P, pre = c.w.env === 'amp' ? 'amp_' : 'mod_';
    const a = this.host.get(P[pre + 'a']), d = this.host.get(P[pre + 'd']), s = this.host.get(P[pre + 's']), r = this.host.get(P[pre + 'r']);
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

  draw_fxheads(ctx) {
    ctx.font = '700 9px Segoe UI, system-ui, sans-serif'; ctx.textAlign = 'center';
    const groups = [['SATURATION', 26, 52], ['PING-PONG DELAY', 78, 156], ['REVERB', 234, 104]];
    for (const [t, x, w] of groups) {
      ctx.fillStyle = 'rgba(200,210,225,0.42)'; ctx.fillText(t, x + w / 2, 12);
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
    whites.forEach((n, k) => {
      const x = k * ww, on = keys.has(n);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      if (on) { g.addColorStop(0, this.accent()); g.addColorStop(1, '#e9fbf9'); } else { g.addColorStop(0, '#d9dee5'); g.addColorStop(1, '#f6f8fa'); }
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
      if (on) { g.addColorStop(0, this.accent()); g.addColorStop(1, '#0f5a54'); } else { g.addColorStop(0, '#262b33'); g.addColorStop(1, '#0d0f12'); }
      ctx.fillStyle = g; ctx.fillRect(x, 0, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 2, bh - 5, bw - 4, 3);
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
