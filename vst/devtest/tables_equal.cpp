// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer check of the parallel table build (version 1.0.7, CPU review 3.4): for every preset of a cases file (tools/cpu_cases.js: "index v0 v1 ... | name"), the tables built by one thread and by
// several threads (the same call, several times over, to give a race the chance to show) must be the same bytes, vector by vector. Reports the time of each way.
//   tables_equal <cases.txt> [--threads 4] [--reps 3]
#include "dsp.h"
#include <chrono>
#include <fstream>
#include <sstream>
using namespace ws;

static bool same(const std::vector<float>& a, const std::vector<float>& b) { return a.size() == b.size() && (a.empty() || std::memcmp(a.data(), b.data(), a.size() * sizeof(float)) == 0); }
static bool sameAll(const std::vector<std::vector<float>>& a, const std::vector<std::vector<float>>& b) {
  if (a.size() != b.size()) return false;
  for (size_t i = 0; i < a.size(); i++) if (!same(a[i], b[i])) return false;
  return true;
}
static bool sameTables(const Tables& a, const Tables& b) {
  if (a.needs != b.needs) return false;
  for (int s = 0; s < NS; s++) {
    const SlotTables& x = a.slot[s]; const SlotTables& y = b.slot[s];
    if (x.on != y.on || x.mode != y.mode || x.hasW2 != y.hasW2 || x.vk != y.vk) return false;
    if (!same(x.mips, y.mips) || !same(x.rms, y.rms) || !same(x.w2Mips, y.w2Mips) || !same(x.w2Rms, y.w2Rms)) return false;
    if (!sameAll(x.phMips, y.phMips) || !sameAll(x.phRms, y.phRms) || !sameAll(x.w2PhMips, y.w2PhMips) || !sameAll(x.w2PhRms, y.w2PhRms)) return false;
  }
  return true;
}
int main(int argc, char** argv) {
  if (argc < 2) { std::fprintf(stderr, "usage: tables_equal <cases.txt> [--threads 4] [--reps 3]\n"); return 1; }
  int threads = 4, reps = 3;
  for (int i = 2; i < argc; i++) {
    const std::string a = argv[i];
    if (a == "--threads" && i + 1 < argc) threads = std::atoi(argv[++i]);
    else if (a == "--reps" && i + 1 < argc) reps = std::atoi(argv[++i]);
  }
  std::ifstream in(argv[1]); std::string line; int n = 0, bad = 0, sets = 0;
  double tSerial = 0, tPar = 0;
  while (std::getline(in, line)) {
    if (line.empty()) continue;
    std::istringstream ss(line.substr(0, line.rfind(" | "))); int idx; ss >> idx;
    std::vector<double> p; double x; while (ss >> x) p.push_back(x);
    if ((int)p.size() != kNumParams) { std::fprintf(stderr, "case %d: %zu values, expected %d\n", idx, p.size(), kNumParams); return 1; }
    Tables ref; auto t0 = std::chrono::steady_clock::now(); buildTables(p.data(), true, ref, 1); tSerial += std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    for (int r = 0; r < reps; r++) {
      Tables par;   // (a fresh object each time; the second round below reuses one, as the plug-in's sets do)
      t0 = std::chrono::steady_clock::now(); buildTables(p.data(), true, par, threads); tPar += std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
      if (!sameTables(ref, par)) { bad++; std::printf("DIFFERENT: preset %d (%s), repetition %d\n", idx, line.substr(line.rfind(" | ") + 3).c_str(), r); }
    }
    Tables reuse; buildTables(p.data(), true, reuse, threads); buildTables(p.data(), true, reuse, threads);   // the same object built twice: the vectors are reused
    if (!sameTables(ref, reuse)) { bad++; std::printf("DIFFERENT after reuse: preset %d\n", idx); }
    n++;
    for (int s = 0; s < NS; s++) { const SlotTables& st = ref.slot[s]; if (st.on) sets += 1 + (st.hasW2 ? 1 : 0) + (int)st.phMips.size() + (int)st.w2PhMips.size(); }
  }
  std::printf("%d presets, %d sets, %d threads x %d repetitions: %d different; build time: one thread %.2f s, %d threads %.2f s (per repetition)\n", n, sets, threads, reps, bad, tSerial, threads, tPar / reps);
  return bad ? 2 : 0;
}
