// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// OktoWave: the demo VOTE, a TEST build that is not part of the released app (tools/make_vote_build.js copies web/ and adds this file). The owner listens to the 30 presets of the demo, one
// phrase of the piece each (8 beats, 3.6 s), and rates each one from 1 to 10 stars in a small window that opens at the end of the phrase, before the preset changes:
//   - 8 stars or more: nothing changes (so do 5, 6 and 7: the owner's rule is "above 7 keep, 10 move, under 5 replace");
//   - 10 stars: the window offers to move that preset to the start of the demo and asks at which position;
//   - under 5 stars: five other presets are offered, each one can be listened to on the same phrase, and the owner chooses the one that is right ("5 more" gives five others);
//   - when the 30 are done: a summary, then the whole demo is played again with the new list (continuous, as the real demo) with an ACCEPT button;
//   - SEND REPORT posts the list of presets of every part to the owner's Google Form (the fields of the form: FORM below); COPY and DOWNLOAD are there if the post cannot be trusted.
// The page keeps its progress in localStorage (resume where it stopped). WS_VOTE is the test hook (tests/web/test_vote.js).
(function () {
  'use strict';
  const FORM = { url: 'https://docs.google.com/forms/d/e/1FAIpQLSdqkWNwanzcDDURcKepEK_U1P8b_HyR8B5_Gk48xtuQOYHqgQ/formResponse', report: 'entry.79964320', setup: 'entry.15088103' };
  const STORE = 'oktowave.vote.v1';
  const LEAD = 0.4;          // s between the load of a preset and the first note of its phrase (its tables are built meanwhile)
  const TAIL = 0.12;         // s the notes of a phrase are held past its end (the sound's own release does the rest)
  const NALT = 5;            // alternatives offered under 5 stars
  const KEYWORDS = [[/\bbass\b|\bsub\b/, 'Bass'], [/\bpad\b|\bcloud\b|\bwash\b|\baurora\b|\bchoir\b/, 'Pad'], [/\bstrings?\b|\bcello\b|\bsection\b/, 'Strings'], [/\bbrass\b|\bflute\b|\bwind\b/, 'Brass & Wind'],
    [/\borgan\b/, 'Organ'], [/\bkalimba\b|\bbell\b|\bbells\b|\bpick\b|\bpluck\b/, 'Bells & Mallets'], [/\blead\b|\bsiren\b|\bsweep\b/, 'Lead']];

  window.WSVote = function (api, demo, hooks) {
    const SPEC = WS_SPEC, SONG = WS_DEMO_SONGS[0], DATA = window.WS_VOTE_DATA || { trim: {} };
    for (const n in DATA.trim) if (!(n in SPEC.DEMO_TRIM)) SPEC.DEMO_TRIM[n] = DATA.trim[n];   // the trims of the presets that are not in the tour (tools/demo_trim_all.js)
    const ORIG = SPEC.TOUR.slice(), plan = demo.tourPlan(ORIG), N = plan.length;
    const $ = (id) => document.getElementById(id);
    const h = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

    // ---------------------------------------------------------------- state (saved after every decision)
    const fresh = () => ({ v: 1, orig: ORIG.slice(), stars: {}, moved: {}, replaced: {}, cand: {}, k: 0, accepted: false, sent: 0 });
    function load() {
      try {
        const s = JSON.parse(localStorage.getItem(STORE) || 'null');
        if (s && s.v === 1 && JSON.stringify(s.orig) === JSON.stringify(ORIG)) return s;
      } catch (e) { /* no storage: start fresh */ }
      return null;
    }
    let S = load() || fresh();
    const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* private window */ } };
    let phase = 'closed';      // closed | start | listen | rate | ten | alt | summary | replay | replaydone | accepted
    let token = 0, altList = [], playingAlt = '', fast = false, saved = null, sendStatus = '', timer = 0, listenStart = 0, listenLen = 0, scenePlaying = '';

    const currentName = (k) => S.replaced[k] || S.orig[k];
    const decision = (k) => (S.stars[k] === undefined ? '' : S.moved[k] ? `moved to position ${S.moved[k]}` : S.replaced[k] ? `replaced by ${S.replaced[k]}` : 'kept');
    function finalOrder() {   // the replacements keep their place, the 10-star presets go where the owner said (inserted in order of position, so each lands where asked)
      const base = S.orig.map((n, k) => S.replaced[k] || n), moves = [];
      base.forEach((n, k) => { if (S.moved[k]) moves.push({ n, p: S.moved[k], k }); });
      const out = base.filter((_, k) => !S.moved[k]);
      moves.sort((a, b) => a.p - b.p || a.k - b.k).forEach((m) => out.splice(Math.min(out.length, Math.max(0, m.p - 1)), 0, m.n));
      return out;
    }

    // ---------------------------------------------------------------- the music of a phrase
    const phraseStart = (k) => plan[k].chord, phraseEnd = (k) => (k + 1 < N ? plan[k + 1].chord : SONG.duration);
    function phraseNotes(k) {   // the notes that start in phrase k, from time 0, held at most TAIL past its end
      const a = phraseStart(k), b = phraseEnd(k), n = SONG.notes, out = [];
      for (let i = 0; i < n.length; i += 4) {
        const t = n[i];
        if (t < a - 0.001 || (k + 1 < N && t >= b - 0.001)) continue;
        out.push(+(t - a).toFixed(4), +Math.max(0.03, Math.min(n[i + 1], b - t + TAIL)).toFixed(4), n[i + 2], n[i + 3]);
      }
      return out;
    }
    // plays phrase k with a preset (the preset is loaded first, the notes start LEAD s later); resolves when the phrase is over, false if another call took over
    async function listen(k, name) {
      const my = ++token;
      scenePlaying = name; listenStart = performance.now() + LEAD * 1000; listenLen = phraseEnd(k) - phraseStart(k) + TAIL;
      if (fast) { await sleep(0.01); return my === token; }
      api.post({ t: 'seqstop' }); api.post({ t: 'alloff' });
      api.applyPreset(name, demo.rules(name));
      api.setPresetLabel(name, false);
      api.post({ t: 'seq', notes: phraseNotes(k), delay: LEAD });
      await sleep(LEAD + listenLen + 0.3);
      return my === token;
    }
    function silence() { token++; api.post({ t: 'seqstop' }); api.post({ t: 'alloff' }); }

    // ---------------------------------------------------------------- the alternatives
    function category(name) {
      const p = SPEC.PRESETS.find((x) => x.name === name);
      if (p) return p.cat;
      const w = name.toLowerCase().replace(/^[ab]+ · /, '');
      const hit = KEYWORDS.find(([re]) => re.test(w));
      return hit ? hit[1] : null;
    }
    function nextAlternatives(k) {   // five presets of the factory list not in the demo and not offered yet: the same kind of sound first, the best ranked first
      const used = new Set([...S.orig, ...Object.values(S.replaced)]); for (const kk in S.cand) S.cand[kk].forEach((n) => used.add(n));
      const cat = category(currentName(k)), pool = SPEC.PRESETS.filter((p) => !used.has(p.name)).sort((a, b) => a.rank - b.rank);
      const same = cat ? pool.filter((p) => p.cat === cat) : [];
      return same.concat(pool.filter((p) => !same.includes(p))).slice(0, NALT).map((p) => p.name);
    }
    function offerAlternatives(k) {
      altList = nextAlternatives(k); S.cand[k] = (S.cand[k] || []).concat(altList); save();
    }

    // ---------------------------------------------------------------- the report
    function report() {
      const fin = finalOrder(), L = [];
      L.push(`OKTOWAVE DEMO VOTE REPORT (test build ${WS_SPEC.APP.version}) - ${new Date().toISOString()}`);
      L.push('Rule: 8+ keep, 10 move to the position asked, under 5 replace (5 alternatives heard). 5, 6, 7 keep. Stars 0 = skipped.');
      L.push(`Parts (one phrase of 8 beats each): ${N}. Accepted after the replay: ${S.accepted ? 'YES' : 'no'}.`, '');
      L.push('PART | ORIGINAL PRESET | STARS | DECISION | HEARD AS ALTERNATIVES');
      for (let k = 0; k < N; k++) L.push(`${k + 1} | ${S.orig[k]} | ${S.stars[k] === undefined ? '-' : S.stars[k]} | ${decision(k) || 'not heard'} | ${(S.cand[k] || []).join(', ')}`);
      L.push('', 'FINAL DEMO ORDER:');
      fin.forEach((n, i) => L.push(`${i + 1}. ${n}`));
      L.push('', 'JSON: ' + JSON.stringify({ stars: S.orig.map((n, k) => ({ part: k + 1, preset: n, stars: S.stars[k] === undefined ? null : S.stars[k], moved: S.moved[k] || null, replaced: S.replaced[k] || null, heard: S.cand[k] || [] })), final: fin, accepted: S.accepted }));
      return L.join('\n');
    }
    async function sendReport() {
      sendStatus = 'sending'; render();
      const body = new URLSearchParams(); body.set(FORM.report, report()); body.set(FORM.setup, 'OktoWave demo vote test build ' + WS_SPEC.APP.version);
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
      const a = h('a', '', document.body); a.href = URL.createObjectURL(new Blob([report()], { type: 'text/plain' })); a.download = 'oktowave-demo-vote-report.txt'; a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      sendStatus = 'downloaded'; render();
    }

    // ---------------------------------------------------------------- the flow
    async function begin(fresh0) {
      if (demo.running()) demo.stop();
      await hooks.resumeAudio();
      if (fresh0) { S = fresh(); save(); }
      if (!saved) saved = api.snapshot();
      if ($('vote-btn')) $('vote-btn').disabled = true;
      if (S.k >= N) { phase = S.accepted ? 'accepted' : 'summary'; render(); return; }
      playScene(S.k);
    }
    async function playScene(k) {
      S.k = k; save(); phase = 'listen'; render();
      const ok = await listen(k, currentName(k));
      if (ok && phase === 'listen') { phase = 'rate'; render(); }
    }
    function rate(n) {
      if (phase !== 'rate' && phase !== 'listen') return;
      silence();
      S.stars[S.k] = n; delete S.moved[S.k]; delete S.replaced[S.k]; save();
      if (n === 10) phase = 'ten';
      else if (n < 5) { offerAlternatives(S.k); phase = 'alt'; }
      else next();
      render();
    }
    function skip() { silence(); next(); }
    function next() {
      silence();
      if (S.k + 1 >= N) { S.k = N; save(); phase = 'summary'; render(); return; }
      playScene(S.k + 1);
    }
    function setPosition(p) { p = Math.round(+p); if (!(p >= 1 && p <= N)) return false; S.moved[S.k] = p; save(); next(); return true; }
    function chooseAlt(name) { S.replaced[S.k] = name; save(); next(); }
    async function listenAlt(name) {
      playingAlt = name; render();
      const ok = await listen(S.k, name);
      if (ok) { playingAlt = ''; render(); }
    }
    async function replayWhole() {
      silence(); phase = 'replay'; render();
      await demo.start({ tour: finalOrder() });
      clearInterval(timer);
      timer = setInterval(() => { if (!demo.running()) { clearInterval(timer); if (phase === 'replay') { phase = 'replaydone'; render(); } } }, 250);
    }
    function stopReplay() { clearInterval(timer); demo.stop(); phase = 'summary'; render(); }
    function accept() { clearInterval(timer); if (demo.running()) demo.stop(); S.accepted = true; save(); phase = 'accepted'; render(); }
    function closeAll() {
      clearInterval(timer); silence(); if (demo.running()) demo.stop();
      if (saved) { api.restore(saved); saved = null; }
      phase = 'closed'; if ($('vote-btn')) $('vote-btn').disabled = false; render();
    }

    // ---------------------------------------------------------------- the window
    const dev = $('device');
    const win = h('div', 'vote-win', dev), bar = h('div', 'vote-bar', document.body);
    const btn = h('button', 'hbtn vote-btn', dev, '&#9733; VOTE'); btn.id = 'vote-btn'; btn.title = 'Rate the presets of the demo, one phrase of the music each (test version)';
    btn.onclick = (e) => { e.stopPropagation(); open(); };
    function place() {   // as the demo's window: as far right as the page allows
      const d = dev.getBoundingClientRect(), s = api.ui.scale || 1, listOn = !!(api.ui.browser && api.ui.bOpen), contentW = 1100 + (listOn ? 360 : 0);
      const free = Math.max(0, (document.documentElement.clientWidth - (d.left + contentW * s)) / s), edge = contentW + free - 8, w = listOn ? Math.min(386, edge - 1104) : 386;
      return { w, left: edge - w };
    }
    function open() {
      if (phase !== 'closed') return;
      phase = 'start'; render();
    }
    const dots = () => { let o = ''; for (let k = 0; k < N; k++) { const st = S.stars[k]; o += `<i class="${st === undefined ? '' : st === 10 ? 'ten' : st >= 8 ? 'good' : st >= 5 ? 'mid' : 'low'}${k === S.k && (phase === 'listen' || phase === 'rate' || phase === 'ten' || phase === 'alt') ? ' cur' : ''}"></i>`; } return `<div class="vote-dots">${o}</div>`; };
    const stars = () => { let o = ''; for (let n = 1; n <= 10; n++) o += `<button class="vote-star" data-act="rate" data-v="${n}" title="${n} / 10 (key ${n % 10})">&#9733;</button>`; return `<div class="vote-stars">${o}</div><div class="vote-hint">click a star, or press 1 to 9 and 0 for 10</div>`; };
    function body() {
      const k = S.k, name = k < N ? currentName(k) : '', head = `<div class="vote-sec">PART ${Math.min(k + 1, N)} / ${N}</div><div class="vote-name">${esc(name)}</div>`;
      switch (phase) {
        case 'start': {
          const done = Object.keys(S.stars).length, started = done > 0 || S.k > 0;
          return `<div class="vote-title">Rate the presets of the demo</div><p>The demo plays one phrase of Beethoven per preset (${N} parts). When a phrase ends, give the preset 1 to 10 stars.
            <b>8 or more</b>: nothing changes. <b>10</b>: you say where it goes in the demo. <b>Under 5</b>: five other presets are offered and you pick the right one. At the end the whole demo is played again for you to accept.</p>
            ${started ? `<div class="vote-row"><button class="vote-btn2 main" data-act="resume">Continue at part ${Math.min(S.k + 1, N)}</button><button class="vote-btn2" data-act="restart">Start over</button></div>`
              : '<div class="vote-row"><button class="vote-btn2 main" data-act="restart">Start</button></div>'}<div class="vote-row"><button class="vote-btn2" data-act="close">Close</button></div>`;
        }
        case 'listen': return `${head}<div class="vote-line">listening to the phrase&hellip; <span id="vote-t"></span></div><div class="vote-prog"><i id="vote-p"></i></div>${dots()}<div class="vote-row"><button class="vote-btn2" data-act="close">Stop the vote</button></div>`;
        case 'rate': return `${head}<div class="vote-line">How do you rate this preset?</div>${stars()}${dots()}<div class="vote-row"><button class="vote-btn2" data-act="again">&#9654; Listen again</button><button class="vote-btn2" data-act="skip">Skip</button><button class="vote-btn2" data-act="close">Stop the vote</button></div>`;
        case 'ten': return `${head}<div class="vote-line">10 stars: a favourite. Put it at the start of the demo?</div><div class="vote-row">Position in the demo (1 = first, ${N} = last): <input id="vote-pos" type="number" min="1" max="${N}" value="1"></div>
          <div class="vote-row"><button class="vote-btn2 main" data-act="move">Move it there</button><button class="vote-btn2" data-act="keep">Keep it where it is</button></div>${dots()}`;
        case 'alt': {
          const rows = altList.map((n, i) => `<div class="vote-alt"><span class="vote-an">${esc(n)}<small>${esc(category(n) || '')}</small></span><button class="vote-btn2${playingAlt === n ? ' on' : ''}" data-act="hear" data-v="${i}">${playingAlt === n ? '&#9835; playing' : '&#9654; Listen'}</button><button class="vote-btn2 main" data-act="choose" data-v="${i}">Take it</button></div>`).join('');
          return `${head}<div class="vote-line">${S.stars[k]} stars: five other presets to try on this phrase</div>${rows || '<p>No more presets to offer.</p>'}<div class="vote-row"><button class="vote-btn2" data-act="more">5 more</button><button class="vote-btn2" data-act="original">Keep the original</button><button class="vote-btn2" data-act="again">&#9654; Original again</button></div>`;
        }
        case 'summary': case 'accepted': case 'replaydone': {
          const fin = finalOrder(), rows = S.orig.map((n, i) => `<tr class="${S.stars[i] === undefined ? '' : S.stars[i] >= 8 ? 'g' : S.stars[i] >= 5 ? 'm' : 'l'}"><td>${i + 1}</td><td>${esc(S.replaced[i] || n)}</td><td>${S.stars[i] === undefined ? '-' : S.stars[i] + '&#9733;'}</td><td>${esc(decision(i))}</td></tr>`).join('');
          const finRows = fin.map((n, i) => `<li>${esc(n)}</li>`).join('');
          const st = { sending: 'sending&hellip;', sent: '&#10003; sent to the form (the page cannot read the answer back: if in doubt use Copy or Download)', failed: 'could not send: use Copy or Download', copied: '&#10003; copied', downloaded: '&#10003; downloaded', 'copy failed': 'copy failed: use Download' }[sendStatus] || (S.sent ? 'already sent once' : '');
          const top = phase === 'accepted' ? '<div class="vote-title ok">&#10003; Demo accepted</div>' : phase === 'replaydone' ? '<div class="vote-title">That was the new demo. Accept it?</div>' : '<div class="vote-title">Vote finished</div>';
          const acts = phase === 'summary' ? '<button class="vote-btn2 main" data-act="replay">&#9654; Listen to everything again</button>' : phase === 'replaydone' ? '<button class="vote-btn2 main" data-act="accept">&#10003; Accept</button><button class="vote-btn2" data-act="replay">&#9654; Again</button>' : '<button class="vote-btn2" data-act="replay">&#9654; Listen again</button>';
          return `${top}<div class="vote-scroll"><table class="vote-tab"><tr><th>#</th><th>preset</th><th></th><th></th></tr>${rows}</table><div class="vote-sub">New order of the demo</div><ol class="vote-fin">${finRows}</ol></div>
            <div class="vote-row">${acts}</div><div class="vote-row"><button class="vote-btn2 main" data-act="send">Send report</button><button class="vote-btn2" data-act="copy">Copy</button><button class="vote-btn2" data-act="download">Download</button></div><div class="vote-status">${st}</div>
            <div class="vote-row"><button class="vote-btn2" data-act="restart">Start over</button><button class="vote-btn2" data-act="close">Close</button></div>`;
        }
        default: return '';
      }
    }
    function render() {
      if (phase === 'closed') { win.style.display = 'none'; bar.style.display = 'none'; return; }
      if (phase === 'replay') {
        win.style.display = 'none'; bar.style.display = 'flex';
        bar.innerHTML = '<span>Replay of the new demo</span><button class="vote-btn2 main" data-act="accept">&#10003; Accept</button><button class="vote-btn2" data-act="stopreplay">Stop</button>';
        return;
      }
      bar.style.display = 'none';
      const p = place(); win.style.width = p.w + 'px'; win.style.left = p.left + 'px'; win.style.display = 'block';
      win.innerHTML = `<div class="vote-bar1"><span>DEMO VOTE &middot; test version</span></div><div class="vote-body">${body()}</div>`;
    }
    const act = {
      restart: () => { S = fresh(); save(); sendStatus = ''; begin(false); }, resume: () => begin(false), close: closeAll,
      rate: (v) => rate(+v), again: () => { phase = 'listen'; render(); listen(S.k, currentName(S.k)).then((ok) => { if (ok && phase === 'listen') { phase = 'rate'; render(); } }); },
      skip, keep: () => next(), move: () => { const v = $('vote-pos'); if (!setPosition(v && v.value)) { if (v) v.classList.add('bad'); } },
      hear: (i) => listenAlt(altList[+i]), choose: (i) => chooseAlt(altList[+i]), more: () => { offerAlternatives(S.k); render(); }, original: () => next(),
      replay: replayWhole, stopreplay: stopReplay, accept, send: sendReport, copy: copyReport, download: downloadReport,
    };
    const onClick = (e) => { const b = e.target.closest('[data-act]'); if (!b) return; e.stopPropagation(); const f = act[b.dataset.act]; if (f) f(b.dataset.v); };
    win.addEventListener('click', onClick); bar.addEventListener('click', onClick);
    win.addEventListener('pointerdown', (e) => e.stopPropagation());
    // 1 to 9 and 0 rate while the window asks (the digits play notes otherwise)
    window.addEventListener('keydown', (e) => {
      if ((phase !== 'rate' && phase !== 'listen') || e.ctrlKey || e.metaKey || e.altKey || !/^[0-9]$/.test(e.key)) return;
      e.stopImmediatePropagation(); e.preventDefault(); rate(e.key === '0' ? 10 : +e.key);
    }, true);
    // the progress of the phrase being listened to
    (function tickLoop() {
      if (phase === 'listen') {
        const p = $('vote-p'), t = $('vote-t');
        if (p) { const x = Math.max(0, Math.min(1, (performance.now() - listenStart) / (listenLen * 1000))); p.style.width = (100 * x) + '%'; if (t) t.textContent = (x * listenLen).toFixed(1) + ' s'; }
      }
      requestAnimationFrame(tickLoop);
    })();
    // the welcome window's box
    const wv = $('w-vote'); if (wv) wv.onclick = () => { phase = 'closed'; hooks.resumeAudio().then(() => open()); };

    // test hook (tests/web/test_vote.js); window.WS_VOTE, not WS_TEST: app.js assigns WS_TEST after this runs
    window.WS_VOTE = {
      state: () => ({ phase, k: S.k, stars: Object.assign({}, S.stars), moved: Object.assign({}, S.moved), replaced: Object.assign({}, S.replaced), cand: JSON.parse(JSON.stringify(S.cand)), alt: altList.slice(), accepted: S.accepted, n: N, final: finalOrder(), sendStatus }),
      open, fast: (on) => { fast = !!on; }, rate, skip, setPosition, chooseAlt, more: () => act.more(), listenAlt, replayWhole, accept, report, sendReport, closeAll, phraseNotes, plan: () => plan.map((x) => ({ chord: x.chord, preset: x.preset })),
      reset: () => { S = fresh(); save(); },
    };
  };
})();
