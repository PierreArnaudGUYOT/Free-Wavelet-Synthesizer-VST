// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// VINTAGE (1.0.18 test): listening files for the owner. A few factory presets play the same passage (a held four-note chord, then the same note four times, then a short
// phrase) with VINTAGE 0 % and 100 % (CHARACTER Both, PHASE Free), rendered by the C++ engine (the plug-in's own), 16-bit WAV, 48 kHz.
//   x86_64-w64-mingw32-clang++ -std=c++17 -O2 -static -DNOMINMAX -I vst/src vst/devtest/vintage_wav.cpp -o vintage_wav.exe
//   vintage_wav.exe <output folder>
#include "../src/dsp.h"
#include <cstdio>
#include <string>
#include <vector>
using namespace ws;

struct Ev { double t; int note; bool on; };
static std::vector<Ev> passage() {
  std::vector<Ev> e;
  auto note = [&](double t, double len, int n) { e.push_back({t, n, true}); e.push_back({t + len, n, false}); };
  for (int n : {48, 55, 60, 64}) note(0.0, 4.5, n);                     // a held chord: the voices beat against each other and drift
  for (int i = 0; i < 4; i++) note(5.2 + i * 0.6, 0.45, 60);            // the same note four times: each one starts a little differently
  const int ph[] = {60, 64, 67, 72, 67, 64, 60};                         // a short phrase
  for (int i = 0; i < 7; i++) note(8.0 + i * 0.4, 0.35, ph[i]);
  return e;
}
static void writeWav(const std::string& path, const std::vector<float>& L, const std::vector<float>& R) {
  FILE* f = std::fopen(path.c_str(), "wb"); if (!f) { std::printf("cannot write %s\n", path.c_str()); return; }
  const uint32_t n = (uint32_t)L.size(), data = n * 4, sr = 48000;
  auto u32 = [&](uint32_t v) { std::fwrite(&v, 4, 1, f); }; auto u16 = [&](uint16_t v) { std::fwrite(&v, 2, 1, f); };
  std::fwrite("RIFF", 1, 4, f); u32(36 + data); std::fwrite("WAVEfmt ", 1, 8, f); u32(16); u16(1); u16(2); u32(sr); u32(sr * 4); u16(4); u16(16);
  std::fwrite("data", 1, 4, f); u32(data);
  for (uint32_t i = 0; i < n; i++) for (float x : {L[i], R[i]}) { const int v = (int)std::lround(std::max(-1.0f, std::min(1.0f, x)) * 32767); u16((uint16_t)(int16_t)v); }
  std::fclose(f);
}
static void render(int k, double vintage, const std::string& path) {
  std::vector<double> p(kPresets[k].v, kPresets[k].v + kNumParams);
  p[P_V_VINTAGE] = vintage; p[P_V_VCHAR] = 1;
  Engine eng(48000); eng.setTempo(0);
  for (int i = 0; i < kNumParams; i++) eng.setParam(i, p[i]);
  Tables t; buildTables(p.data(), true, t); eng.setTables(tableRef(t));
  const int n = 48000 * 12, blk = 128;
  std::vector<float> L(n), R(n);
  const std::vector<Ev> ev = passage();
  for (int o = 0; o < n; o += blk) {
    for (const Ev& e : ev) { const int at = (int)(e.t * 48000); if (at >= o && at < o + blk) { if (e.on) eng.noteOn(e.note, 0.8); else eng.noteOff(e.note); } }
    eng.process(L.data() + o, R.data() + o, std::min(blk, n - o));
  }
  writeWav(path, L, R);
  std::printf("  %s\n", path.c_str());
}
int main(int argc, char** argv) {
  const std::string out = argc > 1 ? argv[1] : ".";
  const char* names[] = {"A \xC2\xB7 Warm Pad", "AB \xC2\xB7 Pure Fog", "AA \xC2\xB7 Deep Ripple", "A \xC2\xB7 Wavelet Lead"};
  const char* files[] = {"Warm Pad", "Pure Fog", "Deep Ripple", "Wavelet Lead"};
  for (int j = 0; j < 4; j++) {
    int k = -1; for (int i = 0; i < kNumPresets; i++) if (std::string(kPresets[i].name) == names[j]) k = i;
    if (k < 0) { std::printf("no preset %s\n", names[j]); continue; }
    render(k, 0, out + "/" + files[j] + " - VINTAGE 0.wav");
    render(k, 1, out + "/" + files[j] + " - VINTAGE 100.wav");
  }
  return 0;
}
