// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer cross-check: renders the cases written by `node tools/dsp_compare.js --list <dir>` (every factory preset, then
// variants of the engine's features: tools/dsp_cases.js) with the C++ engine to raw float files <dir>/cpp_NNN.raw, so that the
// port can be compared with the JS reference (`node tools/dsp_compare.js <dir>`).
// Usage: dsp_render <dir>
#include "../src/dsp.h"
#include <chrono>
#include <fstream>
#include <sstream>
using namespace ws;
// the chord layer and the strum plate driven as a player would (keys through keyOn / keyOff, the plate's notes), the same events
// as tools/dsp_compare.js: offset (a multiple of the 128-sample block), kind, note, velocity
struct KeyEv { int o, kind, note; double vel; };   // kind 0 keyOn, 1 keyOff, 2 plateOn, 3 plateOff, 4 allNotesOff
static const KeyEv kChordScript[] = {
  {0, 0, 48, 1}, {0, 0, 67, 0.9}, {12800, 0, 64, 0.7}, {19200, 2, 74, 0.8}, {22400, 3, 74, 0}, {22400, 2, 79, 0.8},
  {25600, 3, 79, 0}, {25600, 1, 67, 0}, {38400, 1, 64, 0}, {38400, 0, 55, 1}, {38400, 0, 60, 0.8}, {64000, 1, 60, 0},
  {70400, 0, 72, 0.85}, {70400, 0, 40, 0.6}, {105600, 4, 0, 0}};
// beta 0.2, kind "chordlive": the held chord changes while the root is held (same events as LIVE_SCRIPT in tools/dsp_compare.js);
// kind 5 = setParam(note = parameter id, vel = value)
static const KeyEv kLiveScript[] = {
  {0, 0, 48, 1}, {0, 0, 67, 0.9}, {12800, 0, 51, 1}, {25600, 0, 50, 1}, {38400, 0, 59, 1}, {51200, 0, 53, 1},
  {64000, 5, P_CHORD_BASS, 0}, {70400, 5, P_CHORD_BASS, 1}, {76800, 0, 56, 1}, {83200, 5, P_CHORD_VOICING, 0}, {89600, 0, 49, 1},
  {96000, 1, 67, 0}, {100000, 4, 0, 0}};
// beta 0.3.2, kind "loud": dense chords played with MIDI notes at velocity 1 (LOUD_SCRIPT in tools/dsp_compare.js): {offset, 1 on / 0 off, note, velocity}
static const KeyEv kLoudScript[] = {
  {0, 1, 72, 1}, {0, 1, 76, 1}, {0, 1, 79, 1}, {19200, 1, 84, 1}, {19200, 1, 88, 1}, {38400, 1, 60, 1}, {38400, 1, 64, 1}, {38400, 1, 67, 1},
  {72000, 0, 72, 0}, {72000, 0, 76, 0}, {72000, 0, 79, 0}, {72000, 0, 84, 0}, {72000, 0, 88, 0}, {96000, 0, 60, 0}, {96000, 0, 64, 0}, {96000, 0, 67, 0}};
static void render(const double* params, int idx, const std::string& name, int chord, double tempo, const char* outdir) {
  const int sr = 48000, n = sr * 3, blk = 128;
  Engine eng(sr);
  eng.setTempo(tempo);   // 0 = no tempo (the factory presets, the web app)
  for (int i = 0; i < kNumParams; i++) eng.setParam(i, params[i]);
  Tables t; buildTables(params, true, t);
  eng.setTables(tableRef(t));
  std::vector<float> L(n), R(n);
  auto t0 = std::chrono::steady_clock::now();
  for (int o = 0; o < n; o += blk) {
    if (chord == 3) {
      for (const KeyEv& e : kLoudScript) if (e.o == o) { if (e.kind) eng.noteOn(e.note, e.vel); else eng.noteOff(e.note); }
    } else if (chord == 2) {
      for (const KeyEv& e : kLiveScript) if (e.o == o) {
        if (e.kind == 0) eng.keyOn(e.note, e.vel); else if (e.kind == 1) eng.keyOff(e.note); else if (e.kind == 4) eng.allNotesOff(); else eng.setParam(e.note, e.vel);
      }
    } else if (chord) {
      for (const KeyEv& e : kChordScript) if (e.o == o) {
        if (e.kind == 0) eng.keyOn(e.note, e.vel); else if (e.kind == 1) eng.keyOff(e.note);
        else if (e.kind == 2) eng.plateOn(e.note, e.vel); else if (e.kind == 3) eng.plateOff(e.note); else eng.allNotesOff();
      }
    } else {
      if (o == 0) eng.noteOn(60, 0.9);
      if (o == 36000) eng.noteOff(60);
      if (o == 48000) { eng.noteOn(57, 0.8); eng.noteOn(64, 0.8); eng.noteOn(67, 0.8); }
      if (o == 105600) eng.allNotesOff();
    }
    eng.process(L.data() + o, R.data() + o, std::min(blk, n - o));
  }
  double us = std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now() - t0).count();
  char path[512]; std::snprintf(path, sizeof path, "%s/cpp_%03d.raw", outdir, idx);
  FILE* f = std::fopen(path, "wb");
  for (int i = 0; i < n; i++) { std::fwrite(&L[i], 4, 1, f); std::fwrite(&R[i], 4, 1, f); }
  std::fclose(f);
  if (idx % 20 == 0 || idx >= kNumPresets) std::printf("%3d %-46s %.2f%% CPU%s\n", idx, name.c_str(), us / 1e6 / 3 * 100, chord ? " (chord keyboard)" : "");
}
int main(int argc, char** argv) {
  const char* outdir = argc > 1 ? argv[1] : ".";
  int shardI = 0, shardN = 1;   // dsp_render <dir> [i/n]: only the cases whose number is i modulo n (the cross-check runs the shards side by side)
  if (argc > 2 && std::sscanf(argv[2], "%d/%d", &shardI, &shardN) != 2) { shardI = 0; shardN = 1; }
  std::ifstream in(std::string(outdir) + "/cases.txt");
  if (!in) { std::fprintf(stderr, "no cases.txt in %s: run `node tools/dsp_compare.js --list %s` first\n", outdir, outdir); return 1; }
  std::string line; int idx = 0;
  while (std::getline(in, line)) {
    if (line.empty()) continue;
    if (shardN > 1 && idx % shardN != shardI) { idx++; continue; }
    const size_t bar = line.rfind(" | ");
    std::istringstream ss(line.substr(0, bar));
    std::string kind; double tempo; ss >> kind >> tempo;
    double params[kNumParams];
    for (int i = 0; i < kNumParams; i++) ss >> params[i];
    if (!ss) { std::fprintf(stderr, "case %d: not %d values\n", idx, kNumParams); return 1; }
    render(params, idx, line.substr(bar + 3), kind == "loud" ? 3 : kind == "chordlive" ? 2 : kind == "chord" ? 1 : 0, tempo, outdir);
    idx++;
  }
  std::printf("%d cases rendered\n", idx);
  return 0;
}
