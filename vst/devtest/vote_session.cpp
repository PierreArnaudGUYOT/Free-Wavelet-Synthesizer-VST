// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer check of the plug-in's editor window (the file keeps the name of the EVALUATE SOUNDS test it used to be: that session was
// removed in the final version). Loads the VST3 like a host (one thread: window messages + real-time paced audio blocks) and
// opens the editor in an off-screen window: the three folder tabs choose the oscillator shown, CHORD MODE (the chord card, keys and
// pads play chords, the window fits the screen), the preset browser following the preset box and the stars of its rows (the presets
// file is written to <outdir>\data through WS_PRESETS_FILE: never the player's own file). Saves screenshots (header, panel, browser).
//   x86_64-w64-mingw32-clang++ -std=c++17 -O2 -static -municode -DUNICODE -D_UNICODE -DNOMINMAX -I vst/external -I vst/src
//     vst/devtest/vote_session.cpp vst/src/iids.cpp vst/external/pluginterfaces/base/funknown.cpp -o vote_session.exe
//     -lgdiplus -lgdi32 -luser32 -lole32 -luuid
//   vote_session.exe <path\to\OktoMultiWaveSynth.vst3 dll> <outdir>
#include <windows.h>
#include <algorithm>
namespace Gdiplus { using std::min; using std::max; }
#include <gdiplus.h>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <thread>
#include <vector>
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "generated/spec.h"

using namespace Steinberg;
using namespace Steinberg::Vst;
namespace G = Gdiplus;
using namespace ws;

static int gFails = 0;
static void check(bool ok, const char* what, const std::string& detail = {}) {
  std::printf("  [%s] %s%s%s\n", ok ? "PASS" : "FAIL", what, detail.empty() ? "" : "  -- ", detail.c_str());
  if (!ok) gFails++;
  std::fflush(stdout);   // nothing lost if a run is stopped
}
static std::string fmt(const char* f, double a, double b = 0, double c = 0) { char s[256]; std::snprintf(s, sizeof s, f, a, b, c); return s; }

// ------------------------------------------------------------------ host objects
struct Handler final : public IComponentHandler, public IComponentHandler2 {
  std::vector<std::pair<ParamID, double>> pending;
  int edits = 0, open = 0, badNesting = 0;
  tresult PLUGIN_API beginEdit(ParamID) override { open++; return kResultOk; }
  tresult PLUGIN_API performEdit(ParamID id, ParamValue v) override { if (open <= 0) badNesting++; pending.push_back({id, v}); edits++; return kResultOk; }
  tresult PLUGIN_API endEdit(ParamID) override { open--; return kResultOk; }
  tresult PLUGIN_API restartComponent(int32) override { return kResultOk; }
  tresult PLUGIN_API setDirty(TBool) override { return kResultOk; }
  tresult PLUGIN_API requestOpenEditor(FIDString) override { return kResultFalse; }
  tresult PLUGIN_API startGroupEdit() override { return kResultOk; }
  tresult PLUGIN_API finishGroupEdit() override { return kResultOk; }
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(iid, IComponentHandler::iid) || FUnknownPrivate::iidEqual(iid, FUnknown::iid)) { *obj = static_cast<IComponentHandler*>(this); return kResultOk; }
    if (FUnknownPrivate::iidEqual(iid, IComponentHandler2::iid)) { *obj = static_cast<IComponentHandler2*>(this); return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
  uint32 PLUGIN_API addRef() override { return 1; }
  uint32 PLUGIN_API release() override { return 1; }
};
struct Queue final : public IParamValueQueue {
  ParamID id = 0; std::vector<std::pair<int32, ParamValue>> pts;
  ParamID PLUGIN_API getParameterId() override { return id; }
  int32 PLUGIN_API getPointCount() override { return (int32)pts.size(); }
  tresult PLUGIN_API getPoint(int32 i, int32& off, ParamValue& v) override {
    if (i < 0 || i >= (int32)pts.size()) return kResultFalse;
    off = pts[i].first; v = pts[i].second; return kResultOk;
  }
  tresult PLUGIN_API addPoint(int32 off, ParamValue v, int32& i) override { i = (int32)pts.size(); pts.push_back({off, v}); return kResultOk; }
  tresult PLUGIN_API queryInterface(const TUID, void** obj) override { *obj = nullptr; return kNoInterface; }
  uint32 PLUGIN_API addRef() override { return 1; }
  uint32 PLUGIN_API release() override { return 1; }
};
struct Changes final : public IParameterChanges {
  std::vector<Queue> qs = std::vector<Queue>(512); int32 used = 0;
  void clear() { for (int32 i = 0; i < used; i++) qs[i].pts.clear(); used = 0; }
  void add(ParamID id, double v) {   // the last value of a parameter wins (block start)
    for (int32 i = 0; i < used; i++) if (qs[i].id == id) { qs[i].pts.assign(1, {0, v}); return; }
    if (used < (int32)qs.size()) { qs[used].id = id; qs[used].pts.assign(1, {0, v}); used++; }
  }
  int32 PLUGIN_API getParameterCount() override { return used; }
  IParamValueQueue* PLUGIN_API getParameterData(int32 i) override { return i >= 0 && i < used ? &qs[i] : nullptr; }
  IParamValueQueue* PLUGIN_API addParameterData(const ParamID& id, int32& i) override { add(id, 0); i = used - 1; return &qs[i]; }
  tresult PLUGIN_API queryInterface(const TUID, void** obj) override { *obj = nullptr; return kNoInterface; }
  uint32 PLUGIN_API addRef() override { return 1; }
  uint32 PLUGIN_API release() override { return 1; }
};
struct Events final : public IEventList {
  int32 PLUGIN_API getEventCount() override { return 0; }
  tresult PLUGIN_API getEvent(int32, Event&) override { return kResultFalse; }
  tresult PLUGIN_API addEvent(Event&) override { return kResultFalse; }
  tresult PLUGIN_API queryInterface(const TUID, void** obj) override { *obj = nullptr; return kNoInterface; }
  uint32 PLUGIN_API addRef() override { return 1; }
  uint32 PLUGIN_API release() override { return 1; }
};

// ------------------------------------------------------------------ the host
static const int SR = 48000, BLOCK = 512;
struct Host {
  IComponent* comp = nullptr; IAudioProcessor* proc = nullptr; IEditController* ctrl = nullptr; IPlugView* view = nullptr;
  Handler handler; Changes changes; Events events;
  std::vector<float> L = std::vector<float>(BLOCK), Rr = std::vector<float>(BLOCK);
  HWND top = nullptr, ed = nullptr;
  float peak = 0;   // since the last resetPeak()
  bool badSample = false;

  void block() {
    changes.clear();
    for (auto& p : handler.pending) changes.add(p.first, p.second);
    handler.pending.clear();
    ProcessData d{};
    d.processMode = kRealtime; d.symbolicSampleSize = kSample32; d.numSamples = BLOCK;
    AudioBusBuffers out{}; float* ch[2] = {L.data(), Rr.data()};
    out.numChannels = 2; out.channelBuffers32 = ch;
    d.numOutputs = 1; d.outputs = &out; d.inputParameterChanges = &changes; d.inputEvents = &events;
    proc->process(d);
    for (int i = 0; i < BLOCK; i++) {
      if (!std::isfinite(L[i]) || !std::isfinite(Rr[i])) badSample = true;
      peak = std::max(peak, std::max(std::fabs(L[i]), std::fabs(Rr[i])));
    }
  }
  void pump() { MSG m; while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); } }
  // runs the host for s seconds of audio, paced to the wall clock like a real audio device
  void run(double s) {
    const auto t0 = std::chrono::steady_clock::now();
    const int n = (int)std::ceil(s * SR / BLOCK);
    for (int k = 0; k < n; k++) {
      pump();
      block();
      const double due = (k + 1) * (double)BLOCK / SR, now = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
      if (due > now) std::this_thread::sleep_for(std::chrono::duration<double>(due - now));
    }
    pump();
  }
  void resetPeak() { peak = 0; }
  double plain(int id) { return ctrl->normalizedParamToPlain(id, ctrl->getParamNormalized(id)); }
  void click(float x, float y) {
    const LPARAM p = MAKELPARAM((int)std::lround(x), (int)std::lround(y));
    SendMessageW(ed, WM_MOUSEMOVE, 0, p);
    SendMessageW(ed, WM_LBUTTONDOWN, MK_LBUTTON, p);
    SendMessageW(ed, WM_LBUTTONUP, 0, p);
    pump();
  }
  void drag(float x, float y, float dy) {
    SendMessageW(ed, WM_MOUSEMOVE, 0, MAKELPARAM((int)x, (int)y));
    SendMessageW(ed, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM((int)x, (int)y));
    for (int k = 1; k <= 10; k++) SendMessageW(ed, WM_MOUSEMOVE, MK_LBUTTON, MAKELPARAM((int)x, (int)std::lround(y + dy * k / 10)));
    SendMessageW(ed, WM_LBUTTONUP, 0, MAKELPARAM((int)x, (int)std::lround(y + dy)));
    pump();
  }
  // beta 0.3.4: the colours (0xRRGGBB) of some pixels of the editor window, as the screenshot shows them
  std::vector<uint32_t> pixels(const std::vector<POINT>& pts) {
    RECT rc; GetClientRect(top, &rc);
    HDC sdc = GetDC(nullptr); HDC mdc = CreateCompatibleDC(sdc);
    HBITMAP bmp = CreateCompatibleBitmap(sdc, rc.right, rc.bottom); HGDIOBJ old = SelectObject(mdc, bmp);
    SetWindowPos(top, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    RedrawWindow(top, nullptr, nullptr, RDW_INVALIDATE | RDW_UPDATENOW | RDW_ALLCHILDREN);
    pump(); Sleep(60);
    PrintWindow(top, mdc, 2 /* PW_RENDERFULLCONTENT */);
    std::vector<uint32_t> out;
    for (const POINT& p : pts) { const COLORREF c = GetPixel(mdc, p.x, p.y); out.push_back(((uint32_t)GetRValue(c) << 16) | ((uint32_t)GetGValue(c) << 8) | GetBValue(c)); }
    SelectObject(mdc, old);
    SetWindowPos(top, HWND_NOTOPMOST, -4000, 0, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE);
    DeleteObject(bmp); DeleteDC(mdc); ReleaseDC(nullptr, sdc);
    return out;
  }
  void shot(const std::wstring& file) {
    RECT rc; GetClientRect(top, &rc);
    HDC sdc = GetDC(nullptr); HDC mdc = CreateCompatibleDC(sdc);
    HBITMAP bmp = CreateCompatibleBitmap(sdc, rc.right, rc.bottom); HGDIOBJ old = SelectObject(mdc, bmp);
    // an off-screen window is not repainted: shown on screen for an instant, fully repainted, captured, hidden again
    SetWindowPos(top, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    RedrawWindow(top, nullptr, nullptr, RDW_INVALIDATE | RDW_UPDATENOW | RDW_ALLCHILDREN);
    pump(); Sleep(60);
    PrintWindow(top, mdc, 2 /* PW_RENDERFULLCONTENT */);
    SelectObject(mdc, old);
    SetWindowPos(top, HWND_NOTOPMOST, -4000, 0, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE);
    {
      G::Bitmap b(bmp, nullptr);
      UINT num = 0, size = 0; G::GetImageEncodersSize(&num, &size);
      std::vector<char> buf(size); auto* enc = (G::ImageCodecInfo*)buf.data(); G::GetImageEncoders(num, size, enc);
      for (UINT i = 0; i < num; i++) if (std::wcscmp(enc[i].MimeType, L"image/png") == 0) { const G::Status stt = b.Save(file.c_str(), &enc[i].Clsid, nullptr); if (stt != G::Ok) std::printf("  (screenshot %ls not saved: GDI+ status %d, %ldx%ld)\n", file.c_str(), (int)stt, rc.right, rc.bottom); }
    }
    DeleteObject(bmp); DeleteDC(mdc); ReleaseDC(nullptr, sdc);
  }
};

static std::string readFile(const std::wstring& p) {
  FILE* f = _wfopen(p.c_str(), L"rb"); if (!f) return "";
  std::string s; char b[4096]; size_t n; while ((n = std::fread(b, 1, sizeof b, f)) > 0) s.append(b, n); std::fclose(f); return s;
}

// the centre of the first widget of a type / of a parameter (in a section shown for the oscillator `view`)
static bool widgetCenter(int type, int param, int view, float& cx, float& cy) {
  for (int s = 0; s < kNumSections; s++) {
    const SectionDef& sd = kSections[s];
    if (sd.view >= 0 && sd.view != view) continue;
    for (int k = 0; k < sd.numWidgets; k++) {
      const WidgetDef& w = kWidgets[sd.firstWidget + k];
      if (w.type != type || w.param != param) continue;
      cx = sd.x + w.x + w.w / 2; cy = sd.y + w.y + w.h / 2;
      return true;
    }
  }
  return false;
}

// version 1.0.9: the box (x, y, w, h) of the first widget of a type and a parameter
static bool widgetBoxOf(int type, int param, float* b) {
  for (int s = 0; s < kNumSections; s++) {
    const SectionDef& sd = kSections[s];
    for (int k = 0; k < sd.numWidgets; k++) {
      const WidgetDef& w = kWidgets[sd.firstWidget + k];
      if (w.type != type || w.param != param) continue;
      b[0] = sd.x + w.x; b[1] = sd.y + w.y; b[2] = w.w; b[3] = w.h;
      return true;
    }
  }
  return false;
}

// the box of the first widget of a type (any parameter) in a section shown for every oscillator
static bool widgetBox(int type, float* b) {
  for (int s = 0; s < kNumSections; s++) {
    const SectionDef& sd = kSections[s];
    for (int k = 0; k < sd.numWidgets; k++) {
      const WidgetDef& w = kWidgets[sd.firstWidget + k];
      if (w.type != type) continue;
      b[0] = sd.x + w.x; b[1] = sd.y + w.y; b[2] = w.w; b[3] = w.h;
      return true;
    }
  }
  return false;
}

static LRESULT CALLBACK topProc(HWND h, UINT m, WPARAM w, LPARAM l) { return DefWindowProcW(h, m, w, l); }

int wmain(int argc, wchar_t** argv) {
  if (argc < 3) { std::printf("usage: vote_session.exe <plugin dll> <outdir>\n"); return 2; }
  const std::wstring dll = argv[1], out = argv[2], dataDir = out + L"\\data";
  CreateDirectoryW(out.c_str(), nullptr); CreateDirectoryW(dataDir.c_str(), nullptr);
  SetEnvironmentVariableW(L"MW_WORKAREA", L"3840x2160");   // beta 0.3.2: the window fits the screen; the tests click at 100 %, so the screen is a large one (the fit is tested below)
  const std::wstring presetsFile = dataDir + L"\\presets.txt";   // beta 0.3.1: the library file (the stars of the browser): never the player's own file
  DeleteFileW(presetsFile.c_str());
  SetEnvironmentVariableW(L"WS_PRESETS_FILE", presetsFile.c_str());
  G::GdiplusStartupInput gi; ULONG_PTR gt; G::GdiplusStartup(&gt, &gi, nullptr);
  SetProcessDPIAware();

  HMODULE mod = LoadLibraryW(dll.c_str());
  if (!mod) { std::printf("cannot load %ls\n", dll.c_str()); return 2; }
  auto getFactory = (IPluginFactory * (PLUGIN_API*)())GetProcAddress(mod, "GetPluginFactory");
  auto initDll = (bool (*)())GetProcAddress(mod, "InitDll");
  if (initDll) initDll();
  IPluginFactory* fac = getFactory();
  PClassInfo ci0, ci1; fac->getClassInfo(0, &ci0); fac->getClassInfo(1, &ci1);
  Host h;
  fac->createInstance(ci0.cid, IComponent::iid, (void**)&h.comp);
  fac->createInstance(ci1.cid, IEditController::iid, (void**)&h.ctrl);
  h.comp->initialize(nullptr); h.ctrl->initialize(nullptr);
  h.comp->queryInterface(IAudioProcessor::iid, (void**)&h.proc);
  IConnectionPoint *cpA = nullptr, *cpB = nullptr;
  h.comp->queryInterface(IConnectionPoint::iid, (void**)&cpA); h.ctrl->queryInterface(IConnectionPoint::iid, (void**)&cpB);
  cpA->connect(cpB); cpB->connect(cpA);
  h.ctrl->setComponentHandler(&h.handler);
  SpeakerArrangement st = SpeakerArr::kStereo;
  h.proc->setBusArrangements(nullptr, 0, &st, 1);
  ProcessSetup ps{kRealtime, kSample32, BLOCK, (SampleRate)SR};
  h.proc->setupProcessing(ps);
  h.comp->setActive(true); h.proc->setProcessing(true);

  // the editor, at 100 %, in an off-screen window
  WNDCLASSW wc{}; wc.lpfnWndProc = topProc; wc.hInstance = GetModuleHandleW(nullptr); wc.lpszClassName = L"MwWindowTestTop";
  RegisterClassW(&wc);
  h.top = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, wc.lpszClassName, L"window test", WS_POPUP | WS_VISIBLE, -4000, 0, 1100, kDeviceH + kChordH, nullptr, nullptr, wc.hInstance, nullptr);
  h.view = h.ctrl->createView(ViewType::kEditor);
  IPlugViewContentScaleSupport* sc = nullptr;
  if (h.view->queryInterface(IPlugViewContentScaleSupport::iid, (void**)&sc) == kResultOk && sc) { sc->setContentScaleFactor(1.0f); sc->release(); }
  check(h.view->attached(h.top, kPlatformTypeHWND) == kResultOk, "editor attached");
  h.ed = FindWindowExW(h.top, nullptr, L"OktoMultiWaveSynthEditorWnd", nullptr);
  check(h.ed != nullptr, "editor window found");
  h.run(0.5);

  // beta 0.3: the three folder tabs OSC1 A1 | OSC2 A2 | OSC3 B1 choose the oscillator shown (and leave the sound alone)
  std::printf("0. the folder tabs choose the oscillator shown\n");
  {
    float ob[4] = {};
    check(widgetBox(W_OSCTABS, ob), "folder tabs in the layout", fmt("(%.0f, %.0f)", ob[0], ob[1]));
    const float fy = ob[1] + 17;
    auto tab = [&](int k) { return ob[0] + k * 182 + 88; };   // tab k: x + k * 182, 176 wide
    check(h.plain(P_OSC_VIEW) == 0, "a new instance shows A1", fmt("osc_view %.0f", h.plain(P_OSC_VIEW)));
    h.shot(out + L"\\0_view_A1.png");
    h.click(tab(1), fy); h.run(0.15);
    check(h.plain(P_OSC_VIEW) == 1, "the folder tab OSC2 A2 shows A2", fmt("osc_view %.0f", h.plain(P_OSC_VIEW)));
    h.shot(out + L"\\0_view_A2.png");
    h.click(tab(2), fy); h.run(0.15);
    check(h.plain(P_OSC_VIEW) == 2, "the folder tab OSC3 B1 shows B1", fmt("osc_view %.0f", h.plain(P_OSC_VIEW)));
    h.shot(out + L"\\0_view_B1.png");
    h.click(tab(0), fy); h.run(0.15);
    check(h.plain(P_OSC_VIEW) == 0, "the folder tab OSC1 A1 shows A1", fmt("osc_view %.0f", h.plain(P_OSC_VIEW)));
  }
  std::printf("1. CHORD MODE: the panel grows, the chord card shows, keys and pads play chords, off again\n");
  {
    float cm[2], pads[4], kb[4], plate[4];
    check(widgetCenter(W_TOGGLE, P_CHORD_MODE, 0, cm[0], cm[1]), "CHORD MODE toggle in the layout", fmt("(%.0f, %.0f)", cm[0], cm[1]));
    check(widgetBox(W_CHORDPADS, pads) && widgetBox(W_KEYBOARD, kb) && widgetBox(W_STRUMPLATE, plate), "chord pads, keyboard and strum plate in the layout");
    ViewRect vr; h.view->getSize(&vr);
    check(vr.getHeight() == kDeviceH && h.plain(P_CHORD_MODE) == 0, "chord mode off: the panel's own height", fmt("%.0f", vr.getHeight()));
    h.click(cm[0], cm[1]);
    h.run(0.3);
    h.view->getSize(&vr);
    check(h.plain(P_CHORD_MODE) == 1 && vr.getHeight() == kDeviceH, "CHORD MODE on: the chord card is under the list of the browser, the panel keeps its height (beta 0.3.3)", fmt("%.0f", vr.getHeight()));
    h.shot(out + L"\\9_chord_on.png");
    h.click(1104 + 8 + 12 + 40, 8 + 98 + (kDeviceH - 16 - 156 - 254) + 10 + 26 + 22);   // a pad of the chord card, in the browser (beta 0.3.3: x = browser + 8 + 12, y = under the list + 26)
    h.run(0.2);
    const double type1 = h.plain(P_CHORD_TYPE);
    {   // a key held with the mouse: a chord sounds
      const LPARAM kp = MAKELPARAM((int)(kb[0] + kb[2] * 0.45f), (int)(kb[1] + kb[3] * 0.8f));
      SendMessageW(h.ed, WM_MOUSEMOVE, 0, kp);
      SendMessageW(h.ed, WM_LBUTTONDOWN, MK_LBUTTON, kp);
      h.resetPeak(); h.run(0.6);
      check(h.peak > 0.02, "a key plays a chord", fmt("chord type %.0f, peak %.3f", type1, h.peak));
      h.shot(out + L"\\10_chord_key.png");
      SendMessageW(h.ed, WM_LBUTTONUP, 0, kp);
      h.run(0.3);
    }
    h.click(cm[0], cm[1]);
    h.run(0.3);
    h.view->getSize(&vr);
    check(h.plain(P_CHORD_MODE) == 0 && vr.getHeight() == kDeviceH, "CHORD MODE off: back to the panel's height", fmt("%.0f", vr.getHeight()));
    h.shot(out + L"\\11_chord_off.png");
    {   // beta 0.3.2: while the zoom is "fit", the window is scaled to the screen (MW_WORKAREA = the size of a screen, developer tests): the whole panel, the chord card included, is on it
      SetEnvironmentVariableW(L"MW_WORKAREA", L"1366x728");
      h.ctrl->setParamNormalized(P_CHORD_MODE, 1.0); h.run(0.4);
      ViewRect v1; h.view->getSize(&v1);
      check(v1.getHeight() <= 728 - 100 && v1.getHeight() >= 500 && v1.getWidth() <= 1366 - 30, "fit: a 1366 x 728 screen shows the whole panel with the chord card", fmt("%.0f x %.0f (100 %% is 1100 x 1170)", (double)v1.getWidth(), (double)v1.getHeight()));
      h.shot(out + L"\\12_fit_1366x728_chord.png");
      h.ctrl->setParamNormalized(P_CHORD_MODE, 0.0); h.run(0.4);
      ViewRect v2; h.view->getSize(&v2);
      check(v2.getHeight() <= 728 - 100 && v2.getHeight() >= 500, "fit: the same screen with the panel alone", fmt("%.0f x %.0f", (double)v2.getWidth(), (double)v2.getHeight()));
      h.shot(out + L"\\12_fit_1366x728.png");
      SetEnvironmentVariableW(L"MW_WORKAREA", L"3840x2160");
      h.ctrl->setParamNormalized(P_CHORD_MODE, 1.0); h.run(0.4);
      h.ctrl->setParamNormalized(P_CHORD_MODE, 0.0); h.run(0.4);
      ViewRect v3; h.view->getSize(&v3);
      check(v3.getHeight() == kDeviceH && v3.getWidth() == 1100 + 420, "fit: a large screen keeps the panel at 100 % (with the browser: 1520 wide)", fmt("%.0f x %.0f", (double)v3.getWidth(), (double)v3.getHeight()));
    }
  }
  std::printf("2. beta 0.3.4: the LFO 2 | LFO 3 tabs, the stepped SHAPE knob, TUNING ARAB / TURK (oriental colour code and pattern)\n");
  {
    const uint32_t kAccentColA = 0xffd166;   // the gold of the subtractive oscillators (version 1.0.6: the Crepuscule look; it was yellow 0xffcf3d)
    auto setP = [&](int id, double plain) { h.ctrl->setParamNormalized(id, h.ctrl->plainParamToNormalized(id, plain)); h.run(0.3); };
    float lt[4], ob[4], shx = 0, shy = 0, vx = 0, vy = 0, tgx = 0, tgy = 0;
    check(widgetBox(W_LFOTABS, lt) && widgetBox(W_OSCTABS, ob), "the LFO tabs and the folder tabs are in the layout", fmt("lfotabs (%.0f, %.0f), osctabs at y %.0f", lt[0], lt[1], ob[1]));
    check(widgetCenter(W_KNOBM, P_LFO3_SHAPE, 0, shx, shy) && widgetCenter(W_KNOBM, P_V_OCT, 0, vx, vy) && widgetCenter(W_MENU, P_LFO3_TARGET, 0, tgx, tgy), "the SHAPE knob of LFO 3, the VOICE knobs and TARGET are in the layout",
          fmt("SHAPE (%.0f, %.0f), OCTAVE x %.0f", shx, shy, vx));
    check(std::fabs(shy - vy) < 0.5f, "the knobs of the LFO 2/3 and VOICE cards are on the same line", fmt("%.1f / %.1f", shy, vy));
    check(h.plain(P_LFO_VIEW) == 0, "LFO 2 is shown first", fmt("lfo_view %.0f", h.plain(P_LFO_VIEW)));
    setP(P_LFO2_AMT, 0.45); setP(P_LFO3_AMT, -0.3); setP(P_LFO2_SHAPE, 2); setP(P_LFO3_SHAPE, 3); setP(P_LFO_SHAPE, 1);
    h.shot(out + L"\\14_lfo2_tab.png");
    {   // the plug-in's SYNC buttons (the tab bar of LFO 2/3, the title line of LFO 1): lit, RATE becomes a note value; the screenshot shows both cards synced
      float sx2 = 0, sy2 = 0;
      check(widgetCenter(W_TOGGLE, P_LFO2_SYNC, 0, sx2, sy2) && sy2 < lt[1] + 25, "the SYNC button of LFO 2 is in the tab bar", fmt("(%.0f, %.0f)", sx2, sy2));
      h.click(sx2, sy2); h.run(0.2);
      check(h.plain(P_LFO2_SYNC) == 1, "a click on the SYNC button of the tab bar switches the tempo sync of LFO 2 on", fmt("lfo2_sync %.0f", h.plain(P_LFO2_SYNC)));
      setP(P_LFO_SYNC, 1);
      h.shot(out + L"\\14_lfo_sync.png");
      setP(P_LFO_SYNC, 0); setP(P_LFO2_SYNC, 0);
    }
    const float tabX = lt[0] + 6 + 60 + 29, tabY = lt[1] + 14;   // the LFO 3 tab: 58 x 22 at x 66
    h.click(tabX, tabY); h.run(0.2);
    check(h.plain(P_LFO_VIEW) == 1, "the LFO 3 tab shows LFO 3 (the parameter lfo_view)", fmt("lfo_view %.0f", h.plain(P_LFO_VIEW)));
    h.shot(out + L"\\14_lfo3_tab.png");
    const double s0 = h.plain(P_LFO3_SHAPE);
    h.click(shx, shy); h.run(0.2);   // a click without moving: the next shape
    check(h.plain(P_LFO3_SHAPE) == std::fmod(s0 + 1, 5), "a click on the SHAPE knob steps to the next of the five shapes", fmt("%.0f -> %.0f", s0, h.plain(P_LFO3_SHAPE)));
    h.drag(shx, shy, 50); h.run(0.2);   // dragged down by 50 px (24 px a step): two steps down
    check(h.plain(P_LFO3_SHAPE) == 2, "dragged down, the SHAPE knob steps down through the shapes", fmt("shape %.0f", h.plain(P_LFO3_SHAPE)));
    h.drag(shx, shy, -50); h.run(0.2);
    check(h.plain(P_LFO3_SHAPE) == 4, "dragged up, it goes to its last position (S&H)", fmt("shape %.0f", h.plain(P_LFO3_SHAPE)));
    h.click(lt[0] + 6 + 29, tabY); h.run(0.2);
    check(h.plain(P_LFO_VIEW) == 0, "the LFO 2 tab shows LFO 2 again", fmt("lfo_view %.0f", h.plain(P_LFO_VIEW)));
    // the colour code: the tab of the oscillator shown and the tab of the LFO shown are filled with the accent colour
    const POINT pA{(LONG)(ob[0] + 160), (LONG)(ob[1] + 20)}, pB{(LONG)(ob[0] + 2 * 182 + 160), (LONG)(ob[1] + 20)}, pL{(LONG)(lt[0] + 6 + 54), (LONG)(lt[1] + 12)};
    auto closeTo = [](uint32_t a, uint32_t b) { for (int s = 0; s < 24; s += 8) if (std::abs((int)((a >> s) & 255) - (int)((b >> s) & 255)) > 3) return false; return true; };
    auto hex = [](uint32_t c) { char s[16]; std::snprintf(s, sizeof s, "%06X", c); return std::string(s); };
    std::vector<uint32_t> px = h.pixels({pA, pL});
    check(closeTo(px[0], kAccentColA) && closeTo(px[1], kAccentColA), "TUNING WEST: yellow accent (oscillator tab A1, LFO 2 tab)", hex(px[0]) + " " + hex(px[1]));
    const POINT pBg{24, 3};   // version 1.0.9: the panel's gradient at its top-left, above the logo (no widget there)
    const uint32_t bgWest = h.pixels({pBg})[0];
    float tx = 0, ty = 0;
    check(widgetCenter(W_SEG, P_MT_MODE, 0, tx, ty), "the TUNING switch is in the layout", fmt("(%.0f, %.0f)", tx, ty));
    h.click(tx, ty); h.run(0.3);   // the middle segment: ARAB
    check(h.plain(P_MT_MODE) == 1, "a click on ARAB sets the Arabic tuning", fmt("mt_mode %.0f", h.plain(P_MT_MODE)));
    px = h.pixels({pA, pL});
    check(closeTo(px[0], kOrientPals[0].a) && closeTo(px[1], kOrientPals[0].a), "TUNING ARAB: terracotta accent (oscillator tab A1, LFO 2 tab)", hex(px[0]) + " " + hex(px[1]));
    h.shot(out + L"\\15_arab.png");
    // version 1.0.9: the panel takes the colours of the pattern (a bronze gradient for ARAB, carmine for TURK: ORIENT.g), and on the pattern the TUNING switch, the MAQAM menu and the TONIC step
    // sit on the OPAQUE plate (kOrientPlate): a pixel just inside the left edge of each, where no letter is, is the plate's colour (translucent, it would be the pattern's)
    const uint32_t bgArab = h.pixels({pBg})[0];
    check(!closeTo(bgArab, bgWest) && ((bgArab >> 16) & 255) > (bgArab & 255) + 8, "TUNING ARAB: the panel's gradient is bronze, not the violet of WEST", hex(bgWest) + " -> " + hex(bgArab));
    auto plateCheck = [&](const char* what) {
      float sb[4], mb[4], tb[4];
      const bool there = widgetBoxOf(W_SEG, P_MT_MODE, sb) && widgetBoxOf(W_MENU, P_MT_SCALE, mb) && widgetBoxOf(W_STEP, P_MT_TONIC, tb);
      check(there, "the TUNING switch, the MAQAM menu and the TONIC step are in the layout");
      if (!there) return;
      auto at = [](const float* b) { return POINT{(LONG)(b[0] + 3.5f), (LONG)(b[1] + b[3] / 2)}; };
      const std::vector<uint32_t> pp = h.pixels({at(sb), at(mb), at(tb)});
      check(closeTo(pp[0], kOrientPlate) && closeTo(pp[1], kOrientPlate) && closeTo(pp[2], kOrientPlate), what, hex(pp[0]) + " " + hex(pp[1]) + " " + hex(pp[2]) + " (the plate is " + hex(kOrientPlate) + ")");
    };
    plateCheck("TUNING ARAB: the TUNING switch, the MAQAM menu and the TONIC step sit on the opaque plate, their text readable over the pattern");
    {   // the pattern and its clip in a scaled window (the zoom "fit" of a small screen)
      SetEnvironmentVariableW(L"MW_WORKAREA", L"1366x728");
      setP(P_CHORD_MODE, 1); setP(P_CHORD_MODE, 0);
      ViewRect vf; h.view->getSize(&vf);
      check(vf.getHeight() < kDeviceH, "TUNING ARAB on a 1366 x 728 screen: the window is scaled", fmt("%.0f x %.0f", (double)vf.getWidth(), (double)vf.getHeight()));
      h.shot(out + L"\\15_arab_fit.png");
      SetEnvironmentVariableW(L"MW_WORKAREA", L"3840x2160");
      setP(P_CHORD_MODE, 1); setP(P_CHORD_MODE, 0);
    }
    h.click(lt[0] + 6 + 60 + 29, tabY); h.run(0.2);
    h.shot(out + L"\\15_arab_lfo3.png");
    h.click(lt[0] + 6 + 29, tabY); h.run(0.2);   // back to LFO 2
    setP(P_OSC_VIEW, 2);   // B1: turquoise
    px = h.pixels({pB});
    check(closeTo(px[0], kOrientPals[0].b), "TUNING ARAB, additive oscillator B1 shown: turquoise accent", hex(px[0]));
    setP(P_MT_MODE, 2);
    px = h.pixels({pB});
    check(closeTo(px[0], kOrientPals[1].b), "TUNING TURK, additive oscillator B1 shown: the carmine palette's amber accent", hex(px[0]));
    h.shot(out + L"\\16_turk_b1.png");
    setP(P_OSC_VIEW, 0);
    h.shot(out + L"\\16_turk.png");
    plateCheck("TUNING TURK: the same plate under the TUNING switch, the MAQAM menu and the TONIC step");
    {
      const uint32_t bgTurk = h.pixels({pBg})[0];
      check(!closeTo(bgTurk, bgArab) && !closeTo(bgTurk, bgWest) && ((bgTurk >> 16) & 255) > (bgTurk & 255), "TUNING TURK: the panel's gradient is carmine (neither the bronze of ARAB nor the violet of WEST)", hex(bgArab) + " -> " + hex(bgTurk));
    }
    setP(P_MT_MODE, 0);
    check(closeTo(h.pixels({pBg})[0], bgWest), "TUNING WEST again: the panel's violet gradient is back", hex(h.pixels({pBg})[0]) + " (was " + hex(bgWest) + ")");
    px = h.pixels({pA, pL});
    check(closeTo(px[0], kAccentColA) && closeTo(px[1], kAccentColA), "TUNING WEST again: the yellow accent is back", hex(px[0]) + " " + hex(px[1]));
    h.run(0.2);
  }
  std::printf("3. beta 0.2: the preset browser follows the preset box (the screenshot shows the browser on SuperModulation, the sound selected)\n");
  {
    float pr[4];
    check(widgetBox(W_PRESETS, pr), "the preset box in the layout");
    SetWindowPos(h.top, nullptr, -4000, 0, 1560, kDeviceH + kChordH, SWP_NOZORDER | SWP_NOACTIVATE);   // wide enough for the browser at the right
    h.run(0.3);
    for (int i = 0; i < 40; i++) { h.click(pr[0] + pr[2] - 12, pr[1] + pr[3] / 2); h.run(0.05); }   // the right arrow: out of the TOP Sounds into SuperModulation
    h.run(0.5);
    h.ctrl->setParamNormalized(P_CHORD_MODE, 1.0); h.run(0.5);   // beta 0.3.3: the chord card under the list of the browser (screenshot)
    h.shot(out + L"\\13_chord_in_browser.png");
    h.ctrl->setParamNormalized(P_CHORD_MODE, 0.0); h.run(0.4);
    {   // beta 0.3.1: the stars at the right of a row of the browser: a click on the left half of the second star rates the first row 3 / 10 (the presets file holds it)
      const float sx = 1100 + 4 + 136 + (420 - 12 - 162) - 6 - 60;   // the stars' left edge: the card x + the list x + its width - the margin - 5 stars of 12
      auto cnt = [](const std::string& s, const std::string& x) { int n = 0; for (size_t p = s.find(x); p != std::string::npos; p = s.find(x, p + 1)) n++; return n; };
      const int threes0 = cnt(readFile(presetsFile), "Stars: 3\r\n");   // (the file is written at the first edit, with the built-in votes of some presets: the lines are counted)
      h.click(sx + 12 + 3, 8 + 98 + 11);
      h.run(0.3);
      const std::string after = readFile(presetsFile);
      const int threes1 = cnt(after, "Stars: 3\r\n");
      check(!after.empty() && threes1 > threes0, "a click on the stars of a row of the browser rates the sound (the presets file says Stars: 3)", std::to_string(after.size()) + " bytes");
      h.click(sx + 12 + 3, 8 + 98 + 11);   // the same click again clears it
      h.run(0.3);
      check(cnt(readFile(presetsFile), "Stars: 3\r\n") == threes1 - 1, "a second click on the same rating clears it");
      const int tens = cnt(readFile(presetsFile), "Stars: 10\r\n");   // (a built-in vote of 10 is in the file too)
      h.click(sx + 4 * 12 + 9, 8 + 98 + 11);   // the right half of the fifth star: 10 / 10
      h.run(0.3);
      check(cnt(readFile(presetsFile), "Stars: 10\r\n") == tens + 1, "the right half of the fifth star gives 10 / 10 (one more Stars: 10 in the file)");
    }
    h.shot(out + L"\\12_browser_followed.png");
  }
  check(!h.badSample, "no NaN or infinite sample");
  check(h.handler.badNesting == 0, "every performEdit inside beginEdit/endEdit", std::to_string(h.handler.edits) + " edits");

  h.view->removed(); h.view->release();
  DestroyWindow(h.top);
  h.proc->setProcessing(false); h.comp->setActive(false);
  cpA->disconnect(cpB); cpB->disconnect(cpA); cpA->release(); cpB->release();
  h.ctrl->setComponentHandler(nullptr);
  h.proc->release(); h.ctrl->terminate(); h.comp->terminate(); h.ctrl->release(); h.comp->release();
  std::printf(gFails ? "%d FAILED\n" : "ALL PASS\n", gFails);
  return gFails ? 1 : 0;
}
