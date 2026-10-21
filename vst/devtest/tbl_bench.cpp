// Table build time / memory and idle-cost bench for the Okto MultiWave Synth 1.0.6 engine (review 2026-10-21).
// Reads a cases file written by tools/cpu_cases.js ("index v0 v1 ... | name").
//   tbl_bench <cases.txt> --out tables.csv          build time (ms, min of reps), bytes, sets per preset; display build time
//   tbl_bench <cases.txt> --idle --out idle.csv     CPU % of a block loop with no note (10 s) and of the tail after one note (delay/reverb)
#include "dsp.h"
#include <chrono>
#include <fstream>
#include <sstream>
#include <windows.h>
#include <xmmintrin.h>
#include <intrin.h>
using namespace ws;

static double g_cycHz = 0;
static uint64_t cycles() { ULONG64 c = 0; QueryThreadCycleTime(GetCurrentThread(), &c); return c; }
static void calibrate() {
  LARGE_INTEGER f, a, b; QueryPerformanceFrequency(&f);
  double hz[3];
  for (int k = 0; k < 3; k++) {
    QueryPerformanceCounter(&a); const uint64_t t0 = __rdtsc();
    do { Sleep(0); QueryPerformanceCounter(&b); } while ((b.QuadPart - a.QuadPart) * 1000.0 / f.QuadPart < 100);
    hz[k] = (double)(__rdtsc() - t0) / ((double)(b.QuadPart - a.QuadPart) / f.QuadPart);
  }
  std::sort(hz, hz + 3);
  g_cycHz = hz[1];
}

static size_t bytesOf(const Tables& t) {
  size_t b = 0;
  auto add = [&](const std::vector<float>& v) { b += v.capacity() * sizeof(float); };
  for (int s = 0; s < NS; s++) {
    const SlotTables& st = t.slot[s];
    add(st.mips); add(st.rms); add(st.w2Mips); add(st.w2Rms);
    for (auto& v : st.phMips) add(v); for (auto& v : st.phRms) add(v);
    for (auto& v : st.w2PhMips) add(v); for (auto& v : st.w2PhRms) add(v);
  }
  b += t.layers.capacity() * 8 + t.coeffs.capacity() * 8 + t.mips.capacity() * 4 + t.rms.capacity() * 4;
  return b;
}
static int setsOf(const Tables& t) {
  int n = 0;
  for (int s = 0; s < NS; s++) {
    const SlotTables& st = t.slot[s];
    if (!st.on) continue;
    n += 1 + (st.hasW2 ? 1 : 0) + (int)st.phMips.size() + (int)st.w2PhMips.size();
  }
  return n;
}

int main(int argc, char** argv) {
  if (argc < 2) { std::fprintf(stderr, "usage: tbl_bench <cases.txt> [--out f.csv] [--idle] [--reps n] [--pin cpu]\n"); return 1; }
  std::string casesPath = argv[1], outPath; bool idle = false; int reps = 3, pin = -1, tailSecs = 10;
  for (int i = 2; i < argc; i++) {
    const std::string a = argv[i]; const char* v = i + 1 < argc ? argv[i + 1] : "";
    if (a == "--out") { outPath = v; i++; }
    else if (a == "--idle") idle = true;
    else if (a == "--tailsecs") { tailSecs = std::max(3, std::atoi(v)); i++; }
    else if (a == "--reps") { reps = std::max(1, std::atoi(v)); i++; }
    else if (a == "--pin") { pin = std::atoi(v); i++; }
  }
  _mm_setcsr(_mm_getcsr() | 0x8040);
  if (pin >= 0) SetThreadAffinityMask(GetCurrentThread(), (DWORD_PTR)1 << pin);
  calibrate();
  std::ifstream in(casesPath);
  if (!in) { std::fprintf(stderr, "cannot read %s\n", casesPath.c_str()); return 1; }
  FILE* csv = outPath.empty() ? stdout : std::fopen(outPath.c_str(), "w");
  std::fprintf(csv, "# cycles per second %.0f\n", g_cycHz);
  if (idle) std::fprintf(csv, "idx,name,idle_pct,tail_pct,tail_skipped_blocks,delay,reverb,chorus,first_skip_s,sec1_pct,sec2_pct,sec5_pct,sec10_pct,last_pct\n");
  else std::fprintf(csv, "idx,name,build_ms,display_ms,bytes,sets,needs,morph,variants\n");
  std::string line;
  const int sr = 48000, blk = 128;
  std::vector<float> L((size_t)sr * std::max(10, tailSecs)), R((size_t)sr * std::max(10, tailSecs));
  while (std::getline(in, line)) {
    if (line.empty()) continue;
    const size_t bar = line.rfind(" | ");
    std::istringstream ss(line.substr(0, bar)); int idx; ss >> idx;
    const std::string name = bar == std::string::npos ? "" : line.substr(bar + 3);
    double params[kNumParams];
    for (int i = 0; i < kNumParams; i++) ss >> params[i];
    if (!ss) { std::fprintf(stderr, "case %d: not %d values\n", idx, kNumParams); return 1; }
    if (!idle) {
      double best = 1e9, bestD = 1e9; size_t bytes = 0; int sets = 0;
      for (int r = 0; r < reps; r++) {
        Tables t;
        const auto t0 = std::chrono::steady_clock::now();
        buildTables(params, true, t);
        const auto t1 = std::chrono::steady_clock::now();
        best = std::min(best, std::chrono::duration<double, std::milli>(t1 - t0).count());
        bytes = bytesOf(t); sets = setsOf(t);
      }
      for (int r = 0; r < reps; r++) {
        Tables d;
        const auto t0 = std::chrono::steady_clock::now();
        buildTables(params, false, d);
        ScopeSets ss2; buildScopeSets(params, d, ss2);
        const auto t1 = std::chrono::steady_clock::now();
        bestD = std::min(bestD, std::chrono::duration<double, std::milli>(t1 - t0).count());
      }
      std::fprintf(csv, "%d,\"%s\",%.3f,%.3f,%zu,%d,%d,%d,%d\n", idx, name.c_str(), best, bestD, bytes, sets, tableNeeds(params), morphNeeded(params) ? 1 : 0, variantSig(params));
    } else {
      Tables t; buildTables(params, true, t);
      // (a) no note at all: 10 s of blocks
      double idlePct = 1e9, tailPct = 1e9; int skipped = 0;
      for (int r = 0; r < reps; r++) {
        Engine eng(sr); eng.setTempo(0);
        for (int i = 0; i < kNumParams; i++) eng.setParam(i, params[i]);
        eng.setTables(tableRef(t));
        const int n = sr * 10;
        const uint64_t c0 = cycles();
        for (int o = 0; o < n; o += blk) eng.process(L.data() + o, R.data() + o, blk);
        const uint64_t c1 = cycles();
        idlePct = std::min(idlePct, (double)(c1 - c0) / g_cycHz / 10.0 * 100);
      }
      // (b) one note of 0.5 s, then the tail: CPU of seconds 2..10 (the release, the delay echoes and the reverb tail, then the idle rule);
      // also the CPU of each second (the decay of the cost) and when the first block was skipped by the idle rule (all-zero output)
      double firstSkip = -1; double secPct[64] = {};
      for (int r = 0; r < reps; r++) {
        Engine eng(sr); eng.setTempo(0);
        for (int i = 0; i < kNumParams; i++) eng.setParam(i, params[i]);
        eng.setTables(tableRef(t));
        const int n = sr * tailSecs, offAt = sr / 2 / blk * blk, measureFrom = sr * 2 / blk * blk;   // block-aligned, or the note would never be released
        eng.noteOn(60, 0.9);
        uint64_t c0 = 0, cs = cycles(); int sk = 0, sec = 0; double fs = -1;
        for (int o = 0; o < n; o += blk) {
          if (o == offAt) eng.noteOff(60);
          if (o == measureFrom) c0 = cycles();
          eng.process(L.data() + o, R.data() + o, blk);
          bool z = true; for (int i = 0; i < blk; i++) if (L[o + i] != 0) { z = false; break; }
          if (z && fs < 0) fs = (double)o / sr;
          if (o >= measureFrom && o < sr * 10 && z) sk++;
          if ((o + blk) / sr > sec) { const uint64_t c = cycles(); secPct[sec] = (double)(c - cs) / g_cycHz * 100; cs = c; sec++; }
        }
        const uint64_t c1 = cycles();
        tailPct = std::min(tailPct, (double)(c1 - c0) / g_cycHz / (tailSecs - 2.0) * 100);
        skipped = sk; firstSkip = fs;
      }
      std::fprintf(csv, "%d,\"%s\",%.4f,%.4f,%d,%d,%d,%d,%.2f,%.4f,%.4f,%.4f,%.4f,%.4f\n", idx, name.c_str(), idlePct, tailPct, skipped,
                   (params[P_FX_DMIX] > 0 || params[P_FX_DFB] > 0) ? 1 : 0, params[P_FX_RMIX] > 0 ? 1 : 0, params[P_CH_MIX] > 0 ? 1 : 0,
                   firstSkip, secPct[0], secPct[1], secPct[std::min(4, tailSecs - 1)], secPct[std::min(9, tailSecs - 1)], secPct[tailSecs - 1]);
    }
    std::fflush(csv);
  }
  if (csv != stdout) std::fclose(csv);
  return 0;
}
