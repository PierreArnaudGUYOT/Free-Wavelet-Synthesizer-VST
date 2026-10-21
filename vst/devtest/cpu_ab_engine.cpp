// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// One build of the engine for cpu_ab (see cpu_ab.h): compile with the include path of the dsp.h to measure, -Dws=<its own namespace> and -DAB_MAKE=<its factory name>.
#include "dsp.h"
#include "cpu_ab.h"
#include <windows.h>
using namespace ws;

namespace {
struct Runner : AbRunner {
  double params[kNumParams]; Tables tables;
  void prepare(const double* p) override { std::memcpy(params, p, sizeof params); tables = Tables(); buildTables(params, true, tables); }
  uint64_t render(int chord, double vel, float* L, float* R, int n) override {
    static const int notes3[] = {60, 64, 67}, notes6[] = {48, 55, 60, 64, 67, 71}, notes8[] = {36, 48, 55, 60, 64, 67, 71, 76};
    const int* nt = chord == 8 ? notes8 : chord == 6 ? notes6 : notes3; const int cn = chord == 8 ? 8 : chord == 6 ? 6 : 3;
    const int blk = 128, offAt = 96000 / blk * blk;
    Engine eng(48000); eng.setTempo(0);
    for (int i = 0; i < kNumParams; i++) eng.setParam(i, params[i]);
    eng.setTables(tableRef(tables));
    ULONG64 c0 = 0, c1 = 0; QueryThreadCycleTime(GetCurrentThread(), &c0);
    for (int o = 0; o < n; o += blk) {
      if (o == 0) for (int k = 0; k < cn; k++) eng.noteOn(nt[k], vel);
      if (o == offAt) for (int k = 0; k < cn; k++) eng.noteOff(nt[k]);
      eng.process(L + o, R + o, blk);
    }
    QueryThreadCycleTime(GetCurrentThread(), &c1);
    return c1 - c0;
  }
};
}
AbRunner* AB_MAKE() { return new Runner(); }
