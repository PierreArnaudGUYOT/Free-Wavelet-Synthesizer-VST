# CPU review of 1.0.6: what version 1.0.7 did with it

The review (`GIT\Exchange Claude\CPU Load analysis`: `OktoWave_1.0.6_Resource_Review.md`, `Review_Feedback_and_Instructions_for_Claude.md`, its data and scripts) ranked 15 findings. This page says, for each, what was done, what was measured and what was left, and how the work was proved. The rule of the review was kept: **the sound is the same bit for bit** (`Revue_CPU.md` §3.7 of CLAUDE.md).

## The proof, every time

| What | How | Result |
|---|---|---|
| C++ engine, x86 | `vst/devtest/cpu_bench.cpp --dump` on the tree before the work, `--check` after: 95 presets (TOP Sounds + every third of each category) x chords of 3 / 6 / 8 x velocities 1 / 0.7 = **570 renders** | 0 samples differ, after every change |
| C++ engine, the cross-check cases | `dsp_render` of the **323 cases** of `tools/dsp_compare.js --list`, every file `cmp`-ed with the 1.0.6 render | 0 differ, after every change |
| C++ against the web engine | `node tools/dsp_compare.js` | 323 cases, worst difference 1.79e-7, **unchanged** |
| Web engine | `tools/cpu_jsab.js`: the old and the new `core.js` render the same chords in turn, FNV hash of every sample: **all 237 presets x chords of 3 / 6 / 8 = 711 renders** | 711 / 711 identical |
| Parallel table build | `vst/devtest/tables_equal.cpp` (also a step of `tests/full.js`): the tables built by 1 thread and by 4 threads, every vector of every set, several times | 237 presets, 3 780 sets: 0 different |
| NEON (Apple silicon) | `.github/workflows/mac.yml`: the 323 cases rendered by the NEON build and by a build with `-DWS_NO_NEON`, `cmp` of the files; both on GitHub's Apple-silicon Macs | 323 files, 0 differ |
| CPU, x86 | `vst/devtest/cpu_ab.cpp`: the engine of 1.0.6 and the new one in one program, render after render (the only fair comparison on a shared machine), thread cycle time; `tools/cpu_ab_report.js` | below |
| CPU, Apple silicon | the same `cpu_ab` built by the workflow (thread CPU time), NEON against scalar | below |

## Findings

| Rank | Finding | Status | Measured |
|---:|---|---|---|
| 1 | `core.js` takes the memoisations of the C++ engine | **done** (`web/js/core.js`: exp / pow / log2 of the same arguments, the scale filter's gains, the mip level, the unison tables, the own envelope at 0) | **-16.6 %** audio thread on average (A/B of 711 renders, B/A 0.834), bit-identical 711 / 711 |
| 2 | The builder thread polls every 3 ms | **done** (`plugin.cpp`: condition variable, 50 ms time-out; `kick()` once per structural edit, the only call added to the audio thread, it takes no lock) | 16 instances: **1.84 % of a core -> 0.05 %** (`vst/devtest/poll_cost.cpp`); 0.115 % -> 0.003 % per instance |
| 3 | Web scalogram as one image, cached glow | **not done**: measured in the page (headless Edge, a 6-note chord held): the scalogram costs 0.1 ms per redraw (3 ms per second, 0.3 % of a core), the scope 0.2 ms; the review's 3-10 % was an estimate. A pixel image would also change the anti-aliased edges of the atoms | - |
| 4 | Browser repainted at every knob move | **done** (`editor.cpp` 6.1 and 6.3: the preset box and the browser are repainted when the sound shown, its modified dot or the open / closed state changed; the lists are rebuilt when the library version changed). 6.2 (direct calls of `onTimer`) and 6.5 (persistent GDI+ bitmap) not done | the window test (`vote_session`) passes: the browser still follows the preset box, the arrows and its own clicks |
| 5 | Fuse the render passes of one oscillator | **done** (`dsp.h` `renderPasses`: the sets of an oscillator rendered together, sample by sample; a single set keeps the loop of 1.0.6) | 75 presets, chord of 6, x86: **-8.6 %** mean, heavy third **-13 %**, best -34 %, light third unchanged |
| 6 | Reuse table allocations, no unused layers | **done** (`SlotTables::begin/end`, `buildSet` writes into the destination vectors, `Tables::ensureWork`) | -0.85 MB per instance (the four sound sets no longer carry `layers`); build time single-thread: mean unchanged (42.0 ms), worst preset -7 % (241 -> 220 ms): the review's -5 to -8 % holds only for the heaviest presets |
| 7 | Dependency map instead of dirty-all | **done, conservative** (`ui.js` `canvasDeps`: the displays of the sound still follow any parameter; keyboard, wheels, LEDs, chord pads, meter, effect headings only the parameters they read, plus the oscillator shown and the tuning, which change their colour). A test was added to `smoke.js` | knob drag: keyboard redraws 96 -> 29 per second, wheels gone, frame time -9 % (headless Edge) |
| 8 | Parallel build | **done in the plug-in** (`buildTables(..., threads)`: up to 4 threads, helpers below normal priority; not offline rendering); `filter()` made safe for two first callers. Web Workers not done | all 237 presets: **13.6 s -> 4.4 s** with 4 threads (x3.1), the same bytes |
| 9 | Preset loads through the Worker | **not done**: the new sound would start only when the tables arrive (up to 0.3 s later) and the parameters sent meanwhile would meet the old tables; it needs its own design and test campaign with the click-free preset change of 1.0.6 | - |
| 10 | NEON kernels | **done** (`dsp.h`: a two-double layer `v2_*`, SSE2 on x86, NEON on Apple silicon; `bandTerms`, `rampGains`, the voice filter, the reverb); each kernel can be switched off (`-DWS_NO_NEON`, `-DWS_NO_NEON_BAND`, `_FILTER`, `_REVERB`) | Apple silicon (GitHub runner), 75 presets, chord of 6, paired, two runs: **-18.5 % and -20.4 %** mean (median -16 % and -18 %, best -45 %; single presets move by about +-10 % between runs, the noise of a shared runner); band + ramp -9 %, voice filter -8 %, reverb -2 % |
| 11 | Shared cache of table sets | **not done** (advanced: lifetimes, memory budget) | - |
| 12 | Reverb in pairs, envelopes interleaved | reverb **done** (x86 and Apple silicon); envelope interleave not done (it is 1.9 % of the samples) | in the totals above |
| 13 | Small cleanups | **done**: mono scratch sized at setup (4.1), one VST2 flag instead of 175 exchanges (4.2), the worklet and the Workers get the 11 entries of the spec the engine reads (7.4), the display of the oscillator shown built once per set of values (3.8). Not done: 4.3, 4.4 (0.3 ms per preset change), 7.5 | - |
| 14 | Pruned inverse FFT | **not done** (needs its own proof of the signed zeros) | - |
| 15 | AVX2 | **not done** (two code paths; the v2 layer is the place for it) | - |

Total on x86, 75 presets, chord of 6, the engine of 1.0.6 against the engine of 1.0.7 (`cpu_ab`): about **-10 %** mean (the heaviest third about -12 %), no preset slower by more than the noise of the measure; the web engine **-16.6 %**; Apple silicon **about -19 %**.

## Repeating the proof

```
node tools/cpu_cases.js <dir> check          # 95 presets   (all = 237)
# build cpu_bench and dsp_render from the tree BEFORE the change, then
cpu_bench <dir>/cases_check.txt --reps 1 --vels 1,0.7 --dump <ref>        # the reference renders
node tools/dsp_compare.js --list <dsp_ref> ; dsp_render <dsp_ref>          # the 323 cases
# after the change (same flags: -std=c++17 -O2 -DNDEBUG -static -ffp-contract=off -DNOMINMAX -I vst/external -I vst/src)
cpu_bench <dir>/cases_check.txt --reps 1 --vels 1,0.7 --check <ref>       # "checked 570 renders: 0 not bit-identical"
dsp_render <dsp_new> ; cmp every file against <dsp_ref>
node tools/dsp_compare.js <dsp_new>                                        # C++ against the web engine: 323 cases
node tools/cpu_jsab.js . <dir>/cases.txt <old core.js> web/js/core.js --chords 3,6,8 --reps 1    # the web engine
cpu_ab <dir>/cases_sample.txt --chords 6 --reps 6 ; node tools/cpu_ab_report.js ab.csv           # the CPU (two builds, in turn)
```
`cpu_ab` needs two builds of `cpu_ab_engine.cpp` (`-Dws=ws_old -DAB_MAKE=makeOld` with the include path of the old `dsp.h`, `-Dws=ws_new -DAB_MAKE=makeNew`); the macOS workflow shows the commands.
