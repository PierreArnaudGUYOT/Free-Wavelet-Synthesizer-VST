// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// cpu_ab: two builds of the engine in one program, so that their CPU times can be measured in turn, render after render, under the same disturbance of the machine
// (the other jobs of a shared machine make runs minutes apart incomparable). Each build is cpu_ab_engine.cpp compiled with its own dsp.h and the namespace renamed
// (-Dws=ws_old / -Dws=ws_new), and gives this interface.
#pragma once
#include <cstdint>
struct AbRunner {
  virtual ~AbRunner() {}
  virtual void prepare(const double* params) = 0;   // loads the preset and builds its tables (not timed)
  // renders n samples (3 s at 48 kHz in blocks of 128) of a chord of `chord` notes (3, 6 or 8) at velocity `vel`, the notes released after 2 s; returns the thread cycles of the render
  virtual uint64_t render(int chord, double vel, float* L, float* R, int n) = 0;
};
