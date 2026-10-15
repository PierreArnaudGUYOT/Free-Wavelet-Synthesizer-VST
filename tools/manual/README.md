# Manual generator

Builds the two user manuals in `web/manual/` from the project's single source of truth, so the control
tables (ranges, defaults, host names), the factory-preset tables, the sparsity counts and every plot
follow `tools/spec.js` and `web/js/core.js` automatically.

```bash
node tools/gen_spec.js            # only if tools/spec.js changed (the manuals read web/js/spec.js)
node tools/manual/build.js a b    # regenerate manual-a.html, manual-b.html and the SVG figures in web/manual/img/
node tools/manual/shots.js        # re-capture the UI screenshots (PNG) with headless Edge; set EDGE=... if needed
```

After a panel layout change, run `shots.js` and check the numbered callouts on the panel screenshots
(the `pins` arrays in `engA.js` / `engB.js`, in panel coordinates of `tools/spec.js`).

| File | Contents |
|---|---|
| `build.js` | entry point: writes `web/manual/manual-a.html` and `manual-b.html` |
| `lib.js` | helpers: spec-driven control tables, callouts, annotated screenshot, page shell and sidebar |
| `shared.js` | sections common to both manuals (filter, position, envelopes, LFO, voice, effects, playing, VST3, troubleshooting, glossary) |
| `engA.js`, `engB.js` | engine-specific text, recipes, preset descriptions, screenshot callouts |
| `figs.js` | figures computed with `core.js` (SVG files in `web/manual/img/` + the inline diagrams) |
| `shots.js`, `cdp.js` | screenshot capture through the Chrome DevTools Protocol (no dependencies) |

The stylesheet `web/manual/manual.css` is hand-written. Edit the text in these scripts, not in the generated HTML.
