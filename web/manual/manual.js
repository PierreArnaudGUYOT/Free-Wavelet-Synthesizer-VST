// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre). SPDX-License-Identifier: LicenseRef-OktoWave (all rights reserved, see LICENSE)
// The navigation of the manual, built from ONE list: to add, rename or reorder a page, edit PAGES below (and nothing else but the page's own file).
(function () {
  'use strict';
  // [file, label, group]; the order is the reading order of the "next" / "previous" buttons
  var PAGES = [
    ['manual.html', 'Contents', ''],
    ['wavelets.html', 'Wavelets', 'Idea'],
    ['subtractive-1.html', '1 · The oscillator', 'Subtractive'],
    ['subtractive-2.html', '2 · Filter and window', 'Subtractive'],
    ['subtractive-3.html', '3 · Making it move', 'Subtractive'],
    ['additive-1.html', '1 · Drawbars and patterns', 'Additive'],
    ['additive-2.html', '2 · Atoms and scalogram', 'Additive'],
    ['additive-3.html', '3 · Playing with the others', 'Additive']
  ];
  var here = (location.pathname.split('/').pop() || 'manual.html').toLowerCase();
  var cur = -1;
  PAGES.forEach(function (p, i) { if (p[0] === here) cur = i; });
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function link(i, cls, html) { var a = el('a', cls, html); a.href = PAGES[i][0]; if (i === cur) a.setAttribute('aria-current', 'page'); return a; }

  var main = document.querySelector('main');
  if (!main) return;
  var nav = el('nav', 'mnav'); nav.setAttribute('aria-label', 'Manual pages');
  var brand = el('a', 'brand', 'OKTO<span>WAVE</span>'); brand.href = 'manual.html'; nav.appendChild(brand);
  var lastGroup = null;
  PAGES.forEach(function (p, i) {
    if (i === 0) { nav.appendChild(link(i, 'pill', 'Contents')); return; }
    if (p[2] !== lastGroup) { nav.appendChild(el('span', 'grp', p[2])); lastGroup = p[2]; }
    nav.appendChild(link(i, 'pill', p[1]));
  });
  main.insertBefore(nav, main.firstChild);

  if (cur >= 0) {
    var pager = el('div', 'pager');
    if (cur > 0) pager.appendChild(link(cur - 1, 'prev', '<small>← Previous</small>' + PAGES[cur - 1][1]));
    if (cur < PAGES.length - 1) pager.appendChild(link(cur + 1, 'next', '<small>Next →</small>' + PAGES[cur + 1][1]));
    var foot = main.querySelector('footer');
    main.insertBefore(pager, foot || null);
  }
})();
