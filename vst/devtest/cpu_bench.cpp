// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// CPU measure of the sound engine (Windows). Plays chords of 3, 6 and 8 MIDI notes on factory presets (3 s of audio at 48 kHz, blocks of 128 samples as a DAW
// calls the plug-in; the notes are released after 2 s so that the tails count) and measures the CPU time of the render: QueryThreadCycleTime of the audio thread,
// converted to seconds with the cycle rate measured at the start (not the wall clock: the machine is shared), the minimum of --reps runs. The table building is
// not timed. Output: one CSV line per preset x chord x velocity: index, chord size, velocity, CPU % of real time (min of the runs), median %, hash of the output.
//   cpu_bench <cases.txt> [--out f.csv] [--chords 3,6,8] [--vels 0.9] [--reps 5] [--secs 3] [--shard i/n] [--pin cpu]
//             [--dump dir]     write every render as <dir>/p<idx>_c<chord>_v<vel*100>.raw (interleaved float32), for a later --check
//             [--check dir]    compare every render with those files: maximum |difference| in units of the peak, and whether it is bit-identical
//             [--noftz]        do not set flush-to-zero / denormals-are-zero (the plug-in sets them)
//             [--sample f]     sampling profiler: the audio thread's instruction pointer every ~0.3 ms, written as relative addresses to f (read by tools/cpu_profile.js; only the render loop is sampled, not the table building)
// Cases: `node tools/cpu_cases.js <dir> all|check|sample` (the format of dsp_render's cases.txt, with the preset's index in front).
#include "dsp.h"
#include <chrono>
#include <fstream>
#include <map>
#include <sstream>
#include <windows.h>
#include <xmmintrin.h>
#include <intrin.h>
using namespace ws;

static double g_cycHz = 0;   // thread cycles per second: QueryThreadCycleTime counts at the (constant) rate of the time-stamp counter, which is measured against the wall clock
static uint64_t cycles() { ULONG64 c = 0; QueryThreadCycleTime(GetCurrentThread(), &c); return c; }
static void calibrate() {
  LARGE_INTEGER f, a, b; QueryPerformanceFrequency(&f);
  double hz[3];
  for (int k = 0; k < 3; k++) {   // 100 ms of the time-stamp counter against the wall clock (a descheduled spin does not change it); the median of three
    QueryPerformanceCounter(&a); const uint64_t t0 = __rdtsc();
    do { Sleep(0); QueryPerformanceCounter(&b); } while ((b.QuadPart - a.QuadPart) * 1000.0 / f.QuadPart < 100);
    hz[k] = (double)(__rdtsc() - t0) / ((double)(b.QuadPart - a.QuadPart) / f.QuadPart);
  }
  std::sort(hz, hz + 3);
  g_cycHz = hz[1];
}

struct Sampler {
  HANDLE target = nullptr, th = nullptr; volatile bool stop = false, active = false; std::map<uint64_t, int> hist; uint64_t base = 0;
  static DWORD WINAPI run(LPVOID p) {
    Sampler* s = (Sampler*)p;
    while (!s->stop) {
      if (!s->active) { Sleep(1); continue; }
      if (SuspendThread(s->target) != (DWORD)-1) {
        CONTEXT c; c.ContextFlags = CONTEXT_CONTROL;
        if (GetThreadContext(s->target, &c)) s->hist[c.Rip]++;
        ResumeThread(s->target);
      }
      Sleep(0); for (volatile int i = 0; i < 200000; i++) {}   // about 0.1-0.3 ms between two samples, without the 1 ms timer granularity
    }
    return 0;
  }
  void start() {
    DuplicateHandle(GetCurrentProcess(), GetCurrentThread(), GetCurrentProcess(), &target, 0, FALSE, DUPLICATE_SAME_ACCESS);
    base = (uint64_t)GetModuleHandleA(nullptr); th = CreateThread(nullptr, 0, run, this, 0, nullptr);
  }
  void finish(const char* path) {
    stop = true; WaitForSingleObject(th, INFINITE);
    FILE* f = std::fopen(path, "w");
    for (const char* m : {"ucrtbase.dll", "kernel32.dll", "KERNELBASE.dll", "ntdll.dll", "msvcrt.dll"}) if (HMODULE h = GetModuleHandleA(m)) std::fprintf(f, "# module %s 0x%llx\n", m, (unsigned long long)((uint64_t)h - base));   // where the system libraries (the maths functions the engine calls) are, relative to the exe
    for (auto& kv : hist) std::fprintf(f, "0x%llx %d\n", (unsigned long long)(kv.first - base), kv.second);
    std::fclose(f);
  }
};

static uint64_t fnv(uint64_t h, const float* p, int n) {
  const uint32_t* u = (const uint32_t*)p;
  for (int i = 0; i < n; i++) { h ^= u[i]; h *= 1099511628211ull; }
  return h;
}

struct NoteSet { int n; int notes[8]; };
static const NoteSet kBenchChords[] = {{3, {60, 64, 67}}, {6, {48, 55, 60, 64, 67, 71}}, {8, {36, 48, 55, 60, 64, 67, 71, 76}}};
static const NoteSet& chordOf(int n) { for (const NoteSet& c : kBenchChords) if (c.n == n) return c; return kBenchChords[0]; }

int main(int argc, char** argv) {
  if (argc < 2) { std::fprintf(stderr, "usage: cpu_bench <cases.txt> [--out f.csv] [--chords 3,6,8] [--vels 0.9] [--reps 5] [--secs 3] [--shard i/n] [--pin cpu] [--dump dir] [--check dir] [--sample f]\n"); return 1; }
  std::string casesPath = argv[1], outPath, dumpDir, checkDir, samplePath; std::vector<int> chords = {3, 6, 8}; std::vector<double> vels = {0.9};
  int reps = 5, shardI = 0, shardN = 1, pin = -1; double secs = 3; bool noFtz = false;
  for (int i = 2; i < argc; i++) {
    const std::string a = argv[i]; const char* v = i + 1 < argc ? argv[i + 1] : "";
    auto list = [&](auto conv, auto& out) { out.clear(); std::stringstream ss(v); std::string t; while (std::getline(ss, t, ',')) out.push_back(conv(t)); i++; };
    if (a == "--out") { outPath = v; i++; }
    else if (a == "--chords") list([](const std::string& s) { return std::atoi(s.c_str()); }, chords);
    else if (a == "--vels") list([](const std::string& s) { return std::atof(s.c_str()); }, vels);
    else if (a == "--reps") { reps = std::max(1, std::atoi(v)); i++; }
    else if (a == "--secs") { secs = std::atof(v); i++; }
    else if (a == "--shard") { std::sscanf(v, "%d/%d", &shardI, &shardN); i++; }
    else if (a == "--pin") { pin = std::atoi(v); i++; }
    else if (a == "--dump") { dumpDir = v; i++; }
    else if (a == "--check") { checkDir = v; i++; }
    else if (a == "--sample") { samplePath = v; i++; }
    else if (a == "--noftz") noFtz = true;
  }
  if (!noFtz) _mm_setcsr(_mm_getcsr() | 0x8040);   // flush denormals to zero, as the plug-in does while it processes (plugin.cpp FtzGuard)
  if (pin >= 0) SetThreadAffinityMask(GetCurrentThread(), (DWORD_PTR)1 << pin);
  calibrate();
  std::ifstream in(casesPath);
  if (!in) { std::fprintf(stderr, "cannot read %s\n", casesPath.c_str()); return 1; }
  FILE* csv = outPath.empty() ? stdout : std::fopen(outPath.c_str(), "w");
  std::fprintf(csv, "# cycles per second %.0f\n", g_cycHz);
  const int sr = 48000, blk = 128, n = (int)(sr * secs) / blk * blk, offAt = (int)(2.0 * sr) / blk * blk;
  std::vector<float> L(n), R(n), inter((size_t)n * 2), ref;
  Sampler smp; if (!samplePath.empty()) smp.start();
  std::string line; int seq = 0; double worstAll = 0; int nonIdent = 0, compared = 0;
  const FILETIME z = {}; (void)z;
  while (std::getline(in, line)) {
    if (line.empty()) continue;
    if (shardN > 1 && seq++ % shardN != shardI) continue;
    const size_t bar = line.rfind(" | ");
    std::istringstream ss(line.substr(0, bar)); int idx; ss >> idx;
    double params[kNumParams];
    for (int i = 0; i < kNumParams; i++) ss >> params[i];
    if (!ss) { std::fprintf(stderr, "case %d: not %d values\n", idx, kNumParams); return 1; }
    Tables t; buildTables(params, true, t);
    for (int cs : chords) for (double vel : vels) {
      const NoteSet& ch = chordOf(cs);
      std::vector<double> runs; uint64_t hash = 0;
      for (int rep = 0; rep < reps; rep++) {
        Engine eng(sr); eng.setTempo(0);
        for (int i = 0; i < kNumParams; i++) eng.setParam(i, params[i]);
        eng.setTables(tableRef(t));
        smp.active = true; const uint64_t c0 = cycles();
        for (int o = 0; o < n; o += blk) {
          if (o == 0) for (int k = 0; k < ch.n; k++) eng.noteOn(ch.notes[k], vel);
          if (o == offAt) for (int k = 0; k < ch.n; k++) eng.noteOff(ch.notes[k]);
          eng.process(L.data() + o, R.data() + o, blk);
        }
        const uint64_t c1 = cycles(); smp.active = false;
        runs.push_back((double)(c1 - c0) / g_cycHz / secs * 100);
        if (rep == 0) { hash = 1469598103934665603ull; hash = fnv(hash, L.data(), n); hash = fnv(hash, R.data(), n); }
      }
      std::sort(runs.begin(), runs.end());
      std::fprintf(csv, "%d,%d,%.2f,%.4f,%.4f,%016llx\n", idx, cs, vel, runs[0], runs[runs.size() / 2], (unsigned long long)hash);
      char name[512]; std::snprintf(name, sizeof name, "p%d_c%d_v%d.raw", idx, cs, (int)std::lround(vel * 100));
      if (!dumpDir.empty() || !checkDir.empty()) {
        for (int i = 0; i < n; i++) { inter[2 * (size_t)i] = L[i]; inter[2 * (size_t)i + 1] = R[i]; }
      }
      if (!dumpDir.empty()) {
        FILE* f = std::fopen((dumpDir + "/" + name).c_str(), "wb");
        if (!f) { std::fprintf(stderr, "cannot write %s/%s\n", dumpDir.c_str(), name); return 1; }
        std::fwrite(inter.data(), 4, inter.size(), f); std::fclose(f);
      }
      if (!checkDir.empty()) {
        FILE* f = std::fopen((checkDir + "/" + name).c_str(), "rb");
        if (!f) { std::fprintf(stderr, "no reference %s/%s\n", checkDir.c_str(), name); return 1; }
        ref.resize(inter.size()); const size_t got = std::fread(ref.data(), 4, ref.size(), f); std::fclose(f);
        if (got != ref.size()) { std::fprintf(stderr, "reference %s too short\n", name); return 1; }
        double maxd = 0, peak = 0; size_t diffs = 0;
        for (size_t i = 0; i < inter.size(); i++) {
          const double d = std::fabs((double)inter[i] - ref[i]); if (d > maxd) maxd = d; if (std::fabs((double)ref[i]) > peak) peak = std::fabs((double)ref[i]);
          if (std::memcmp(&inter[i], &ref[i], 4) != 0) diffs++;
        }
        const double rel = peak > 0 ? maxd / peak : maxd; worstAll = std::max(worstAll, rel); compared++; if (diffs) nonIdent++;
        std::fprintf(stderr, "check %s: %s max diff %.3e of the peak (%.4f), %zu samples differ\n", name, diffs ? "DIFFERENT" : "identical", rel, peak, diffs);
      }
    }
  }
  if (!samplePath.empty()) smp.finish(samplePath.c_str());
  if (!checkDir.empty()) std::fprintf(stderr, "checked %d renders: %d not bit-identical, worst difference %.3e of the peak\n", compared, nonIdent, worstAll);
#ifdef WS_COUNT   // a build with an instrumented scratch copy of dsp.h (never the repository's dsp.h) that counts what it does and defines this macro to print it
  WS_COUNT_REPORT(csv);
#endif
  FILETIME c, e, k, u; GetProcessTimes(GetCurrentProcess(), &c, &e, &k, &u);
  const double ct = (((uint64_t)u.dwHighDateTime << 32 | u.dwLowDateTime) + ((uint64_t)k.dwHighDateTime << 32 | k.dwLowDateTime)) / 1e7;
  std::fprintf(csv, "# process CPU time %.2f s\n", ct);
  if (csv != stdout) std::fclose(csv);
  return 0;
}
