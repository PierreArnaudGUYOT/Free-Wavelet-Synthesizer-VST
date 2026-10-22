// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// OktoWave: RATE THE DEMO, a TEST build that is not part of the released app (tools/make_rate_build.js copies web/ and adds this file; it uses the vote build's hook in app.js,
// window.WSVote). Version 1.0.13, the owner's request: "the best sounds are not at the start of the demo": he starts the demo and, while it plays, gives each preset 1 to 10 stars;
// at the end the page works out a new order of the demo:
//   - the first half of the tour (parts 1 to 15) is the start; a preset of the start rated UNDER 5 changes places with a preset of the second half (parts 16 to 30) rated ABOVE 5,
//     the best rated first (the best one goes to the first place to fill); 5 exactly, and a preset not rated, stay where they are;
//   - he listens to the whole demo again in the new order, presses ACCEPT, and SEND REPORT posts the ratings and the new order to his Google Form (COPY / DOWNLOAD as well).
// The page keeps the ratings in localStorage (resume, edit). WS_RATE is the test hook (tests/web/test_rate.js).
(function () {
  'use strict';
  const FORM = { url: 'https://docs.google.com/forms/d/e/1FAIpQLSdqkWNwanzcDDURcKepEK_U1P8b_HyR8B5_Gk48xtuQOYHqgQ/formResponse', report: 'entry.79964320', setup: 'entry.15088103' };
  const STORE = 'oktowave.rate.v1';
  const LOOPS = 4;     // the owner: "chaque preset joue 4 fois sa boucle, ça me laissera plus de temps pour voter": each preset plays its phrase 4 times while it is rated
  const TAIL = 0.12;   // s a note may ring past the end of its phrase (the next repeat starts with its own notes)

  // the new order: the start's presets under 5 change places with the second half's presets above 5, the best rated first
  function newOrder(orig, stars) {
    const n = orig.length, half = Math.floor(n / 2), out = orig.slice(), swaps = [];
    const bad = [], good = [];
    for (let k = 0; k < half; k++) if (stars[k] !== undefined && stars[k] < 5) bad.push(k);
    for (let k = half; k < n; k++) if (stars[k] !== undefined && stars[k] > 5) good.push(k);
    good.sort((a, b) => stars[b] - stars[a] || a - b);
    for (let i = 0; i < Math.min(bad.length, good.length); i++) {
      const a = bad[i], b = good[i];
      out[a] = orig[b]; out[b] = orig[a];
      swaps.push({ from: b, to: a, up: orig[b], down: orig[a] });
    }
    return { order: out, swaps };
  }

  window.WSVote = function (api, demo, hooks) {
    const SPEC = WS_SPEC;
    const ORIG = SPEC.TOUR.slice(), N = demo.tourPlan(ORIG).length;
    const $ = (id) => document.getElementById(id);
    const h = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const tourName = (k) => ORIG[k % ORIG.length];

    const fresh = () => ({ v: 1, orig: ORIG.slice(), stars: {}, accepted: false, sent: 0 });
    function load() {
      try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && s.v === 1 && JSON.stringify(s.orig) === JSON.stringify(ORIG)) return s; } catch (e) { /* none */ }
      return null;
    }
    let S = load() || fresh();
    const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* private window */ } };
    let phase = 'closed';   // closed | start | playing | summary | replay | replaydone | accepted
    let timer = 0, sendStatus = '', saved = null, lastScene = -1;

    const result = () => newOrder(S.orig, S.stars);
    const sceneNow = () => { const st = demo.state(); return st.running && st.scene >= 0 ? st.scene : -1; };

    // the piece with each preset's phrase played LOOPS times (the order of the tour, the same phrases as the demo): the notes that start in the phrase, cut TAIL past its end
    const SONG = WS_DEMO_SONGS[0], PLAN = demo.tourPlan(ORIG);
    const LOOPED = (() => {
      const notes = [], scenes = [], blocks = [], n = SONG.notes;
      let t = 0;
      for (let k = 0; k < N; k++) {
        const a = PLAN[k].chord, b = k + 1 < N ? PLAN[k + 1].chord : SONG.duration, len = b - a;
        scenes.push({ chord: t, preset: ORIG[k] }); blocks.push({ start: t, len });
        for (let r = 0; r < LOOPS; r++) {
          for (let i = 0; i < n.length; i += 4) {
            if (n[i] < a - 0.001 || n[i] >= b - 0.001) continue;
            notes.push(+(t + n[i] - a).toFixed(4), +Math.max(0.03, Math.min(n[i + 1], b - n[i] + TAIL)).toFixed(4), n[i + 2], n[i + 3]);
          }
          t += len;
        }
      }
      return { song: Object.assign({}, SONG, { notes, duration: t }), scenes, blocks };
    })();
    const loopNow = (k) => { const st = demo.state(); if (!st.running || k < 0) return 0; const b = LOOPED.blocks[k]; return Math.max(1, Math.min(LOOPS, 1 + Math.floor((st.time - b.start) / b.len))); };

    // ---------------------------------------------------------------- the report
    function report() {
      const { order, swaps } = result(), L = [];
      L.push(`OKTOWAVE DEMO RATING REPORT (test build ${SPEC.APP.version} / ${SPEC.APP.versionNum}) - ${new Date().toISOString()}`);
      L.push('Rule: in parts 1-15 a preset rated under 5 changes places with a preset of parts 16-30 rated above 5, the best rated first; 5 and not rated stay.');
      L.push(`Parts: ${N}. Rated: ${Object.keys(S.stars).length}. Accepted after the replay: ${S.accepted ? 'YES' : 'no'}.`, '');
      L.push('PART | PRESET | STARS');
      for (let k = 0; k < N; k++) L.push(`${k + 1} | ${S.orig[k]} | ${S.stars[k] === undefined ? '-' : S.stars[k]}`);
      L.push('', 'CHANGES OF PLACE:');
      if (!swaps.length) L.push('none');
      swaps.forEach((s) => L.push(`${s.up} (part ${s.from + 1}, ${S.stars[s.from]} stars) -> part ${s.to + 1}; ${s.down} (${S.stars[s.to]} stars) -> part ${s.from + 1}`));
      L.push('', 'NEW DEMO ORDER:');
      order.forEach((n, i) => L.push(`${i + 1}. ${n}`));
      L.push('', 'JSON: ' + JSON.stringify({ stars: S.orig.map((n, k) => ({ part: k + 1, preset: n, stars: S.stars[k] === undefined ? null : S.stars[k] })), final: order, accepted: S.accepted }));
      return L.join('\n');
    }
    async function sendReport() {
      sendStatus = 'sending'; render();
      const body = new URLSearchParams(); body.set(FORM.report, report()); body.set(FORM.setup, 'OktoWave demo rating test build ' + SPEC.APP.versionNum);
      try { await fetch(FORM.url, { method: 'POST', mode: 'no-cors', body }); S.sent = Date.now(); save(); sendStatus = 'sent'; } catch (e) { sendStatus = 'failed'; }
      render();
    }
    async function copyReport() {
      const text = report();
      try { await navigator.clipboard.writeText(text); sendStatus = 'copied'; } catch (e) {
        const t = h('textarea', '', document.body); t.value = text; t.select(); try { document.execCommand('copy'); sendStatus = 'copied'; } catch (e2) { sendStatus = 'copy failed'; } t.remove();
      }
      render();
    }
    function downloadReport() {
      const a = h('a', '', document.body); a.href = URL.createObjectURL(new Blob([report()], { type: 'text/plain' })); a.download = 'oktowave-demo-rating-report.txt'; a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      sendStatus = 'downloaded'; render();
    }

    // ---------------------------------------------------------------- the flow
    function watch(onEnd) {   // follows the demo: the part playing, and its end
      clearInterval(timer);
      timer = setInterval(() => {
        const sc = sceneNow(), key = sc * 16 + (phase === 'playing' ? loopNow(sc) : 0);   // (a new part, or the next loop of the part: the bar says it)
        if (key !== lastScene) { lastScene = key; render(); }
        if (!demo.running()) { clearInterval(timer); onEnd(); }
      }, 150);
    }
    async function begin(restart) {
      if (demo.running()) demo.stop();
      await hooks.resumeAudio();
      if (restart) { S = fresh(); save(); sendStatus = ''; }
      if (!saved) saved = api.snapshot();
      phase = 'playing'; lastScene = -1; render();
      await demo.start({ song: LOOPED.song, scenes: LOOPED.scenes });
      watch(() => { if (phase === 'playing') { phase = 'summary'; render(); } });
    }
    function rate(n, k) {   // k: the part (the one playing by default)
      if (k === undefined) k = sceneNow();
      if (!(k >= 0 && k < N) || !(n >= 1 && n <= 10)) return false;
      S.stars[k] = n; S.accepted = false; save(); render();
      return true;
    }
    function stopPlaying() { clearInterval(timer); if (demo.running()) demo.stop(); phase = 'summary'; render(); }
    async function replay() {
      clearInterval(timer); if (demo.running()) demo.stop();
      phase = 'replay'; lastScene = -1; render();
      await demo.start({ tour: result().order });
      watch(() => { if (phase === 'replay') { phase = 'replaydone'; render(); } });
    }
    function accept() { clearInterval(timer); if (demo.running()) demo.stop(); S.accepted = true; save(); phase = 'accepted'; render(); }
    function closeAll() {
      clearInterval(timer); if (demo.running()) demo.stop();
      if (saved) { api.restore(saved); saved = null; }
      phase = 'closed'; render();
    }

    // ---------------------------------------------------------------- the window (a bar along the bottom while the demo plays, a card for the start and the summary)
    const dev = $('device');
    const card = h('div', 'rate-win', dev), bar = h('div', 'rate-bar', document.body);
    const btn = h('button', 'hbtn rate-btn', dev, '&#9733; RATE'); btn.title = 'Rate the presets of the demo while it plays (test version)';
    btn.onclick = (e) => { e.stopPropagation(); if (phase === 'closed') { phase = 'start'; render(); } };
    const starRow = (k, big) => {
      let o = '';
      for (let n = 1; n <= 10; n++) o += `<button class="rate-star${S.stars[k] >= n ? ' on' : ''}${big ? ' big' : ''}" data-act="rate" data-v="${n}" data-k="${k}" title="${n} / 10${big ? ' (key ' + (n % 10) + ')' : ''}">&#9733;</button>`;
      return `<span class="rate-stars">${o}</span><span class="rate-val">${S.stars[k] === undefined ? '-' : S.stars[k] + ' / 10'}</span>`;
    };
    const dots = (cur) => { let o = ''; for (let k = 0; k < N; k++) { const st = S.stars[k]; o += `<i class="${st === undefined ? '' : st > 5 ? 'good' : st === 5 ? 'mid' : 'low'}${k === cur ? ' cur' : ''}${k === Math.floor(N / 2) ? ' half' : ''}" title="part ${k + 1}: ${esc(tourName(k))}${st === undefined ? '' : ' · ' + st + ' / 10'}"></i>`; } return `<span class="rate-dots">${o}</span>`; };
    function cardBody() {
      if (phase === 'start') {
        const done = Object.keys(S.stars).length;
        return `<div class="rate-title">Rate the presets of the demo</div><p>The demo plays (${N} presets, one phrase of Beethoven each). While a preset plays, give it 1 to 10 stars in the bar at the bottom
          (click, or press 1 to 9 and 0 for 10). At the end: in the first half of the demo, a preset under 5 changes places with a preset of the second half above 5, the best first; you hear the new demo and accept it, then send the report.</p>
          <div class="rate-row"><button class="rate-b main" data-act="start">${done ? 'Play the demo again (your ' + done + ' ratings are kept)' : '&#9654; Play the demo'}</button>${done ? '<button class="rate-b" data-act="summary">See the result</button><button class="rate-b" data-act="restart">Start over</button>' : ''}</div>
          <div class="rate-row"><button class="rate-b" data-act="close">Close</button></div>`;
      }
      const { order, swaps } = result(), moved = new Set(); swaps.forEach((s) => { moved.add(s.from); moved.add(s.to); });
      const rows = S.orig.map((n, k) => `<tr class="${k === Math.floor(N / 2) ? 'half ' : ''}${S.stars[k] === undefined ? '' : S.stars[k] > 5 ? 'g' : S.stars[k] === 5 ? 'm' : 'l'}"><td>${k + 1}</td><td>${esc(n)}</td><td class="st">${starRow(k, false)}</td></tr>`).join('');
      const fin = order.map((n, i) => `<li class="${moved.has(i) ? 'mv' : ''}">${esc(n)}${moved.has(i) ? (i < Math.floor(N / 2) ? ' <b>&#8593;</b>' : ' <b>&#8595;</b>') : ''}</li>`).join('');
      const st = { sending: 'sending&hellip;', sent: '&#10003; sent to the form (the page cannot read the answer back: if in doubt use Copy or Download)', failed: 'could not send: use Copy or Download', copied: '&#10003; copied', downloaded: '&#10003; downloaded', 'copy failed': 'copy failed: use Download' }[sendStatus] || (S.sent ? 'already sent once' : '');
      const top = phase === 'accepted' ? '<div class="rate-title ok">&#10003; New demo accepted</div>' : phase === 'replaydone' ? '<div class="rate-title">That was the new demo. Accept it?</div>' : '<div class="rate-title">The ratings and the new order</div>';
      const acts = phase === 'replaydone' ? '<button class="rate-b main" data-act="accept">&#10003; Accept</button><button class="rate-b" data-act="replay">&#9654; Again</button>' : `<button class="rate-b${phase === 'summary' ? ' main' : ''}" data-act="replay">&#9654; Listen to the new demo</button>${phase === 'summary' ? '' : ''}`;
      return `${top}<div class="rate-line">${swaps.length} change${swaps.length === 1 ? '' : 's'} of place. You can still change a rating here.</div>
        <div class="rate-scroll"><table class="rate-tab"><tr><th>#</th><th>preset (as heard)</th><th>stars</th></tr>${rows}</table><div class="rate-sub">New order of the demo</div><ol class="rate-fin">${fin}</ol></div>
        <div class="rate-row">${acts}</div><div class="rate-row"><button class="rate-b main" data-act="send">Send report</button><button class="rate-b" data-act="copy">Copy</button><button class="rate-b" data-act="download">Download</button></div><div class="rate-status">${st}</div>
        <div class="rate-row"><button class="rate-b" data-act="start">Rate again while it plays</button><button class="rate-b" data-act="restart">Start over</button><button class="rate-b" data-act="close">Close</button></div>`;
    }
    function render() {
      if (phase === 'closed') { card.style.display = 'none'; bar.style.display = 'none'; btn.disabled = false; return; }
      btn.disabled = true;
      if (phase === 'playing' || phase === 'replay') {
        card.style.display = 'none'; bar.style.display = 'flex';
        const k = sceneNow();
        if (phase === 'replay') { bar.innerHTML = `<span class="rate-lab">New demo${k >= 0 ? ' &middot; part ' + (k + 1) + ' / ' + N : ''}</span>${dots(-1)}<button class="rate-b main" data-act="accept">&#10003; Accept</button><button class="rate-b" data-act="stopreplay">Stop</button>`; return; }
        // the owner: "un bouton revenir 5 s en arrière ... si je veux revenir sur ma décision" and "un bouton pause" (demo.js back / pause / resume)
        const ctl = `<button class="rate-b" data-act="back" title="5 seconds back: the part before plays again and its stars can be changed">&#9194; 5 s</button><button class="rate-b" data-act="pause">${demo.paused() ? '&#9654; Resume' : '&#10074;&#10074; Pause'}</button>`;
        bar.innerHTML = k < 0 ? `<span class="rate-lab">The demo starts&hellip;</span>${dots(-1)}<button class="rate-b" data-act="stop">Stop</button>`
          : `<span class="rate-lab">Part ${k + 1} / ${N} &middot; loop ${loopNow(k)} / ${LOOPS}<b>${esc(tourName(k))}</b></span>${starRow(k, true)}${ctl}${dots(k)}<button class="rate-b" data-act="stop">Stop</button>`;
        return;
      }
      bar.style.display = 'none'; card.style.display = 'block';
      card.innerHTML = `<div class="rate-bar1"><span>RATE THE DEMO &middot; test version</span></div><div class="rate-body">${cardBody()}</div>`;
    }
    const act = {
      start: () => begin(false), restart: () => begin(true), summary: () => { phase = 'summary'; render(); }, close: closeAll,
      rate: (v, k) => rate(+v, k === undefined ? undefined : +k), stop: stopPlaying, replay,
      back: () => { demo.back(5); lastScene = -2; render(); }, pause: () => { if (demo.paused()) demo.resume(); else demo.pause(); render(); }, stopreplay: () => { clearInterval(timer); if (demo.running()) demo.stop(); phase = 'summary'; render(); },
      accept, send: sendReport, copy: copyReport, download: downloadReport,
    };
    const onClick = (e) => { const b = e.target.closest('[data-act]'); if (!b) return; e.stopPropagation(); const f = act[b.dataset.act]; if (f) f(b.dataset.v, b.dataset.k); };
    card.addEventListener('click', onClick); bar.addEventListener('click', onClick);
    card.addEventListener('pointerdown', (e) => e.stopPropagation()); bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    // 1 to 9 and 0 rate the part playing (the digits play notes otherwise)
    window.addEventListener('keydown', (e) => {
      if (phase !== 'playing' || e.ctrlKey || e.metaKey || e.altKey || !/^[0-9]$/.test(e.key)) return;
      e.stopImmediatePropagation(); e.preventDefault(); rate(e.key === '0' ? 10 : +e.key);
    }, true);
    const wr = $('w-rate'); if (wr) wr.onclick = () => { hooks.resumeAudio().then(() => { phase = 'start'; render(); }); };

    // test hook (tests/web/test_rate.js)
    window.WS_RATE = {
      state: () => ({ phase, stars: Object.assign({}, S.stars), accepted: S.accepted, n: N, scene: sceneNow(), result: result() }),
      newOrder, rate, begin, stopPlaying, replay, accept, report, sendReport, closeAll, open: () => { phase = 'start'; render(); }, reset: () => { S = fresh(); save(); },
      back: () => act.back(), pause: () => act.pause(), time: () => { const st = demo.state(); return st.running ? st.time : -1; }, paused: () => demo.paused(),
    };
  };
})();
