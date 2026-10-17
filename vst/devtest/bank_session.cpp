// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer check of the USER BANK of the plug-in editor (beta 0.3). Loads the VST3 like a host (one thread: window
// messages + audio blocks), opens the editor in an off-screen window and drives the bank as a player would: a knob
// turned with the mouse, "Save to user bank" (the save window is filled by a helper thread), loading a bank sound,
// replacing, exporting, deleting, the name kept in the controller state, a folder that cannot be written. The preset-menu
// commands are sent as WM_APP + 1 (the popup menu itself is a modal Windows menu). The bank goes to <outdir>\bank
// (WS_BANK_FILE, WS_BANK_EXPORT): never the player's own bank.
//   x86_64-w64-mingw32-clang++ -std=c++17 -O2 -static -municode -DUNICODE -D_UNICODE -DNOMINMAX -I vst/external -I vst/src
//     vst/devtest/bank_session.cpp vst/src/iids.cpp vst/external/pluginterfaces/base/funknown.cpp -o bank_session.exe
//     -lgdiplus -lgdi32 -luser32 -lole32 -luuid
//   bank_session.exe <path\to\WaveletSynthesizer.vst3 dll> <outdir>
#include <windows.h>
#include <algorithm>
namespace Gdiplus { using std::min; using std::max; }
#include <gdiplus.h>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <functional>
#include <string>
#include <thread>
#include <vector>
#include "pluginterfaces/base/ibstream.h"
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
using namespace ws;
namespace G = Gdiplus;

static int gFails = 0;
static void check(bool ok, const char* what, const std::string& detail = {}) {
  std::printf("  [%s] %s%s%s\n", ok ? "PASS" : "FAIL", what, detail.empty() ? "" : "  -- ", detail.c_str());
  if (!ok) gFails++;
  std::fflush(stdout);   // nothing lost if a run is stopped
}
static std::string fmt(const char* f, double a, double b = 0) { char s[256]; std::snprintf(s, sizeof s, f, a, b); return s; }

// ------------------------------------------------------------------ host objects
struct Handler final : public IComponentHandler, public IComponentHandler2 {
  std::vector<std::pair<ParamID, double>> pending;
  int open = 0, badNesting = 0;
  tresult PLUGIN_API beginEdit(ParamID) override { open++; return kResultOk; }
  tresult PLUGIN_API performEdit(ParamID id, ParamValue v) override { if (open <= 0) badNesting++; pending.push_back({id, v}); return kResultOk; }
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
  std::vector<Queue> qs = std::vector<Queue>(256); int32 used = 0;
  void clear() { for (int32 i = 0; i < used; i++) qs[i].pts.clear(); used = 0; }
  void add(ParamID id, double v) {
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
struct Stream final : public IBStream {   // memory stream for getState / setState
  std::string data; size_t pos = 0;
  tresult PLUGIN_API read(void* b, int32 n, int32* got) override {
    const int32 k = (int32)std::min<size_t>(n < 0 ? 0 : n, data.size() - pos);
    std::memcpy(b, data.data() + pos, k); pos += k; if (got) *got = k; return kResultOk;
  }
  tresult PLUGIN_API write(void* b, int32 n, int32* put) override {
    if (pos + n > data.size()) data.resize(pos + n);
    std::memcpy(&data[pos], b, n); pos += n; if (put) *put = n; return kResultOk;
  }
  tresult PLUGIN_API seek(int64 p, int32 mode, int64* res) override {
    int64 np = mode == kIBSeekSet ? p : mode == kIBSeekCur ? (int64)pos + p : (int64)data.size() + p;
    if (np < 0 || np > (int64)data.size()) return kResultFalse;
    pos = (size_t)np; if (res) *res = np; return kResultOk;
  }
  tresult PLUGIN_API tell(int64* p) override { if (p) *p = (int64)pos; return kResultOk; }
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(iid, IBStream::iid) || FUnknownPrivate::iidEqual(iid, FUnknown::iid)) { *obj = this; return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
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
  }
  void pump() { MSG m; while (PeekMessageW(&m, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&m); DispatchMessageW(&m); } }
  void run(double s) {
    const int n = (int)std::ceil(s * SR / BLOCK);
    for (int k = 0; k < n; k++) { pump(); block(); Sleep(BLOCK * 1000 / SR); }
    pump();
  }
  double plain(int id) { return ctrl->normalizedParamToPlain(id, ctrl->getParamNormalized(id)); }
  void command(int cmd) { PostMessageW(ed, WM_APP + 1, (WPARAM)cmd, 0); pump(); }
  void drag(float x, float y, float dy) {
    SendMessageW(ed, WM_MOUSEMOVE, 0, MAKELPARAM((int)x, (int)y));
    SendMessageW(ed, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM((int)x, (int)y));
    for (int k = 1; k <= 10; k++) SendMessageW(ed, WM_MOUSEMOVE, MK_LBUTTON, MAKELPARAM((int)x, (int)std::lround(y + dy * k / 10)));
    SendMessageW(ed, WM_LBUTTONUP, 0, MAKELPARAM((int)x, (int)std::lround(y + dy)));
    pump();
  }
  // the controller state "WSC2": zoom, modified flag, preset name
  std::string stateName(int* dirty = nullptr) {
    Stream s; ctrl->getState(&s);
    if (s.data.size() < 16) return "?";
    int32_t dt; uint32_t len; std::memcpy(&dt, &s.data[8], 4); std::memcpy(&len, &s.data[12], 4);
    if (dirty) *dirty = dt;
    return s.data.substr(16, len);
  }
  void shot(const std::wstring& file) {
    RECT rc; GetClientRect(top, &rc);
    SetWindowPos(top, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    RedrawWindow(top, nullptr, nullptr, RDW_INVALIDATE | RDW_UPDATENOW | RDW_ALLCHILDREN);
    pump(); Sleep(60);
    HDC sdc = GetDC(nullptr); HDC mdc = CreateCompatibleDC(sdc);
    HBITMAP bmp = CreateCompatibleBitmap(sdc, rc.right, rc.bottom); HGDIOBJ old = SelectObject(mdc, bmp);
    PrintWindow(top, mdc, 2 /* PW_RENDERFULLCONTENT */);
    SelectObject(mdc, old);
    SetWindowPos(top, HWND_NOTOPMOST, -4000, 0, 0, 0, SWP_NOSIZE | SWP_NOACTIVATE);
    {
      G::Bitmap b(bmp, nullptr);
      UINT num = 0, size = 0; G::GetImageEncodersSize(&num, &size);
      std::vector<char> buf(size); auto* enc = (G::ImageCodecInfo*)buf.data(); G::GetImageEncoders(num, size, enc);
      for (UINT i = 0; i < num; i++) if (std::wcscmp(enc[i].MimeType, L"image/png") == 0) b.Save(file.c_str(), &enc[i].Clsid, nullptr);
    }
    DeleteObject(bmp); DeleteDC(mdc); ReleaseDC(nullptr, sdc);
  }
};

// A helper thread that answers the windows the plug-in opens (save window, message boxes) while the UI thread is in
// their modal loop. Each step waits for a dialog with that title and acts on it; texts of the message boxes are kept.
struct Responder {
  std::thread t; std::vector<std::wstring> seen;
  using Step = std::pair<std::wstring, std::function<void(HWND)>>;
  void start(std::vector<Step> steps) {
    t = std::thread([this, steps] {
      for (const auto& s : steps) {
        HWND d = nullptr;
        for (int k = 0; k < 250 && !d; k++) {   // up to 5 s
          d = FindWindowW(L"#32770", s.first.c_str());
          if (!d) Sleep(20);
        }
        if (!d) {   // diagnostic: the windows of this process
          seen.push_back(L"(no window '" + s.first + L"')");
          EnumWindows([](HWND w, LPARAM) -> BOOL {
            DWORD pid = 0; GetWindowThreadProcessId(w, &pid);
            if (pid == GetCurrentProcessId()) { wchar_t c[128] = {}, t[256] = {}; GetClassNameW(w, c, 128); GetWindowTextW(w, t, 256);
              std::printf("     window: class '%ls' title '%ls' visible %d\n", c, t, (int)IsWindowVisible(w)); }
            return TRUE; }, 0);
          std::fflush(stdout);
          return;
        }
        Sleep(80);   // let it initialise
        wchar_t txt[1024] = {}; GetDlgItemTextW(d, 0xFFFF, txt, 1024);
        seen.push_back(txt);
        s.second(d);
        for (int k = 0; k < 100 && IsWindow(d); k++) Sleep(20);
      }
    });
  }
  void wait(Host& h) { while (t.joinable()) { h.pump(); if (WaitForSingleObject(t.native_handle(), 20) == WAIT_OBJECT_0) t.join(); } }
};
static void press(HWND d, int id) { PostMessageW(d, WM_COMMAND, MAKEWPARAM(id, BN_CLICKED), (LPARAM)GetDlgItem(d, id)); }
static std::string readFile(const std::wstring& p) {
  FILE* f = _wfopen(p.c_str(), L"rb"); if (!f) return "";
  std::string s; char b[4096]; size_t n; while ((n = std::fread(b, 1, sizeof b, f)) > 0) s.append(b, n); std::fclose(f); return s;
}
static bool has(const std::string& s, const std::string& x) { return s.find(x) != std::string::npos; }
static int count(const std::string& s, const std::string& x) { int n = 0; for (size_t p = s.find(x); p != std::string::npos; p = s.find(x, p + 1)) n++; return n; }
static std::string noSaved(const std::string& s) { const size_t a = s.find("Saved: "), b = s.find('\n', a); return a == std::string::npos ? s : s.substr(0, a) + s.substr(b); }
static int presetIndex(const char* name) { for (int k = 0; k < kNumPresets; k++) if (std::strcmp(kPresets[k].name, name) == 0) return k; return -1; }
static std::string u8(const std::wstring& w) {
  const int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string s(n, '\0'); WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, nullptr, nullptr); return s;
}
static LRESULT CALLBACK topProc(HWND h, UINT m, WPARAM w, LPARAM l) { return DefWindowProcW(h, m, w, l); }

int wmain(int argc, wchar_t** argv) {
  if (argc < 3) { std::printf("usage: bank_session.exe <plugin dll> <outdir>\n"); return 2; }
  const std::wstring dll = argv[1], out = argv[2], dir = out + L"\\bank", bank = dir + L"\\Wavelet Synthesizer user bank.txt",
                     exported = out + L"\\exported bank.txt";
  CreateDirectoryW(out.c_str(), nullptr); CreateDirectoryW(dir.c_str(), nullptr);
  DeleteFileW(bank.c_str()); DeleteFileW(exported.c_str());
  SetEnvironmentVariableW(L"WS_BANK_FILE", bank.c_str());
  SetEnvironmentVariableW(L"WS_BANK_EXPORT", exported.c_str());
  G::GdiplusStartupInput gi; ULONG_PTR gt; G::GdiplusStartup(&gt, &gi, nullptr);
  SetProcessDPIAware();

  HMODULE mod = LoadLibraryW(dll.c_str());
  if (!mod) { std::printf("cannot load %ls\n", dll.c_str()); return 2; }
  auto getFactory = (IPluginFactory * (PLUGIN_API*)())GetProcAddress(mod, "GetPluginFactory");
  if (auto initDll = (bool (*)())GetProcAddress(mod, "InitDll")) initDll();
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

  WNDCLASSW wc{}; wc.lpfnWndProc = topProc; wc.hInstance = GetModuleHandleW(nullptr); wc.lpszClassName = L"WsBankTestTop";
  RegisterClassW(&wc);
  h.top = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, wc.lpszClassName, L"bank test", WS_POPUP | WS_VISIBLE, -4000, 0, 1100, 720, nullptr, nullptr, wc.hInstance, nullptr);
  h.view = h.ctrl->createView(ViewType::kEditor);
  IPlugViewContentScaleSupport* sc = nullptr;
  if (h.view->queryInterface(IPlugViewContentScaleSupport::iid, (void**)&sc) == kResultOk && sc) { sc->setContentScaleFactor(1.0f); sc->release(); }
  check(h.view->attached(h.top, kPlatformTypeHWND) == kResultOk, "editor attached");
  h.ed = FindWindowExW(h.top, nullptr, L"WaveletSynthesizerEditorWnd", nullptr);
  check(h.ed != nullptr, "editor window found");
  h.run(0.3);
  const int kSaw = presetIndex("A \xC2\xB7 Deep Saw Bass"), kOrgan = presetIndex("B \xC2\xB7 Theatre Organ"), kPad = presetIndex("A \xC2\xB7 Warm Pad");
  check(kSaw >= 0 && kOrgan >= 0 && kPad >= 0, "test presets exist");

  setvbuf(stdout, nullptr, _IONBF, 0);
  std::printf("1. a preset changed with the mouse, saved to the section Chords under a new name\n");
  h.command(100 + kSaw);
  h.run(0.2);
  h.drag(50, 408, -45);   // CUTOFF knob of the SCALE FILTER
  h.run(0.2);
  const double cut = h.plain(P_F_CUTOFF);
  check(cut > kPresets[kSaw].v[P_F_CUTOFF] + 0.5, "cutoff changed with the mouse", fmt("%.3f -> %.3f", kPresets[kSaw].v[P_F_CUTOFF], cut));
  std::wstring proposed; int proposedSec = -1;
  Responder r;
  r.start({{L"Save to user bank", [&](HWND d) {
    wchar_t b[128] = {}; GetDlgItemTextW(d, 101, b, 128); proposed = b;
    proposedSec = (int)SendDlgItemMessageW(d, 102, CB_GETCURSEL, 0, 0);
    SetDlgItemTextW(d, 101, L"My Deep Bass");
    SendDlgItemMessageW(d, 102, CB_SETCURSEL, 9, 0);   // Chords
    press(d, IDOK);
  }}});
  h.command(900);
  r.wait(h);
  check(u8(proposed) == "A \xC2\xB7 Deep Saw Bass" && proposedSec == 0, "save window proposes the preset's name and its section (Bass)",
        u8(proposed) + " / section " + std::to_string(proposedSec));
  std::string txt = readFile(bank);
  check(has(txt, "== Chords ==\r\n\r\nPreset: My Deep Bass\r\nFrom: A \xC2\xB7 Deep Saw Bass (modified)\r\n"), "bank file: section, name, origin");
  check(has(txt, "  f_cutoff: 5.5   (Cutoff: band 5.5)") && has(txt, "  engine: 0   (") && has(txt, "  ab_mix: 0   ("), "bank file: changed cutoff, engine and A/B mix written");
  check(has(txt, "== Bass ==\r\n(empty)") && has(txt, "Presets: 1"), "the other sections are empty");
  int dirty = -1;
  check(h.stateName(&dirty) == "USER \xC2\xB7 My Deep Bass" && dirty == 0, "browser shows USER \xC2\xB7 My Deep Bass, not modified", h.stateName() + " / " + std::to_string(dirty));
  h.shot(out + L"\\1_saved.png");

  std::printf("2. another preset saved with the proposed name and section\n");
  h.command(100 + kOrgan);
  h.run(0.2);
  Responder r2;
  r2.start({{L"Save to user bank", [&](HWND d) { press(d, IDOK); }}});
  h.command(900);
  r2.wait(h);
  txt = readFile(bank);
  check(has(txt, "== Organ ==\r\n\r\nPreset: B \xC2\xB7 Theatre Organ\r\nFrom: B \xC2\xB7 Theatre Organ\r\n") && has(txt, "Presets: 2"), "Theatre Organ saved in Organ (proposed name, unmodified)");

  std::printf("3. a bank sound loaded back\n");
  h.command(100 + kPad);
  h.run(0.2);
  h.command(1001);   // the bank in file order: Organ (0), then Chords (1)
  h.run(0.3);
  bool same = true;
  for (int i = 0; i < kNumParams; i++) {
    if (kParams[i].hidden) continue;
    const double want = i == P_F_CUTOFF ? 5.5 : kPresets[kSaw].v[i];
    if (std::fabs(h.plain(i) - want) > 1e-6 * std::max(1.0, std::fabs(want))) { same = false; std::printf("     %s %g != %g\n", kParams[i].key, h.plain(i), want); }
  }
  check(same, "every parameter of the saved sound is back (Deep Saw Bass + cutoff 5.5)");
  check(h.stateName(&dirty) == "USER \xC2\xB7 My Deep Bass" && dirty == 0, "browser: USER \xC2\xB7 My Deep Bass");
  h.shot(out + L"\\2_loaded.png");

  std::printf("4. saved again under the same name: replace\n");
  h.drag(50, 408, 20);
  h.run(0.2);
  const double cut2 = h.plain(P_F_CUTOFF);
  Responder r3;
  r3.start({{L"Save to user bank", [&](HWND d) {
    wchar_t b[128] = {}; GetDlgItemTextW(d, 101, b, 128); proposed = b;
    proposedSec = (int)SendDlgItemMessageW(d, 102, CB_GETCURSEL, 0, 0);
    press(d, IDOK);
  }}, {L"Wavelet Synthesizer", [&](HWND d) { press(d, IDYES); }}});
  h.command(900);
  r3.wait(h);
  txt = readFile(bank);
  check(u8(proposed) == "My Deep Bass" && proposedSec == 9, "a bank sound proposes its own name and section", u8(proposed) + " / " + std::to_string(proposedSec));
  check(r3.seen.size() == 2 && has(u8(r3.seen[1]), "already exists in Chords. Replace it?"), "asks before replacing", r3.seen.size() > 1 ? u8(r3.seen[1]) : "");
  check(count(txt, "Preset: My Deep Bass") == 1 && has(txt, "From: My Deep Bass (modified)") && cut2 < cut, "replaced (one entry, the new cutoff)", fmt("cutoff %.3f", cut2));

  std::printf("5. export\n");
  h.command(901);
  const std::string ex = readFile(exported);
  check(!ex.empty() && noSaved(ex) == noSaved(readFile(bank)), "the exported .txt holds the bank");

  std::printf("6. delete\n");
  Responder r4;
  r4.start({{L"Wavelet Synthesizer", [&](HWND d) { press(d, IDYES); }}});
  h.command(3000);   // the first entry: Theatre Organ
  r4.wait(h);
  txt = readFile(bank);
  check(!r4.seen.empty() && has(u8(r4.seen[0]), "Delete \xE2\x80\x9C" "B \xC2\xB7 Theatre Organ"), "asks before deleting", r4.seen.empty() ? "" : u8(r4.seen[0]));
  check(!has(txt, "Theatre Organ") && has(txt, "== Organ ==\r\n(empty)") && has(txt, "Presets: 1"), "deleted");

  std::printf("7. the name kept with the project (controller state)\n");
  Stream saved; h.ctrl->getState(&saved);
  h.command(100 + kPad);
  h.run(0.2);
  check(h.stateName() == "A \xC2\xB7 Warm Pad", "a factory preset again", h.stateName());
  saved.pos = 0; h.ctrl->setState(&saved);
  check(h.stateName() == "USER \xC2\xB7 My Deep Bass", "setState gives the bank sound's name back", h.stateName());
  {
    Stream bad; uint32_t magic = 0x32435357; float z = 1; int32_t dt = 0; const std::string nm = "Some unknown name"; uint32_t len = (uint32_t)nm.size();
    bad.write(&magic, 4, nullptr); bad.write(&z, 4, nullptr); bad.write(&dt, 4, nullptr); bad.write(&len, 4, nullptr); bad.write((void*)nm.data(), (int32)len, nullptr);
    h.command(100 + kPad); h.run(0.1);
    bad.pos = 0; h.ctrl->setState(&bad);
    check(h.stateName() == "A \xC2\xB7 Warm Pad", "an unknown name without USER \xC2\xB7 is ignored (factory preset kept)", h.stateName());
  }

  std::printf("8. a folder that cannot be written\n");
  SetEnvironmentVariableW(L"WS_BANK_FILE", (out + L"\\no such folder\\bank.txt").c_str());
  Responder r5;
  // (a message box with a single OK button closes on IDCANCEL, as with the Esc key)
  r5.start({{L"Save to user bank", [&](HWND d) { press(d, IDOK); }}, {L"Wavelet Synthesizer", [&](HWND d) { PostMessageW(d, WM_COMMAND, IDCANCEL, 0); }}});
  h.command(900);
  r5.wait(h);
  check(r5.seen.size() == 2 && has(u8(r5.seen[1]), "Could not save the user bank") && has(u8(r5.seen[1]), "no such folder"), "clear message with the path",
        r5.seen.size() > 1 ? u8(r5.seen[1]).substr(0, 160) : "");
  check(h.stateName() == "A \xC2\xB7 Warm Pad", "the sound is not marked as a bank sound", h.stateName());
  SetEnvironmentVariableW(L"WS_BANK_FILE", bank.c_str());
  check(h.handler.badNesting == 0, "every performEdit inside beginEdit/endEdit");

  h.view->removed(); h.view->release();
  DestroyWindow(h.top);
  h.proc->setProcessing(false); h.comp->setActive(false);
  cpA->disconnect(cpB); cpB->disconnect(cpA); cpA->release(); cpB->release();
  h.ctrl->setComponentHandler(nullptr);
  h.proc->release(); h.ctrl->terminate(); h.comp->terminate(); h.ctrl->release(); h.comp->release();
  std::printf("\nbank file:\n%s\n", readFile(bank).c_str());
  std::printf(gFails ? "%d FAILED\n" : "ALL PASS\n", gFails);
  return gFails ? 1 : 0;
}
