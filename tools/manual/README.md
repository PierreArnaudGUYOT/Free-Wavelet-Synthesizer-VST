# Manual generator

Builds the two user manuals of Okto MultiWave Synth in `web/manual/` from the project's single source of truth, so the control
tables (ranges, defaults, host names), the preset tables and every plot follow `tools/spec.js` and `web/js/core.js`
automatically: Manual A (the subtractive oscillators A1 A2) and Manual B (the additive oscillator B1). Both open with the chapter
"What this synthesizer is, and what wavelets are" (`introChapter` in `mw.js`, with its three figures from `figs.js`); the presets
chapter and its tables are computed from the final list (237 presets), and the presets the text cites are picked by their values
(`pick()` in `mw.js`), never by name.

```bash
node tools/gen_spec.js            # only if tools/spec.js changed (the manuals read web/js/spec.js)
node tools/manual/build.js a b    # regenerate manual-a.html, manual-b.html and the SVG figures in web/manual/img/
node tools/manual/shots.js        # re-capture the UI screenshots (PNG) with headless Edge (muted); set EDGE=... if needed
```

After a panel layout change, run `shots.js` and check the numbered callouts on the panel screenshots (the `pins` of `mw.js`, in
panel coordinates of `tools/spec.js`).

| File | Contents |
|---|---|
| `build.js` | entry point: writes `web/manual/manual-a.html` and `manual-b.html` |
| `mw.js` | the text: both manuals share their chapters; the oscillator-specific one (tone) and the controls tables follow the kind |
| `lib.js` | helpers: spec-driven control tables, callouts, annotated screenshot, page shell and sidebar |
| `figs.js` | figures computed with `core.js` (SVG files in `web/manual/img/` + the inline diagrams) |
| `top_desc.js` | descriptions of the TOP Sounds that come from the Wavelet Synthesizer (the other presets carry theirs in the spec) |
| `shots.js`, `cdp.js` | screenshot capture through the Chrome DevTools Protocol (no dependencies) |

The stylesheet `web/manual/manual.css` is hand-written. Edit the text in these scripts, not in the generated HTML. The deeper theory of
the wavelet engines is in the Wavelet Synthesizer's own manuals (linked from the "More" chapter).
