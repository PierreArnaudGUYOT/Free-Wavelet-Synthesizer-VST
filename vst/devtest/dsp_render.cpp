// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer cross-check: renders every factory preset with the C++ engine to raw float files
// (same scenario as tools/dsp_compare.js) so the port can be compared with the JS reference.
// beta 0.3: then LFO 2 on each of its targets (no factory preset uses it yet), on presets of both engines.
#include "../src/dsp.h"
#include <chrono>
using namespace ws;
static void render(const double* params, int idx, const char* name, const char* outdir) {
  const int sr = 48000, n = sr * 3, blk = 128;
  Engine eng(sr);
  for (int i = 0; i < kNumParams; i++) eng.setParam(i, params[i]);
  Tables t; buildTables(params, true, t);
  eng.setTables(tableRef(t));
  std::vector<float> L(n), R(n);
  auto t0 = std::chrono::steady_clock::now();
  for (int o = 0; o < n; o += blk) {
    if (o == 0) eng.noteOn(60, 0.9);
    if (o == 36000) eng.noteOff(60);
    if (o == 48000) { eng.noteOn(57, 0.8); eng.noteOn(64, 0.8); eng.noteOn(67, 0.8); }
    if (o == 105600) eng.allNotesOff();
    eng.process(L.data() + o, R.data() + o, std::min(blk, n - o));
  }
  double us = std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now() - t0).count();
  char path[512]; std::snprintf(path, sizeof path, "%s/cpp_%02d.raw", outdir, idx);
  FILE* f = std::fopen(path, "wb");
  for (int i = 0; i < n; i++) { std::fwrite(&L[i], 4, 1, f); std::fwrite(&R[i], 4, 1, f); }
  std::fclose(f);
  std::printf("%-24s %.2f%% CPU\n", name, us / 1e6 / 3 * 100);
}
int main(int argc, char** argv) {
  const char* outdir = argc > 1 ? argv[1] : ".";
  double params[kNumParams];
  for (int pi = 0; pi < kNumPresets; pi++) {
    for (int i = 0; i < kNumParams; i++) params[i] = kPresets[pi].v[i];
    render(params, pi, kPresets[pi].name, outdir);
  }
  const int targets = (int)(sizeof kLfo2Targets / sizeof *kLfo2Targets);
  for (int t = 0; t < targets; t++) {   // the same variants as tools/dsp_compare.js
    const int pi = (t * 17) % kNumPresets;
    for (int i = 0; i < kNumParams; i++) params[i] = kPresets[pi].v[i];
    params[P_LFO2_TARGET] = t; params[P_LFO2_AMT] = t % 2 ? -0.8 : 0.8; params[P_LFO2_RATE] = 3; params[P_LFO2_SHAPE] = t % 5;
    char name[64]; std::snprintf(name, sizeof name, "LFO 2 -> %s", kParams[kLfo2Targets[t]].key);
    render(params, kNumPresets + t, name, outdir);
  }
  return 0;
}
