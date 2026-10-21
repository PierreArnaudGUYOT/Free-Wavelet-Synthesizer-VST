// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Paired CPU measure of two builds of the engine (before / after an optimisation): for every preset x chord, the two builds render in turn (the first one alternating),
// --reps times each, and the minimum thread-cycle time of each is reported as CPU % of real time, with the hash of each output (equal hashes = bit-identical sound).
//   cpu_ab <cases.txt> [--out f.csv] [--chords 3,6,8] [--vel 0.9] [--reps 6] [--shard i/n] [--pin cpu]
// Output lines: index, chord, velocity, old %, new %, old hash, new hash. Build: see tools/cpu_ab.bat (cpu_ab_engine.cpp twice, with -Dws=ws_old / -Dws=ws_new).
#include "cpu_ab.h"
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#if defined(_WIN32)
#include <intrin.h>
#endif
#include <sstream>
#include <string>
#include <vector>
#if defined(_WIN32)
#include <windows.h>
#endif
#if defined(__SSE__)
#include <xmmintrin.h>
#endif
constexpr int kNumParamsAb = 175;   // checked against the cases at run time (the number of values on a line)
AbRunner* makeOld();
AbRunner* makeNew();
static uint64_t fnv(const float* p, int n, uint64_t h) { const uint32_t* u = (const uint32_t*)p; for (int i = 0; i < n; i++) { h ^= u[i]; h *= 1099511628211ull; } return h; }
int main(int argc, char** argv) {
  if (argc < 2) { std::fprintf(stderr, "usage: cpu_ab <cases.txt> [--out f.csv] [--chords 3,6,8] [--vel 0.9] [--reps 6] [--shard i/n] [--pin cpu]\n"); return 1; }
  std::string out; std::vector<int> chords = {3, 6, 8}; double vel = 0.9; int reps = 6, shardI = 0, shardN = 1, pin = -1;
  for (int i = 2; i < argc; i++) {
    const std::string a = argv[i]; const char* v = i + 1 < argc ? argv[i + 1] : "";
    if (a == "--out") { out = v; i++; }
    else if (a == "--chords") { chords.clear(); std::stringstream ss(v); std::string t; while (std::getline(ss, t, ',')) chords.push_back(std::atoi(t.c_str())); i++; }
    else if (a == "--vel") { vel = std::atof(v); i++; }
    else if (a == "--reps") { reps = std::max(1, std::atoi(v)); i++; }
    else if (a == "--shard") { std::sscanf(v, "%d/%d", &shardI, &shardN); i++; }
    else if (a == "--pin") { pin = std::atoi(v); i++; }
  }
#if defined(__SSE__)
  _mm_setcsr(_mm_getcsr() | 0x8040);   // flush-to-zero, denormals-are-zero, as the plug-in sets them
#elif defined(__aarch64__)
  { uint64_t o; __asm__ __volatile__("mrs %0, fpcr" : "=r"(o)); const uint64_t n = o | (1ull << 24); __asm__ __volatile__("msr fpcr, %0" : : "r"(n)); }   // the FZ bit, as plugin.cpp sets it
#endif
#if defined(_WIN32)
  if (pin >= 0) SetThreadAffinityMask(GetCurrentThread(), (DWORD_PTR)1 << pin);
#else
  (void)pin;
#endif
#if defined(_WIN32)
  LARGE_INTEGER f, a, b; QueryPerformanceFrequency(&f); double hz[3];
  for (int k = 0; k < 3; k++) { QueryPerformanceCounter(&a); const uint64_t t0 = __rdtsc(); do { Sleep(0); QueryPerformanceCounter(&b); } while ((b.QuadPart - a.QuadPart) * 1000.0 / f.QuadPart < 100); hz[k] = (double)(__rdtsc() - t0) / ((double)(b.QuadPart - a.QuadPart) / f.QuadPart); }
  std::sort(hz, hz + 3); const double cycHz = hz[1];
#else
  const double cycHz = 1e9;   // cpu_ab_engine.cpp counts nanoseconds of thread CPU time
#endif
  FILE* csv = out.empty() ? stdout : std::fopen(out.c_str(), "w");
  std::fprintf(csv, "# cycles per second %.0f\n", cycHz);
  AbRunner* A = makeOld(); AbRunner* B = makeNew();
  const int n = 144000; std::vector<float> L(n), R(n);
  std::ifstream in(argv[1]); std::string line; int seq = 0;
  while (std::getline(in, line)) {
    if (line.empty()) continue;
    if (shardN > 1 && seq++ % shardN != shardI) continue;
    std::istringstream ss(line.substr(0, line.rfind(" | "))); int idx; ss >> idx;
    std::vector<double> p; double x; while (ss >> x) p.push_back(x);
    if ((int)p.size() != kNumParamsAb) { std::fprintf(stderr, "case %d: %zu values, expected %d\n", idx, p.size(), kNumParamsAb); return 1; }
    A->prepare(p.data()); B->prepare(p.data());
    for (int cs : chords) {
      uint64_t bestA = ~0ull, bestB = ~0ull, hA = 0, hB = 0;
      for (int r = 0; r < reps; r++) {
        for (int k = 0; k < 2; k++) {
          const bool first = (k == 0) == (r % 2 == 0);   // the order alternates from one repetition to the next
          AbRunner* rn = first ? A : B;
          const uint64_t c = rn->render(cs, vel, L.data(), R.data(), n);
          (first ? bestA : bestB) = std::min(first ? bestA : bestB, c);
          if (r == 0) { uint64_t h = fnv(L.data(), n, 1469598103934665603ull); h = fnv(R.data(), n, h); (first ? hA : hB) = h; }
        }
      }
      std::fprintf(csv, "%d,%d,%.2f,%.4f,%.4f,%016llx,%016llx\n", idx, cs, vel, bestA / cycHz / 3 * 100, bestB / cycHz / 3 * 100, (unsigned long long)hA, (unsigned long long)hB);
    }
  }
  if (csv != stdout) std::fclose(csv);
  return 0;
}
