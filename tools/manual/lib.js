// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Helpers for building the manuals from the real spec (ranges/defaults never typed by hand).
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const W = path.join(ROOT, 'web', 'js') + path.sep;
const SPEC = require(W + 'spec.js');
const C = require(W + 'core.js')(SPEC);
const PK = {}; SPEC.PARAMS.forEach(p => { PK[p.key] = p; });
const { SNIPS } = require('./figs.js');

const num = v => String(Math.round(v * 1000) / 1000);
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v));
function secStr(v, p) { if (p.curve === 'pow2' && v === 0) return 'off'; return v < 1 ? num(v * 1000) + ' ms' : num(v) + ' s'; }
function rangeOf(key) {
  const p = PK[key]; if (!p) throw new Error('unknown param ' + key);
  const lo = p.min, hi = p.max, bip = lo < 0;
  switch (p.fmt) {
    case 'pct': return `${Math.round(lo * 100)} – ${Math.round(hi * 100)} %`;
    case 'bipct': return `−${Math.round(-lo * 100)} … +${Math.round(hi * 100)} %`;
    case 'db': return bip ? `${sgn(lo)} … ${sgn(hi)} dB` : `${num(lo)} – ${num(hi)} dB`;
    case 'dbband': return bip ? `${sgn(lo)} … ${sgn(hi)} dB/band` : `${num(lo)} – ${num(hi)} dB/band`;
    case 'sec': return `${secStr(lo, p)} – ${secStr(hi, p)}`;
    case 'hz': return `${num(lo)} – ${num(hi)} Hz`;
    case 'semi': return `${sgn(lo)} … ${sgn(hi)} semitones`;
    case 'cents': return bip ? `${sgn(lo)} … ${sgn(hi)} cents` : `${num(lo)} – ${num(hi)} cents`;
    case 'band': return bip ? `${sgn(lo)} … ${sgn(hi)} bands` : `${num(lo)} – ${num(hi)}${key === 'lfo_cut' ? ' bands' : ''}`;
    case 'int': return bip ? `${sgn(lo)} … ${sgn(hi)}` : `${num(lo)} – ${num(hi)}`;
    case 'deg': return '0° – 360°';
    case 'cyc': return `0 – ±${Math.round(hi * 360)}°`;
    case 'bandamt': return `0 – ±${num(hi)} bands`;
    case 'choice': return p.choiceShort.join(' · ');
    default: throw new Error('fmt ' + p.fmt);
  }
}
const defOf = key => { const p = PK[key]; return p.fmt === 'choice' ? p.choices[p.def] : C.format(p, p.def); };
const hostOf = key => PK[key].name;
const shortOf = key => PK[key].short;

const ctl = s => `<span class="ctl">${s}</span>`;
const kbd = s => `<kbd>${s}</kbd>`;
const val = s => `<span class="val">${s}</span>`;
const P = key => ctl(shortOf(key));

// rows: [key | {key, label, range, def, host}, what, tip]
function controls(rows, o = {}) {
  let h = `<div class="tbl"><table class="controls"><thead><tr><th>Control</th><th>Range · default</th><th>What it does</th><th>Tip</th></tr></thead><tbody>`;
  for (const r of rows) {
    const [k, what, tip] = r;
    const spec = typeof k === 'string' ? { key: k } : k;
    const key = spec.key;
    const label = spec.label || (key ? shortOf(key) : '');
    const range = spec.range || (key ? rangeOf(key) : '');
    const def = spec.def != null ? spec.def : (key ? defOf(key) : '');
    const host = spec.host != null ? spec.host : (key ? hostOf(key) : '');
    h += `<tr${spec.id ? ` id="${spec.id}"` : ''}><td>${ctl(label)}${host ? `<span class="host">host: ${host}</span>` : ''}</td>` +
      `<td><span class="rng${(spec.range || (key && PK[key].fmt === 'choice')) ? ' wrap' : ''}">${range}</span>${def !== '' ? `<span class="def">default <b>${def}</b></span>` : ''}</td>` +
      `<td>${what}</td><td>${tip || ''}</td></tr>`;
  }
  return h + '</tbody></table></div>';
}

function table(head, rows, cls) {
  return `<div class="tbl"><table${cls ? ` class="${cls}"` : ''}><thead><tr>${head.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>` +
    rows.map(r => '<tr>' + r.map(c => `<td${c && c.na ? ' class="na"' : ''}>${c && c.na ? c.na : c}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>';
}

const callout = (kind, title, body) => `<div class="callout ${kind}"><span class="ttl">${title}</span>${body}</div>`;
const tip = b => callout('tip', 'TIP', b);
const note = b => callout('note', 'NOTE', b);
const warn = b => callout('warn', 'CAUTION', b);
const deep = (b, t) => callout('deep', t || 'UNDER THE HOOD', b);
const snip = name => { if (!SNIPS[name]) throw new Error('missing diagram ' + name); return SNIPS[name]; };
const fig = (src, cap, cls, alt) => `<figure class="${cls || 'frame'}"><img src="img/${src}" alt="${alt || cap.replace(/<[^>]+>/g, '').replace(/"/g, '')}"><figcaption>${cap}</figcaption></figure>`;
const figInline = (name, cap) => `<figure class="frame inline">${snip(name)}<figcaption>${cap}</figcaption></figure>`;

// annotated screenshot: image is 1124 x 1112 CSS px (Okto MultiWave Synth beta 0.3: the 1100 x 1050 panel, 12 px margin, status bar), device panel at offset (12,12)
function annotated(img, alt, pins) {
  const pct = (v, tot) => (Math.round(v / tot * 10000) / 100) + '%';
  let h = `<div class="annot"><img src="img/${img}" alt="${alt}">`;
  pins.forEach((p, i) => { h += `<a class="pin" href="#${p.href}" style="left:${pct(12 + p.x, 1124)};top:${pct(12 + p.y, 1112)}" title="${p.title}">${i + 1}</a>`; });
  h += '</div>';
  let lg = '<ol class="legend">';
  pins.forEach((p, i) => { lg += `<li><span class="no">${i + 1}</span><span><b><a href="#${p.href}">${p.title}</a></b> — ${p.desc}</span></li>`; });
  return { image: h, legend: lg + '</ol>' };
}

const ICON = {
  a: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2316191f'/%3E%3Cpath d='M4 16h5l3-9 4 18 4-13 3 7h5' fill='none' stroke='%232fd4c6' stroke-width='2.6' stroke-linejoin='round' stroke-linecap='round'/%3E%3C/svg%3E",
  b: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2316191f'/%3E%3Cpath d='M4 16h5l3-9 4 18 4-13 3 7h5' fill='none' stroke='%23ffae42' stroke-width='2.6' stroke-linejoin='round' stroke-linecap='round'/%3E%3C/svg%3E",
};
const MARK = c => `<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><path d="M3 16h5l3-9 4 18 4-13 3 7h7" fill="none" stroke="${c}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;

// sections: [{id, num, title, html, subs:[{id,title}]}]
function page(o) {
  const E = o.engine, other = E === 'a' ? 'b' : 'a';
  let toc = `<aside class="toc"><a class="brand" href="#top"><span class="mark">${MARK(E === 'a' ? '#2fd4c6' : '#ffae42')}</span><span><b>OKTOMULTIWAVE</b><span>MANUAL ${E.toUpperCase()}</span></span></a>`;
  toc += `<a class="switch to-${other}" href="manual-${other}.html">Other oscillators<strong>${other === 'a' ? 'Manual A · Subtractive A1 A2' : 'Manual B · Additive B1'} →</strong></a>`;
  toc += '<nav aria-label="Contents"><div class="toc-title">CONTENTS</div><ol>';
  for (const s of o.sections) {
    toc += `<li><a href="#${s.id}"><span class="n">${o.sections.indexOf(s) + 1}</span>${s.title}</a>`;
    if (s.subs && s.subs.length) toc += '<ol>' + s.subs.map(x => `<li><a href="#${x.id}">${x.title}</a></li>`).join('') + '</ol>';
    toc += '</li>';
  }
  toc += '</ol></nav></aside>';
  let body = o.hero;
  o.sections.forEach((s, k) => { body += `<section id="${s.id}"><h2><span class="num">${k + 1}</span>${s.title}</h2>${s.html}</section>`; });
  body += o.footer;
  const js = `<script>
(function () {
  // Highlight the current section in the sidebar (optional enhancement).
  var links = {}, cur = null;
  document.querySelectorAll('.toc nav > ol > li > a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting && links[e.target.id]) { if (cur) cur.classList.remove('active'); cur = links[e.target.id]; cur.classList.add('active'); }
    });
  }, { rootMargin: '0px 0px -75% 0px' });
  document.querySelectorAll('main section[id]').forEach(function (s) { io.observe(s); });
})();
</script>`;
  return `<!doctype html>
<!-- Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre). SPDX-License-Identifier: GPL-3.0-or-later -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${o.title}</title>
<meta name="description" content="${o.description}">
<link rel="icon" href="${ICON[E]}">
<link rel="stylesheet" href="manual.css">
</head>
<body class="eng-${E}">
<div class="layout">
${toc}
<main id="top"><div class="content">
${body}
</div></main>
</div>
${js}
<script>if (window.parent !== window) { try { window.parent.postMessage({ wsManual: '${E}' }, '*'); } catch (e) {} }</script>
</body>
</html>
`;
}

module.exports = { ROOT, SPEC, C, PK, rangeOf, defOf, hostOf, shortOf, ctl, kbd, val, P, controls, table, callout, tip, note, warn, deep, snip, fig, figInline, annotated, page };
