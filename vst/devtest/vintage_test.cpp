// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer check of VINTAGE (version 1.0.18 test, ClaudeProjects/OKTOWAVE_VINTAGE_SPEC.md) on the C++ engine, nothing on the screen:
//  - VINTAGE 0: TYPE changes nothing (the same samples; the C++/JS cross-check of tests/quick.js --dsp shows the rest of the engine is the one of before);
//  - the same sequence twice: the same samples;
//  - a held SINE note (A1 alone, filters open, no effects) measured every 100 ms (its zero crossings): with VINTAGE 100 % and CHARACTER Both its mean offset is within +-8 cents
//    and its slow drift 2 to 4 cents rms; Static: no drift; Drift: a drift and no fixed offset; three notes in a row (three voices): three different offsets.
//   x86_64-w64-mingw32-clang++ -std=c++17 -O2 -static -DNOMINMAX -I vst/src vst/devtest/vintage_test.cpp -o vintage_test.exe
#include "../src/dsp.h"
#include <cstdio>
#include <vector>
using namespace ws;

static int gFails = 0;
static void check(bool ok, const char* what, const std::string& detail = {}) {
  std::printf("  [%s] %s%s%s\n", ok ? "PASS" : "FAIL", what, detail.empty() ? "" : "  -- ", detail.c_str());
  if (!ok) gFails++;
}
static std::vector<double> base() {
  std::vector<double> p(kNumParams);
  for (int i = 0; i < kNumParams; i++) p[i] = kParams[i].def;
  p[P_A_WAVE] = 4;   // SINE
  p[P_FX_PUNCH] = 0;
  return p;
}
// notes: {start sample, note, length in samples}; mono left channel
struct Note { int at, note, len; };
static std::vector<float> render(const std::vector<double>& p, const std::vector<Note>& notes, int n) {
  Engine eng(48000); eng.setTempo(0);
  for (int i = 0; i < kNumParams; i++) eng.setParam(i, p[i]);
  Tables t; buildTables(p.data(), true, t);
  eng.setTables(tableRef(t));
  std::vector<float> L(n), R(n);
  const int blk = 128;
  for (int o = 0; o < n; o += blk) {
    for (const Note& x : notes) { if (x.at >= o && x.at < o + blk) eng.noteOn(x.note, 0.8); if (x.at + x.len >= o && x.at + x.len < o + blk) eng.noteOff(x.note); }
    eng.process(L.data() + o, R.data() + o, std::min(blk, n - o));
  }
  return L;
}
// the pitch in cents from the note's equal-tempered pitch, every 100 ms from `from` to `to` (upward zero crossings, linear interpolation)
static std::vector<double> cents(const std::vector<float>& x, int note, int from, int to) {
  const double f0 = 440 * std::pow(2.0, (note - 69) / 12.0);
  std::vector<double> out;
  const int W = 4800;
  for (int w = from; w + W <= to; w += W) {
    double first = -1, last = -1; int nc = 0;
    for (int i = w + 1; i < w + W; i++)
      if (x[i - 1] < 0 && x[i] >= 0) { const double t = i - 1 + x[i - 1] / (x[i - 1] - x[i]); if (first < 0) first = t; last = t; nc++; }
    if (nc > 2) out.push_back(1200 * std::log2((nc - 1) / ((last - first) / 48000.0) / f0));
  }
  return out;
}
static void stats(const std::vector<double>& c, double& mean, double& sd) {
  mean = 0; for (double v : c) mean += v; mean /= c.size();
  sd = 0; for (double v : c) sd += (v - mean) * (v - mean); sd = std::sqrt(sd / c.size());
}
static std::string fmt(const char* f, double a, double b) { char s[128]; std::snprintf(s, sizeof s, f, a, b); return s; }

int main() {
  const int sr = 48000;
  std::printf("VINTAGE (1.0.18 test) on the C++ engine\n");
  {   // VINTAGE 0: TYPE changes nothing
    std::vector<double> a = base(), b = base();
    b[P_V_VCHAR] = 2;
    const std::vector<Note> ns = {{0, 60, sr}, {sr / 4, 64, sr}, {sr / 2, 67, sr}};
    const auto ra = render(a, ns, 2 * sr), rb = render(b, ns, 2 * sr);
    check(ra == rb, "VINTAGE 0: TYPE changes nothing (the same samples)");
  }
  std::vector<double> v = base(); v[P_V_VINTAGE] = 1;
  const int n = 61 * sr;   // a minute: a 3 s drift needs a long look for its rms
  const std::vector<Note> held = {{0, 60, n}};
  {
    const auto r1 = render(v, held, 3 * sr), r2 = render(v, held, 3 * sr);
    check(r1 == r2, "the same sequence twice: the same samples (VINTAGE 100 %)");
  }
  double m, sd;
  {
    const auto r = render(v, held, n);
    const auto c = cents(r, 60, sr, n);
    stats(c, m, sd);
    check(std::fabs(m) <= 40 && sd >= 8 && sd <= 22, "Both, 100 %: mean offset within 40 cents, drift and wow 8 to 22 cents rms (the owner: clearly audible)", fmt("mean %+.2f cents, drift %.2f cents rms", m, sd));
  }
  {
    std::vector<double> s = v; s[P_V_VCHAR] = 0;
    const auto c = cents(render(s, held, 6 * sr), 60, sr, 6 * sr);
    stats(c, m, sd);
    check(sd < 0.2 && std::fabs(m) <= 40, "FIX, 100 %: a fixed offset, no drift", fmt("mean %+.2f cents, drift %.3f cents rms", m, sd));
  }
  {
    std::vector<double> d = v; d[P_V_VCHAR] = 2;
    const auto c = cents(render(d, held, n), 60, sr, n);
    stats(c, m, sd);
    check(sd >= 8 && sd <= 22, "DRIFT, 100 %: the pitch wanders and wobbles", fmt("mean %+.2f cents, drift %.2f cents rms", m, sd));
  }
  {
    std::vector<double> q = v; q[P_V_VINTAGE] = 0.35;
    const auto c = cents(render(q, held, n), 60, sr, n);
    stats(c, m, sd);
    check(std::fabs(m) <= 14 && sd >= 2.5 && sd <= 8, "Both, 35 %: within 14 cents, drift and wow 2.5 to 8 cents rms", fmt("mean %+.2f cents, drift %.2f cents rms", m, sd));
  }
  {   // three notes in a row, each on its own voice (the last one released before the next): three offsets
    std::vector<Note> seq; for (int i = 0; i < 3; i++) seq.push_back({i * 2 * sr, 60, sr});
    const auto r = render(v, seq, 6 * sr);
    double o[3];
    for (int i = 0; i < 3; i++) { const auto c = cents(r, 60, i * 2 * sr + sr / 4, i * 2 * sr + sr - 4800); stats(c, m, sd); o[i] = m; }
    const bool diff = std::fabs(o[0] - o[1]) > 0.3 && std::fabs(o[1] - o[2]) > 0.3 && std::fabs(o[0] - o[2]) > 0.3;
    char s[128]; std::snprintf(s, sizeof s, "%+.2f, %+.2f, %+.2f cents", o[0], o[1], o[2]);
    check(diff, "three notes in a row: three different offsets", s);
  }
  std::printf(gFails ? "\n%d FAILED\n" : "\nALL PASS\n", gFails);
  return gFails ? 1 : 0;
}
