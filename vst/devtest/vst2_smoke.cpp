// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer check of the VST2 entry point: loads build\WaveletSynthesizer.vst3\Contents\x86_64-win\WaveletSynthesizer.dll
// like a VST2 host does (LoadLibrary + VSTPluginMain) and exercises audio, MIDI, parameters, programs, chunks and the editor.
//   x86_64-w64-mingw32-clang++ -std=c++17 -O2 -static -I vst/external -I vst/src vst/devtest/vst2_smoke.cpp -o vst2_smoke.exe -luser32
//   vst2_smoke.exe [path\to\WaveletSynthesizer.dll]
#include <windows.h>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <random>
#include <vector>
#include "dsp.h"
using namespace ws;

namespace {
struct AEffect;
typedef intptr_t (*HostCallback)(AEffect*, int32_t, int32_t, intptr_t, void*, float);
struct AEffect {
  int32_t magic;
  intptr_t (*dispatcher)(AEffect*, int32_t, int32_t, intptr_t, void*, float);
  void (*process)(AEffect*, float**, float**, int32_t);
  void (*setParameter)(AEffect*, int32_t, float);
  float (*getParameter)(AEffect*, int32_t);
  int32_t numPrograms, numParams, numInputs, numOutputs, flags;
  intptr_t resvd1, resvd2;
  int32_t initialDelay, realQualities, offQualities;
  float ioRatio;
  void* object; void* user;
  int32_t uniqueID, version;
  void (*processReplacing)(AEffect*, float**, float**, int32_t);
  void (*processDoubleReplacing)(AEffect*, double**, double**, int32_t);
  char future[56];
};
struct MidiEvent { int32_t type, byteSize, deltaFrames, flags, noteLength, noteOffset; unsigned char midiData[4]; char detune, noteOffVelocity, r1, r2; };
struct Events { int32_t numEvents; intptr_t reserved; void* events[8]; };
struct Rect { int16_t top, left, bottom, right; };

int fails = 0, passes = 0;
void check(bool ok, const char* what, const char* detail = "") {
  std::printf("  [%s] %s%s%s\n", ok ? "PASS" : "FAIL", what, *detail ? "  -- " : "", detail);
  (ok ? passes : fails)++;
}
int automateCalls = 0, processLevel = 0;
intptr_t hostCb(AEffect*, int32_t op, int32_t index, intptr_t value, void*, float) {
  switch (op) {
    case 0: automateCalls++; return 0;    // audioMasterAutomate
    case 1: return 2400;                  // audioMasterVersion
    case 15: return 1;                    // audioMasterSizeWindow
    case 23: return processLevel;         // audioMasterGetCurrentProcessLevel
    default: return 0;
  }
}
intptr_t D(AEffect* fx, int32_t op, int32_t index = 0, intptr_t value = 0, void* ptr = nullptr, float opt = 0) { return fx->dispatcher(fx, op, index, value, ptr, opt); }
void midi(AEffect* fx, unsigned char a, unsigned char b, unsigned char c) {
  MidiEvent e{}; e.type = 1; e.byteSize = sizeof e; e.midiData[0] = a; e.midiData[1] = b; e.midiData[2] = c;
  Events ev{}; ev.numEvents = 1; ev.events[0] = &e;
  D(fx, 25, 0, 0, &ev);
}
struct Render { float peak = 0; int bad = 0; };
Render render(AEffect* fx, int blocks, int n = 512) {
  std::vector<float> l(n), r(n); float* out[2] = {l.data(), r.data()};
  Render res;
  for (int b = 0; b < blocks; b++) {
    fx->processReplacing(fx, nullptr, out, n);
    for (int i = 0; i < n; i++) { if (!std::isfinite(l[i]) || !std::isfinite(r[i])) res.bad++; else res.peak = std::max(res.peak, std::max(std::fabs(l[i]), std::fabs(r[i]))); }
  }
  return res;
}
void pump(int ms) {
  DWORD end = GetTickCount() + ms; MSG m;
  while (GetTickCount() < end) { while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); } Sleep(10); }
}
}  // namespace

int main(int argc, char** argv) {
  const char* dll = argc > 1 ? argv[1] : "build\\WaveletSynthesizer.vst3\\Contents\\x86_64-win\\WaveletSynthesizer.dll";
  std::printf("VST2 smoke test: %s\n", dll);
  HMODULE mod = LoadLibraryA(dll);
  check(mod != nullptr, "the DLL loads");
  if (!mod) return 1;
  auto entry = (AEffect* (*)(HostCallback))GetProcAddress(mod, "VSTPluginMain");
  check(entry != nullptr, "exports VSTPluginMain");
  check(GetProcAddress(mod, "GetPluginFactory") != nullptr, "also exports GetPluginFactory (VST3)");
  if (!entry) return 1;
  check(entry(nullptr) == nullptr, "VSTPluginMain(nullptr) is refused");

  AEffect* fx = entry(&hostCb);
  check(fx && fx->magic == 0x56737450, "VSTPluginMain returns an AEffect ('VstP')");
  if (!fx) return 1;
  char buf[256];
  check(fx->numParams == kNumParams && fx->numPrograms == kNumPresets && fx->numInputs == 0 && fx->numOutputs == 2, "69 parameters, 32 programs, 0 in / 2 out");
  check((fx->flags & 1) && (fx->flags & 16) && (fx->flags & 32) && (fx->flags & 256), "flags: editor, replacing, chunks, synth");
  D(fx, 0);
  std::memset(buf, 0, sizeof buf); D(fx, 45, 0, 0, buf); check(!std::strcmp(buf, "Wavelet Synthesizer"), "effect name", buf);
  std::memset(buf, 0, sizeof buf); D(fx, 47, 0, 0, buf); check(!std::strcmp(buf, "OktoPierre"), "vendor", buf);
  check(D(fx, 35) == 2, "category: synth");
  check(D(fx, 51, 0, 0, (void*)"receiveVstMidiEvent") == 1, "canDo receiveVstMidiEvent");
  std::memset(buf, 0, sizeof buf); D(fx, 8, P_F_CUTOFF, 0, buf); check(buf[0] != 0 && std::strlen(buf) < 24, "parameter name (cutoff)", buf);
  std::memset(buf, 0, sizeof buf); D(fx, 7, P_F_CUTOFF, 0, buf); check(buf[0] != 0 && std::strlen(buf) < 24, "parameter display (cutoff)", buf);
  std::memset(buf, 0, sizeof buf); D(fx, 5, 0, 0, buf); check(!std::strcmp(buf, "A - Warm Pad"), "starts on program 'A - Warm Pad'", buf);
  std::memset(buf, 0, sizeof buf); D(fx, 29, 0, 0, buf); check(!std::strcmp(buf, "A - Square Mod 2"), "program 0 name", buf);
  check(D(fx, 29, kNumPresets, 0, buf) == 0, "program name out of range is refused");

  D(fx, 10, 0, 0, nullptr, 48000.0f); D(fx, 11, 0, 512); D(fx, 12, 0, 1);
  Render r0 = render(fx, 20); check(r0.bad == 0 && r0.peak < 1e-6, "silent before any note");
  midi(fx, 0x90, 60, 100);
  Render r1 = render(fx, 60);
  char d[96]; std::snprintf(d, sizeof d, "peak %.3f, %d non-finite", r1.peak, r1.bad);
  check(r1.bad == 0 && r1.peak > 1e-3 && r1.peak <= 1.0f, "a MIDI note sounds (finite, <= 0 dBFS)", d);
  midi(fx, 0x80, 60, 0);
  render(fx, 400);
  Render r2 = render(fx, 10); std::snprintf(d, sizeof d, "peak %.5f", r2.peak);
  check(r2.peak < 1e-3, "note off releases", d);
  midi(fx, 0xE0, 0x7F, 0x7F); render(fx, 1);
  check(std::fabs(fx->getParameter(fx, P_BEND) - 1.0f) < 1e-3, "pitch bend message -> Pitch Bend parameter");
  midi(fx, 0xE0, 0x00, 0x40); midi(fx, 0xB0, 1, 127); render(fx, 1);
  check(std::fabs(fx->getParameter(fx, P_MODWHEEL) - 1.0f) < 1e-3, "CC1 -> Mod Wheel parameter");
  midi(fx, 0xB0, 1, 0);
  midi(fx, 0x90, 64, 90); render(fx, 10); midi(fx, 0xB0, 123, 0); render(fx, 400);
  Render r3 = render(fx, 10); std::snprintf(d, sizeof d, "peak %.5f", r3.peak);
  check(r3.peak < 1e-3, "CC123 (all notes off) stops the notes", d);

  // programs
  bool progOk = true; int quietBefore = automateCalls;
  for (int k : {0, 5, 11, 31}) {
    D(fx, 2, 0, k);
    if (D(fx, 3) != k) progOk = false;
    for (int i = 0; i < kNumParams; i++)
      if (!kParams[i].hidden && std::fabs(fx->getParameter(fx, i) - (float)toNorm(kParams[i], kPresets[k].v[i])) > 1e-5) progOk = false;
    midi(fx, 0x90, 57, 100); midi(fx, 0x90, 64, 100);
    Render rp = render(fx, 40);
    if (rp.bad || rp.peak < 1e-3) progOk = false;
    midi(fx, 0xB0, 123, 0); render(fx, 300);
  }
  check(progOk, "programs 0, 5, 11, 31: selected, values = factory preset, they sound");
  check(automateCalls == quietBefore, "a program change sends no automation to the host");

  // parameters and chunks
  D(fx, 2, 0, 3);
  render(fx, 2);
  void* p = nullptr;
  intptr_t n1 = D(fx, 23, 0, 0, &p);
  std::vector<char> saved((char*)p, (char*)p + (n1 > 0 ? n1 : 0));
  check(n1 > 100, "getChunk returns the state");
  const float before = fx->getParameter(fx, P_F_CUTOFF);
  fx->setParameter(fx, P_F_CUTOFF, before > 0.5f ? 0.1f : 0.9f);
  check(std::fabs(fx->getParameter(fx, P_F_CUTOFF) - before) > 0.3f, "setParameter / getParameter");
  check(D(fx, 27, P_F_RES, 0, (void*)"6 dB") == 1 && std::fabs(fx->getParameter(fx, P_F_RES) - (float)toNorm(kParams[P_F_RES], 6.0)) < 1e-4, "string to parameter ('6 dB')");
  check(D(fx, 24, 0, (intptr_t)saved.size(), saved.data()) == 1, "setChunk accepts the saved state");
  check(std::fabs(fx->getParameter(fx, P_F_CUTOFF) - before) < 1e-6, "setChunk restores the values");
  check(D(fx, 3) == 3, "setChunk restores the program");
  std::mt19937 rng(7); int hostileOk = 1;
  for (int t = 0; t < 300; t++) {
    std::vector<char> c = saved;
    if (t % 3 == 0) c.resize(rng() % (c.size() + 1));
    else for (int k = 0; k < 4; k++) c[rng() % c.size()] = (char)rng();
    if (t % 7 == 0) { uint32_t big = 0xFFFFFFF0u; std::memcpy(c.data() + 4, &big, 4); }
    D(fx, 24, 0, (intptr_t)c.size(), c.data());
    for (int i = 0; i < kNumParams; i++) { float v = fx->getParameter(fx, i); if (!(v >= 0 && v <= 1)) hostileOk = 0; }
  }
  check(hostileOk, "300 damaged or hostile chunks: no crash, values stay in 0..1");
  D(fx, 24, 0, (intptr_t)saved.size(), saved.data());

  // editor
  WNDCLASSW wc{}; wc.lpfnWndProc = DefWindowProcW; wc.hInstance = GetModuleHandleW(nullptr); wc.lpszClassName = L"vst2smoke";
  RegisterClassW(&wc);
  HWND parent = CreateWindowW(L"vst2smoke", L"vst2 smoke", WS_OVERLAPPEDWINDOW, 0, 0, 1300, 900, nullptr, nullptr, wc.hInstance, nullptr);
  Rect* rc = nullptr;
  check(D(fx, 13, 0, 0, &rc) == 1 && rc && rc->right - rc->left >= 550 && rc->bottom - rc->top >= 360, "editor size");
  if (rc) { std::snprintf(d, sizeof d, "%d x %d", rc->right - rc->left, rc->bottom - rc->top); std::printf("        editor %s\n", d); }
  check(D(fx, 14, 0, 0, parent) == 1, "editor opens in the host window");
  pump(400);
  fx->setParameter(fx, P_F_CUTOFF, 0.25f); D(fx, 19); pump(200);
  check(GetWindow(parent, GW_CHILD) != nullptr, "the editor window is a child of the host window");
  D(fx, 15); pump(100);
  check(GetWindow(parent, GW_CHILD) == nullptr, "editor closes");
  check(D(fx, 14, 0, 0, parent) == 1, "editor reopens"); pump(200); D(fx, 15);

  // offline (render / freeze): a structural change is applied at once
  D(fx, 12, 0, 0); processLevel = 4; D(fx, 12, 0, 1);
  fx->setParameter(fx, P_WAVELET, 0.0f); midi(fx, 0x90, 60, 100);
  Render ro = render(fx, 30); check(ro.bad == 0 && ro.peak > 1e-3, "offline rendering sounds");
  midi(fx, 0xB0, 123, 0); render(fx, 200);
  D(fx, 12, 0, 0); processLevel = 0;

  // a second instance alongside
  AEffect* fx2 = entry(&hostCb);
  D(fx2, 0); D(fx2, 10, 0, 0, nullptr, 44100.0f); D(fx2, 11, 0, 256); D(fx2, 12, 0, 1);
  midi(fx2, 0x90, 48, 100); Render rb = render(fx2, 40, 256);
  check(rb.bad == 0 && rb.peak > 1e-3, "a second instance plays at 44.1 kHz");
  D(fx2, 12, 0, 0); D(fx2, 1);

  D(fx, 1);
  DestroyWindow(parent);
  FreeLibrary(mod);
  std::printf("%d PASS, %d FAIL\n", passes, fails);
  return fails ? 1 : 0;
}
