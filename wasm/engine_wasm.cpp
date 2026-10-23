// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// WebAssembly prototype: the C++ engine (vst/src/dsp.h, the 1:1 port of web/js/core.js) behind a thin C API, so that the web app's AudioWorklet can run it instead of
// the JavaScript engine. One engine per module instance (the worklet makes one). Built by wasm/build.sh (wasm32-wasip1, reactor, no exceptions, no threads,
// -ffp-contract=off, no fast-math), scalar and -msimd128.
//
// Tables: the page builds them in JavaScript (core.js buildTables, in its Workers) as Float32Arrays; the worklet copies each set into memory it asks for here
// (ws_bundle_alloc), names it (ws_bundle_set) and hands the bundle to the engine (ws_bundle_commit). The layout is the same in both engines (mips: NMIP x TW
// floats, layers interleaved; rms: NMIP x NL), so a TableRef points straight at the copies. A bundle the engine no longer plays (Engine::released) is freed
// after the next process call. ws_build_commit builds the tables here instead (for the measures).
#include "../vst/src/dsp.h"
#include <cstdlib>
#include <new>

#define WS_EXPORT(name) extern "C" __attribute__((export_name(#name)))

namespace {
struct Bundle {
  ws::TableRef ref;
  std::vector<float*> blocks;   // the sets' memory (mips then rms, one block per set)
  ws::Tables* built = nullptr;  // ws_build_commit: the tables built here
};
ws::Engine* gEng = nullptr;
std::vector<Bundle*> gBundles;   // every bundle alive (committed or not)
constexpr int kMaxBlock = 4096;
alignas(16) float gOutL[kMaxBlock], gOutR[kMaxBlock];
alignas(16) double gScratch[ws::kNumParams];
// the display state, packed for the worklet (see ws_state)
constexpr int kStateN = ws::NB + 11 + ws::NS * ws::NB + ws::NS * 3 + 4 + 2 * ws::MAXV;
alignas(16) float gState[kStateN];

void freeBundle(Bundle* b) {
  for (float* p : b->blocks) std::free(p);
  delete b->built;
  for (size_t i = 0; i < gBundles.size(); i++) if (gBundles[i] == b) { gBundles.erase(gBundles.begin() + i); break; }
  delete b;
}
// the bundles the engine let go of (setTables reports the one that left the crossfade)
void drain() {
  if (!gEng) return;
  for (int k = 0; k < gEng->nReleased; k++) {
    Bundle* b = (Bundle*)gEng->released[k];
    for (Bundle* x : gBundles) if (x == b) { freeBundle(b); break; }
  }
  gEng->nReleased = 0;
}
void freeAll() {
  while (!gBundles.empty()) freeBundle(gBundles.back());
}
}  // namespace

// ------------------------------------------------------------------ the engine
WS_EXPORT(ws_create) void ws_create(double sr) {
  delete gEng; gEng = nullptr;
  freeAll();
  gEng = new ws::Engine(sr);
}
WS_EXPORT(ws_num_params) int ws_num_params() { return ws::kNumParams; }
WS_EXPORT(ws_params) double* ws_params() { return gEng->p; }
WS_EXPORT(ws_scratch) double* ws_scratch() { return gScratch; }
WS_EXPORT(ws_set_param) void ws_set_param(int id, double v) { gEng->setParam(id, v); }
WS_EXPORT(ws_note_on) void ws_note_on(int n, double v) { gEng->noteOn(n, v); }
WS_EXPORT(ws_note_off) void ws_note_off(int n) { gEng->noteOff(n); }
WS_EXPORT(ws_key_on) void ws_key_on(int n, double v) { gEng->keyOn(n, v); }
WS_EXPORT(ws_key_off) void ws_key_off(int n) { gEng->keyOff(n); }
WS_EXPORT(ws_plate_on) void ws_plate_on(int n, double v) { gEng->plateOn(n, v); }
WS_EXPORT(ws_plate_off) void ws_plate_off(int n) { gEng->plateOff(n); }
WS_EXPORT(ws_all_notes_off) void ws_all_notes_off() { gEng->allNotesOff(); }
WS_EXPORT(ws_all_sound_off) void ws_all_sound_off() { gEng->allSoundOff(); }
WS_EXPORT(ws_set_tempo) void ws_set_tempo(double bpm) { gEng->setTempo(bpm); }
WS_EXPORT(ws_any_voice) int ws_any_voice() { return gEng->anyVoice() ? 1 : 0; }
WS_EXPORT(ws_latency) int ws_latency() { return gEng->latency(); }
WS_EXPORT(ws_out_l) float* ws_out_l() { return gOutL; }
WS_EXPORT(ws_out_r) float* ws_out_r() { return gOutR; }
WS_EXPORT(ws_max_block) int ws_max_block() { return kMaxBlock; }
// n samples (at most ws_max_block) into ws_out_l / ws_out_r
WS_EXPORT(ws_process) void ws_process(int n) {
  if (n > kMaxBlock) n = kMaxBlock;
  if (n > 0) gEng->process(gOutL, gOutR, n);
  if (gEng->nReleased) drain();
}
WS_EXPORT(ws_no_micro) int ws_no_micro() { return gEng->noMicro ? 1 : 0; }
WS_EXPORT(ws_set_no_micro) void ws_set_no_micro(int on) { gEng->noMicro = on != 0; }
WS_EXPORT(ws_set_chord_type_changed) void ws_set_chord_type_changed(int on) { gEng->chordTypeChanged = on != 0; }
WS_EXPORT(ws_keys) uint8_t* ws_keys() { return gEng->keys; }
WS_EXPORT(ws_sel_held) uint8_t* ws_sel_held() { return gEng->selHeld; }
WS_EXPORT(ws_clear_peaks) void ws_clear_peaks() { gEng->disp.peakL = 0; gEng->disp.peakR = 0; }
// The display and chord state in one float array: gains[NB], mode, view, voices, peakL, peakR, center, width, depth, note, slotLive, mask, sg[NS][NB], swin[NS][3],
// chordRoot, chordLastRoot, chordN, chordTypeChanged, chordNote[MAXV], chordOn[MAXV] (every value is a small integer or a float: exact in a float)
WS_EXPORT(ws_state_size) int ws_state_size() { return kStateN; }
WS_EXPORT(ws_state) float* ws_state() {
  const ws::Display& d = gEng->disp;
  float* o = gState;
  for (int b = 0; b < ws::NB; b++) *o++ = d.gains[b];
  *o++ = (float)d.mode; *o++ = (float)d.view; *o++ = (float)d.voices; *o++ = d.peakL; *o++ = d.peakR;
  *o++ = d.center; *o++ = d.width; *o++ = d.depth; *o++ = (float)d.note; *o++ = d.slotLive ? 1.0f : 0.0f; *o++ = (float)d.mask;
  for (int s = 0; s < ws::NS; s++) for (int b = 0; b < ws::NB; b++) *o++ = d.sg[s][b];
  for (int s = 0; s < ws::NS; s++) for (int k = 0; k < 3; k++) *o++ = d.swin[s][k];
  *o++ = (float)gEng->chordRoot; *o++ = (float)gEng->chordLastRoot; *o++ = (float)gEng->chordN; *o++ = gEng->chordTypeChanged ? 1.0f : 0.0f;
  for (int k = 0; k < ws::MAXV; k++) *o++ = (float)gEng->chordNote[k];
  for (int k = 0; k < ws::MAXV; k++) *o++ = (float)gEng->chordOn[k];
  return gState;
}

// ------------------------------------------------------------------ tables
WS_EXPORT(ws_bundle_new) Bundle* ws_bundle_new() {
  Bundle* b = new (std::nothrow) Bundle();
  if (b) gBundles.push_back(b);
  return b;
}
// memory for one set (mips then rms: n floats); 0 when the heap cannot grow
WS_EXPORT(ws_bundle_alloc) float* ws_bundle_alloc(Bundle* b, int n) {
  float* p = (float*)std::malloc((size_t)n * sizeof(float));
  if (p) b->blocks.push_back(p);
  return p;
}
// kind 0: the oscillator's own set, 1: its WAVELET 2 set, 2: variant set k, 3: WAVELET 2 variant set k (core.js: PHASE k = 0 is the own set, k >= 1 is ph[k - 1];
// SPARSITY / WIDTH: ph[k]); vk: the variant kind (-1 none)
WS_EXPORT(ws_bundle_set) void ws_bundle_set(Bundle* b, int s, int kind, int k, int vk, int mode, const float* mips, const float* rms) {
  if (s < 0 || s >= ws::NS || k < 0 || k >= ws::VK_MAX) return;
  ws::SlotRef& o = b->ref.slot[s];
  const ws::SetRef r{mode, mips, rms};
  switch (kind) {
    case 0: o.on = true; o.main = r; break;
    case 1: o.hasW2 = true; o.w2 = r; break;
    case 2: o.vk = vk; o.var[k] = r; break;
    case 3: o.hasW2Var = true; o.w2var[k] = r; break;
  }
}
WS_EXPORT(ws_bundle_commit) void ws_bundle_commit(Bundle* b) {
  b->ref.owner = b;
  gEng->setTables(b->ref);
  drain();
}
WS_EXPORT(ws_bundle_free) void ws_bundle_free(Bundle* b) { freeBundle(b); }   // a bundle never committed
WS_EXPORT(ws_bundles_alive) int ws_bundles_alive() { return (int)gBundles.size(); }
// the tables built here from the parameters in ws_scratch (one thread), then played (measures: the cost of building them in WebAssembly)
WS_EXPORT(ws_build_commit) void ws_build_commit() {
  Bundle* b = ws_bundle_new();
  b->built = new ws::Tables();
  ws::buildTables(gScratch, true, *b->built, 1);
  b->ref = ws::tableRef(*b->built);
  ws_bundle_commit(b);
}
// the same build, nothing played (the time of the build alone)
WS_EXPORT(ws_build_only) void ws_build_only() {
  ws::Tables t;
  ws::buildTables(gScratch, true, t, 1);
}
