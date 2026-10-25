// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer cross-check: renders every factory preset with the C++ engine to raw float files
// (same scenario as tools/dsp_compare.js) so the port can be compared with the JS reference.
#include "../src/dsp.h"
#include <chrono>
using namespace ws;
int main(int argc, char** argv) {
  const char* outdir = argc > 1 ? argv[1] : ".";
  const int sr = 48000, n = sr * 3, blk = 128;
  for (int pi = 0; pi < kNumPresets; pi++) {
    double params[kNumParams];
    for (int i = 0; i < kNumParams; i++) params[i] = kPresets[pi].v[i];
    Engine eng(sr);
    for (int i = 0; i < kNumParams; i++) eng.setParam(i, params[i]);
    Tables t; buildTables(params, true, t);
    TableRef ref{t.mode, t.mips.data(), t.rms.data(), &t};
    eng.setTables(ref);
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
    char path[512]; std::snprintf(path, sizeof path, "%s/cpp_%02d.raw", outdir, pi);
    FILE* f = std::fopen(path, "wb");
    for (int i = 0; i < n; i++) { std::fwrite(&L[i], 4, 1, f); std::fwrite(&R[i], 4, 1, f); }
    std::fclose(f);
    std::printf("%-20s %.2f%% CPU\n", kPresets[pi].name, us / 1e6 / 3 * 100);
  }
  return 0;
}
