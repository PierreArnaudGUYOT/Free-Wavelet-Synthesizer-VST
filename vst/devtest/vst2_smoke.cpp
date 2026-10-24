// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer check of the VST2 entry point: loads build\OktoMultiWaveSynth.vst3\Contents\x86_64-win\OktoMultiWaveSynth.dll
// like a VST2 host does (LoadLibrary + VSTPluginMain) and exercises audio, MIDI, parameters, programs, chunks and the editor.
//   x86_64-w64-mingw32-clang++ -std=c++17 -O2 -static -I vst/external -I vst/src vst/devtest/vst2_smoke.cpp -o vst2_smoke.exe -luser32 -lgdi32
//   vst2_smoke.exe [path\to\OktoMultiWaveSynth.dll]
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
// the host's time info (audioMasterGetTime): version 1.0.12, the transport state reaches the plug-in as it does a VST3 one
struct TimeInfo {
  double samplePos, sampleRate, nanoSeconds, ppqPos, tempo, barStartPos, cycleStartPos, cycleEndPos;
  int32_t timeSigNumerator, timeSigDenominator, smpteOffset, smpteFrameRate, samplesToNextClock, flags;
};
constexpr int32_t kTransportPlaying = 1 << 1;
TimeInfo gTime{}; bool gTimeOn = false;

int fails = 0, passes = 0;
// the program names of the VST2 host: the middle dot of a name is written as a hyphen
static std::string asciiName(const char* n) { std::string s; for (const char* p = n; *p; p++) { if ((unsigned char)p[0] == 0xC2 && (unsigned char)p[1] == 0xB7) { s += '-'; p++; } else s += *p; } return s; }
void check(bool ok, const char* what, const char* detail = "") {
  std::printf("  [%s] %s%s%s\n", ok ? "PASS" : "FAIL", what, *detail ? "  -- " : "", detail);
  (ok ? passes : fails)++;
}
int automateCalls = 0, processLevel = 0;
intptr_t hostCb(AEffect*, int32_t op, int32_t index, intptr_t value, void*, float) {
  switch (op) {
    case 0: automateCalls++; return 0;    // audioMasterAutomate
    case 1: return 2400;                  // audioMasterVersion
    case 7: return gTimeOn ? (intptr_t)&gTime : 0;   // audioMasterGetTime
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
struct Render { float peak = 0; int bad = 0; double rms = 0; };
Render render(AEffect* fx, int blocks, int n = 512) {
  std::vector<float> l(n), r(n); float* out[2] = {l.data(), r.data()};
  Render res;
  double ss = 0;
  for (int b = 0; b < blocks; b++) {
    fx->processReplacing(fx, nullptr, out, n);
    for (int i = 0; i < n; i++) { if (!std::isfinite(l[i]) || !std::isfinite(r[i])) res.bad++; else { res.peak = std::max(res.peak, std::max(std::fabs(l[i]), std::fabs(r[i]))); ss += (double)l[i] * l[i] + (double)r[i] * r[i]; } }
  }
  res.rms = std::sqrt(ss / (2.0 * n * std::max(1, blocks)));
  return res;
}
void pump(int ms) {
  DWORD end = GetTickCount() + ms; MSG m;
  while (GetTickCount() < end) { while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); } Sleep(10); }
}
}  // namespace

int main(int argc, char** argv) {
  const char* dll = argc > 1 ? argv[1] : "build\\OktoMultiWaveSynth.vst3\\Contents\\x86_64-win\\OktoMultiWaveSynth.dll";
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
  // (version 1.0.12: the host sees the parameters but the three triggers of the MIDI panic messages; version 1.0.15: nor the hidden performance settings appended after them)
  check(fx->numParams == P_MIDI_ASOFF && P_MIDI_ANOFF == P_MIDI_ASOFF + 2 && kNumParams > P_MIDI_ANOFF && fx->numPrograms == kNumPresets && fx->numInputs == 0 && fx->numOutputs == 2, "the parameters (without the 3 MIDI triggers and the hidden settings after them), the programs, 0 in / 2 out");
  check((fx->flags & 1) && (fx->flags & 16) && (fx->flags & 32) && (fx->flags & 256), "flags: editor, replacing, chunks, synth");
  D(fx, 0);
  std::memset(buf, 0, sizeof buf); D(fx, 45, 0, 0, buf); check(!std::strcmp(buf, "Okto Fractal Wavelet"), "effect name", buf);   // (version 1.0.17: the plug-in's name in hosts)
  std::memset(buf, 0, sizeof buf); D(fx, 47, 0, 0, buf); check(!std::strcmp(buf, "OktoPierre"), "vendor", buf);
  check(D(fx, 35) == 2, "category: synth");
  check(D(fx, 51, 0, 0, (void*)"receiveVstMidiEvent") == 1, "canDo receiveVstMidiEvent");
  std::memset(buf, 0, sizeof buf); D(fx, 8, P_F_CUTOFF, 0, buf); check(buf[0] != 0 && std::strlen(buf) < 24, "parameter name (cutoff)", buf);
  std::memset(buf, 0, sizeof buf); D(fx, 7, P_F_CUTOFF, 0, buf); check(buf[0] != 0 && std::strlen(buf) < 24, "parameter display (cutoff)", buf);
  std::memset(buf, 0, sizeof buf); D(fx, 5, 0, 0, buf); check(asciiName(kPresets[kDefaultPreset].name).substr(0, 23) == buf, "starts on the default program (the first TOP Sound; a VST2 program name holds 23 characters)", buf);   // (version 1.0.14: AA - Flint Ripple Haze LGT is 26)
  std::memset(buf, 0, sizeof buf); D(fx, 29, 0, 0, buf); check(!std::strcmp(buf, asciiName(kPresets[0].name).c_str()), "program 0 name (the first TOP Sound)", buf);
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

  // version 1.0.12: the sustain pedal, the transport stop and the MIDI panic messages (a host that stopped used to leave the notes the pedal held sounding for ever)
  {
    auto later = [&](int quiet, int look) { render(fx, quiet); return render(fx, look).peak; };   // the peak of `look` blocks after `quiet` blocks
    auto two = [&](unsigned char a1, unsigned char b1, unsigned char c1, int32_t at1, unsigned char a2, unsigned char b2, unsigned char c2, int32_t at2) {
      MidiEvent e1{}, e2{};
      e1.type = e2.type = 1; e1.byteSize = e2.byteSize = sizeof e1;
      e1.midiData[0] = a1; e1.midiData[1] = b1; e1.midiData[2] = c1; e1.deltaFrames = at1;
      e2.midiData[0] = a2; e2.midiData[1] = b2; e2.midiData[2] = c2; e2.deltaFrames = at2;
      Events ev{}; ev.numEvents = 2; ev.events[0] = &e1; ev.events[1] = &e2;
      D(fx, 25, 0, 0, &ev);
    };
    gTimeOn = true; gTime.sampleRate = 48000; gTime.flags = kTransportPlaying; render(fx, 2);
    midi(fx, 0xB0, 64, 127); midi(fx, 0x90, 60, 100); render(fx, 30); midi(fx, 0x80, 60, 0);
    float held = later(100, 10); std::snprintf(d, sizeof d, "peak %.4f", held);
    check(held > 1e-3, "CC64 (sustain pedal) down: a released note is held", d);
    gTime.flags = 0;   // STOP: the pedal is still down
    float stopped = later(400, 10); std::snprintf(d, sizeof d, "peak %.5f", stopped);
    check(stopped < 1e-3, "transport stop with the pedal down: the held note is released", d);
    midi(fx, 0x90, 64, 100); render(fx, 30); midi(fx, 0x80, 64, 0);
    float next = later(400, 10); std::snprintf(d, sizeof d, "peak %.5f", next);
    check(next < 1e-3, "after the stop the pedal is up: the next note is not held", d);
    gTime.flags = kTransportPlaying; render(fx, 2);
    midi(fx, 0x90, 60, 100); midi(fx, 0x90, 64, 100); render(fx, 30);
    gTime.flags = 0;   // STOP without any note off
    stopped = later(400, 10); std::snprintf(d, sizeof d, "peak %.5f", stopped);
    check(stopped < 1e-3, "transport stop with notes held and no note off: they are released", d);
    gTime.flags = kTransportPlaying; render(fx, 2);
    midi(fx, 0xB0, 64, 127); midi(fx, 0x90, 60, 100); render(fx, 30); midi(fx, 0x80, 60, 0);
    held = later(60, 10);
    midi(fx, 0xB0, 123, 0);
    float cc123 = later(400, 10); std::snprintf(d, sizeof d, "held %.4f, then %.5f", held, cc123);
    check(held > 1e-3 && cc123 < 1e-3, "CC123 releases the notes the pedal holds", d);
    midi(fx, 0x90, 64, 100); render(fx, 30); midi(fx, 0x80, 64, 0);
    next = later(400, 10); std::snprintf(d, sizeof d, "peak %.5f", next);
    check(next < 1e-3, "after CC123 the pedal is up: the next note is not held", d);
    midi(fx, 0xB0, 64, 127); midi(fx, 0x90, 60, 100); render(fx, 30); midi(fx, 0x80, 60, 0);
    held = later(60, 10);
    midi(fx, 0xB0, 121, 0);
    float cc121 = later(400, 10); std::snprintf(d, sizeof d, "held %.4f, then %.5f", held, cc121);
    check(held > 1e-3 && cc121 < 1e-3, "CC121 (reset all controllers) lifts the pedal: the held notes are released", d);
    midi(fx, 0x90, 60, 100); midi(fx, 0x90, 64, 100); float sounding = render(fx, 30).peak;
    midi(fx, 0xB0, 120, 0);
    float pk = render(fx, 1).peak, rest = later(40, 10); std::snprintf(d, sizeof d, "sounding %.4f, block of the message %.5f, later %.6f", sounding, pk, rest);
    check(sounding > 1e-3 && pk < sounding * 0.1f && rest < 1e-4, "CC120 (all sound off) silences the voices and the tails at once", d);
    // the pedal keeps its place in the block: the note off (frame 5) comes before the pedal goes down (frame 100)
    midi(fx, 0x90, 60, 100); render(fx, 30);
    two(0x80, 60, 0, 5, 0xB0, 64, 127, 100);
    float order = later(400, 10); std::snprintf(d, sizeof d, "peak %.5f", order);
    check(order < 1e-3, "note off at frame 5, pedal down at frame 100 of the same block: the note is not held", d);
    midi(fx, 0xB0, 64, 0); render(fx, 2);
    midi(fx, 0x90, 60, 100); render(fx, 30);
    two(0xB0, 64, 127, 5, 0x80, 60, 0, 100);
    float orderB = later(100, 10); std::snprintf(d, sizeof d, "peak %.4f", orderB);
    check(orderB > 1e-3, "pedal down at frame 5, note off at frame 100 of the same block: the note is held", d);
    midi(fx, 0xB0, 64, 0); render(fx, 400);
    gTimeOn = false;
  }

  // Okto MultiWave Synth: the chord keyboard through the VST2 entry point (MIDI in, the processor's chord type out to the host)
  {
    {   // a steady, sustained sound for the chord test (the default program is the first TOP Sound, which changes with the owner's ratings: a siren sweep in version 1.0.2)
      int k = 0; for (int i = 0; i < kNumPresets; i++) if (!std::strcmp(kPresets[i].name, "A " "\xC2\xB7" " Warm Pad")) k = i;
      D(fx, 2, 0, k); render(fx, 4);
    }
    midi(fx, 0x90, 67, 100); Render single = render(fx, 60); midi(fx, 0x80, 67, 0); render(fx, 400);
    fx->setParameter(fx, P_CHORD_MODE, 1.0f); render(fx, 1);
    const int autoBefore = automateCalls;
    midi(fx, 0x90, 50, 100); Render sel = render(fx, 20); midi(fx, 0x80, 50, 0); render(fx, 2);
    const float want = (float)toNorm(kParams[P_CHORD_TYPE], 2);
    std::snprintf(d, sizeof d, "peak %.6f, Chord Type %.3f (want %.3f), %d automation call(s)", sel.peak, fx->getParameter(fx, P_CHORD_TYPE), want, automateCalls - autoBefore);
    check(sel.peak < 1e-6 && std::fabs(fx->getParameter(fx, P_CHORD_TYPE) - want) < 1e-4 && automateCalls > autoBefore,
          "chord keyboard: the selector key D3 is silent, sets Chord Type to 7 and tells the host", d);
    midi(fx, 0x90, 67, 100); Render chord = render(fx, 60);
    std::snprintf(d, sizeof d, "rms %.4f vs %.4f for the single note, peak %.3f", chord.rms, single.rms, chord.peak);
    // (version 1.0.18: 1.25 times, was 1.5: the author's Warm Pad has an OTA filter at 1395 Hz now, which softens the chord's upper notes: 1.41; one note alone is 1.0)
    check(chord.bad == 0 && chord.peak <= 1.0f && chord.rms > 1.25 * single.rms, "chord keyboard: G4 plays the whole G7 chord (louder than the note alone)", d);
    midi(fx, 0x80, 67, 0); render(fx, 400); Render off = render(fx, 10);
    std::snprintf(d, sizeof d, "peak %.5f", off.peak);
    check(off.peak < 1e-3, "chord keyboard: releasing the root releases the chord", d);
    fx->setParameter(fx, P_CHORD_MODE, 0.0f); fx->setParameter(fx, P_CHORD_TYPE, 0.0f); render(fx, 1);
  }

  // programs
  bool progOk = true; int quietBefore = automateCalls; char progD[256] = "";
  for (int k : {0, 5, 11, 31}) {
    D(fx, 2, 0, k);
    if (D(fx, 3) != k) progOk = false;
    for (int i = 0; i < kNumParams; i++)
      if (!kParams[i].hidden && std::fabs(fx->getParameter(fx, i) - (float)toNorm(kParams[i], kPresets[k].v[i])) > 1e-5) progOk = false;
    // the wave tables of the new program come from the builder thread: a host's real-time blocks give it the time, this test does
    // not (without this pause a note started at once could meet the old tables, with the new oscillator levels, and stay silent)
    Sleep(150); render(fx, 2);
    midi(fx, 0x90, 57, 100); midi(fx, 0x90, 64, 100);
    Render rp = render(fx, 40);
    if (rp.bad || rp.peak < 1e-3) { progOk = false; std::snprintf(progD + std::strlen(progD), sizeof progD - std::strlen(progD), " [program %d: peak %.5f, %d bad]", k, rp.peak, rp.bad); }
    midi(fx, 0xB0, 123, 0); render(fx, 300);
  }
  check(progOk, "programs 0, 5, 11, 31: selected, values = factory preset, they sound", progD);
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
  check(D(fx, 14, 0, 0, parent) == 1, "editor reopens"); pump(200);
  // Okto MultiWave Synth: vst2_smoke.exe <dll> <shot.bmp> also saves the editor with CHORD on and G major 7 held (a visual check)
  if (argc > 2) {
    fx->setParameter(fx, P_CHORD_MODE, 1.0f); fx->setParameter(fx, P_CHORD_TYPE, (float)toNorm(kParams[P_CHORD_TYPE], 4)); D(fx, 19);
    midi(fx, 0x90, 67, 100);
    ShowWindow(parent, SW_SHOWNOACTIVATE); SetWindowPos(parent, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    for (int k = 0; k < 10; k++) { render(fx, 4); D(fx, 19); pump(80); }
    HWND ed = GetWindow(parent, GW_CHILD); RECT r{}; GetClientRect(ed, &r);
    const int W = r.right, H = r.bottom;
    HDC wdc = GetDC(ed), mdc = CreateCompatibleDC(wdc); HBITMAP bm = CreateCompatibleBitmap(wdc, W, H); HGDIOBJ old = SelectObject(mdc, bm);
    BitBlt(mdc, 0, 0, W, H, wdc, 0, 0, SRCCOPY);   // the visible window, as drawn
    BITMAPINFOHEADER bi{}; bi.biSize = sizeof bi; bi.biWidth = W; bi.biHeight = -H; bi.biPlanes = 1; bi.biBitCount = 32; bi.biCompression = BI_RGB;
    std::vector<uint8_t> px((size_t)W * H * 4);
    GetDIBits(mdc, bm, 0, H, px.data(), (BITMAPINFO*)&bi, DIB_RGB_COLORS);
    SelectObject(mdc, old); DeleteObject(bm); DeleteDC(mdc); ReleaseDC(ed, wdc);
    BITMAPFILEHEADER fh{}; fh.bfType = 0x4D42; fh.bfOffBits = sizeof fh + sizeof bi; fh.bfSize = fh.bfOffBits + (DWORD)px.size();
    FILE* out = std::fopen(argv[2], "wb");
    if (out) { std::fwrite(&fh, sizeof fh, 1, out); std::fwrite(&bi, sizeof bi, 1, out); std::fwrite(px.data(), 1, px.size(), out); std::fclose(out); }
    std::printf("        editor screenshot %d x %d -> %s\n", W, H, argv[2]);
    ShowWindow(parent, SW_HIDE);
    midi(fx, 0x80, 67, 0); render(fx, 4);
    fx->setParameter(fx, P_CHORD_MODE, 0.0f); fx->setParameter(fx, P_CHORD_TYPE, 0.0f); render(fx, 1);
  }
  D(fx, 15);

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
