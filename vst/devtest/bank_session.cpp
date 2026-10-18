// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer check of the PRESET LIBRARY of the plug-in editor (beta 0.3): the preset browser, SAVE PRESET (a factory
// preset adjusted and renamed, RESTORE), the user bank (save, rename, delete, export), the presets file read again after
// the plug-in is unloaded and loaded, the beta 0.3 bank file taken over, SUB OCT by a click, the LFO 2 menu, a folder
// that cannot be written. The plug-in is loaded like a host (one thread: window messages + audio blocks), its editor in an
// off-screen window; the save windows and message boxes are answered by a helper thread. The presets file goes to
// <outdir>\lib (WS_PRESETS_FILE, WS_PRESETS_EXPORT): never the player's own file.
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
#include "pluginterfaces/base/keycodes.h"
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

// one plug-in instance with its editor in an off-screen window (wide enough for the preset browser)
struct Session {
  Host h; IConnectionPoint *cpA = nullptr, *cpB = nullptr;
  bool open(IPluginFactory* fac) {
    PClassInfo ci0, ci1; fac->getClassInfo(0, &ci0); fac->getClassInfo(1, &ci1);
    fac->createInstance(ci0.cid, IComponent::iid, (void**)&h.comp);
    fac->createInstance(ci1.cid, IEditController::iid, (void**)&h.ctrl);
    if (!h.comp || !h.ctrl) return false;
    h.comp->initialize(nullptr); h.ctrl->initialize(nullptr);
    h.comp->queryInterface(IAudioProcessor::iid, (void**)&h.proc);
    h.comp->queryInterface(IConnectionPoint::iid, (void**)&cpA); h.ctrl->queryInterface(IConnectionPoint::iid, (void**)&cpB);
    cpA->connect(cpB); cpB->connect(cpA);
    h.ctrl->setComponentHandler(&h.handler);
    SpeakerArrangement st = SpeakerArr::kStereo;
    h.proc->setBusArrangements(nullptr, 0, &st, 1);
    ProcessSetup ps{kRealtime, kSample32, BLOCK, (SampleRate)SR};
    h.proc->setupProcessing(ps);
    h.comp->setActive(true); h.proc->setProcessing(true);
    h.top = CreateWindowExW(WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE, L"WsBankTestTop", L"bank test", WS_POPUP | WS_VISIBLE, -4000, 0, 1480, 720, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    h.view = h.ctrl->createView(ViewType::kEditor);
    IPlugViewContentScaleSupport* sc = nullptr;
    if (h.view->queryInterface(IPlugViewContentScaleSupport::iid, (void**)&sc) == kResultOk && sc) { sc->setContentScaleFactor(1.0f); sc->release(); }
    if (h.view->attached(h.top, kPlatformTypeHWND) != kResultOk) return false;
    h.ed = FindWindowExW(h.top, nullptr, L"WaveletSynthesizerEditorWnd", nullptr);
    h.run(0.3);
    return h.ed != nullptr;
  }
  void close() {
    h.view->removed(); h.view->release();
    DestroyWindow(h.top);
    h.proc->setProcessing(false); h.comp->setActive(false);
    cpA->disconnect(cpB); cpB->disconnect(cpA); cpA->release(); cpB->release();
    h.ctrl->setComponentHandler(nullptr);
    h.proc->release(); h.ctrl->terminate(); h.comp->terminate(); h.ctrl->release(); h.comp->release();
  }
};
static void clickAt(Host& h, float x, float y) {
  const LPARAM p = MAKELPARAM((int)std::lround(x), (int)std::lround(y));
  SendMessageW(h.ed, WM_MOUSEMOVE, 0, p);
  SendMessageW(h.ed, WM_LBUTTONDOWN, MK_LBUTTON, p);
  SendMessageW(h.ed, WM_LBUTTONUP, 0, p);
  h.pump();
}
// a click that opens a modal window (save window, message box): posted, the helper thread answers it
static void clickPosted(Host& h, float x, float y) {
  const LPARAM p = MAKELPARAM((int)std::lround(x), (int)std::lround(y));
  PostMessageW(h.ed, WM_MOUSEMOVE, 0, p);
  PostMessageW(h.ed, WM_LBUTTONDOWN, MK_LBUTTON, p);
  PostMessageW(h.ed, WM_LBUTTONUP, 0, p);
}
static int clientW(Host& h) { RECT rc; GetClientRect(h.ed, &rc); return rc.right; }
// beta 0.5: a drag from one point to another (a sound of the browser onto a category)
static void dragTo(Host& h, float x0, float y0, float x1, float y1) {
  SendMessageW(h.ed, WM_MOUSEMOVE, 0, MAKELPARAM((int)x0, (int)y0));
  SendMessageW(h.ed, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM((int)x0, (int)y0));
  for (int k = 1; k <= 12; k++)
    SendMessageW(h.ed, WM_MOUSEMOVE, MK_LBUTTON, MAKELPARAM((int)std::lround(x0 + (x1 - x0) * k / 12), (int)std::lround(y0 + (y1 - y0) * k / 12)));
  SendMessageW(h.ed, WM_LBUTTONUP, 0, MAKELPARAM((int)x1, (int)y1));
  h.pump();
}
// beta 0.5: an arrow key sent to the editor window (as Windows does once the browser was clicked)
static void keyTo(Host& h, WPARAM vk) {
  SendMessageW(h.ed, WM_KEYDOWN, vk, 1);
  SendMessageW(h.ed, WM_KEYUP, vk, 0xC0000001);
  h.run(0.05);
}
// a value as the presets file writes it (up to 6 decimals, no trailing zeros)
static std::string num6(double v) {
  char b[64]; std::snprintf(b, sizeof b, "%.6f", v);
  std::string x = b;
  while (!x.empty() && x.back() == '0') x.pop_back();
  if (!x.empty() && x.back() == '.') x.pop_back();
  return x;
}
// the lines of one list of the presets file's LIST ORDER ("" when missing)
static std::string listOf(const std::string& txt, const std::string& label) {
  const size_t lo = txt.find("######## LIST ORDER"), a = txt.find("== " + label + " ==\r\n", lo);
  if (lo == std::string::npos || a == std::string::npos) return "";
  const size_t b = txt.find("\r\n\r\n", a);
  return txt.substr(a, b == std::string::npos ? std::string::npos : b - a);
}
// the browser geometry of the editor (logical = pixels at 100 %): card 1104..1452
static const float CAT_X = 1175, ROW_X = 1340;
static float catY(int i) { return 92 + 26.0f * i; }
static float rowY(int j) { return 117 + 22.0f * j; }   // the sound list, below its header
static const float UP_X = 1402, DOWN_X = 1428, MOVE_Y = 90;   // ▲ ▼ above the list
static float btnX(int b) { return 1116 + b * 65.8f + 30.4f; }   // TO BANK, RESTORE, DELETE, EXPORT, FILE
static const float BTN_Y = 675, TAB_Y = 55, TAB0_X = 1197, TAB1_X = 1359, HIDE_X = 1411, HIDE_Y = 24;
static const float SAVE_X = 910, SAVE_Y = 24, NAME_X = 680, NAME_Y = 24;   // beta 0.6: SAVE PRESET at 876..944
// the block of one factory preset in the presets file
static std::string factoryBlock(const std::string& txt, const std::string& orig) {
  const size_t f = txt.find("\r\nFactory: " + orig + "\r\n");
  if (f == std::string::npos) return "";
  const size_t a = txt.rfind("Preset: ", f), b = txt.find("\r\n\r\n", f);
  return txt.substr(a, b == std::string::npos ? std::string::npos : b - a);
}

int wmain(int argc, wchar_t** argv) {
  if (argc < 3) { std::printf("usage: bank_session.exe <plugin dll> <outdir>\n"); return 2; }
  setvbuf(stdout, nullptr, _IONBF, 0);
  const std::wstring dll = argv[1], out = argv[2], dir = out + L"\\lib", lib = dir + L"\\OKTOWAVE presets.txt",
                     exported = out + L"\\exported presets.txt";
  CreateDirectoryW(out.c_str(), nullptr); CreateDirectoryW(dir.c_str(), nullptr);
  DeleteFileW(lib.c_str()); DeleteFileW(exported.c_str());
  SetEnvironmentVariableW(L"WS_PRESETS_FILE", lib.c_str());
  SetEnvironmentVariableW(L"WS_PRESETS_EXPORT", exported.c_str());
  {   // a user bank of the first beta 0.3 build: it is taken over while the presets file does not exist
    FILE* f = _wfopen((lib + L".oldbank").c_str(), L"wb");
    const char* old = "Wavelet Synthesizer - user bank\r\n\r\n== Pad ==\r\n\r\nPreset: Old Pad\r\nFrom: A \xC2\xB7 Warm Pad\r\n"
                      "  engine: 0   (Engine: A)\r\n  ab_mix: 0   (A/B Mix: A)\r\n  f_cutoff: 3   (Cutoff: band 3.0)\r\n";
    std::fwrite(old, 1, std::strlen(old), f); std::fclose(f);
  }
  G::GdiplusStartupInput gi; ULONG_PTR gt; G::GdiplusStartup(&gt, &gi, nullptr);
  SetProcessDPIAware();
  WNDCLASSW wc{}; wc.lpfnWndProc = topProc; wc.hInstance = GetModuleHandleW(nullptr); wc.lpszClassName = L"WsBankTestTop";
  RegisterClassW(&wc);
  const int kSaw = presetIndex("A \xC2\xB7 Reese Sub"), kPad = presetIndex("A \xC2\xB7 Warm Pad");
  check(kSaw >= 0 && kPad >= 0, "test presets exist");
  const std::string sawX = "A \xC2\xB7 Reese Sub X", sawZ = "A \xC2\xB7 Reese Sub Z";
  double cutZ = 0;

  // ================================================================ first run of the plug-in
  {
    HMODULE mod = LoadLibraryW(dll.c_str());
    if (!mod) { std::printf("cannot load %ls\n", dll.c_str()); return 2; }
    auto getFactory = (IPluginFactory * (PLUGIN_API*)())GetProcAddress(mod, "GetPluginFactory");
    if (auto initDll = (bool (*)())GetProcAddress(mod, "InitDll")) initDll();
    Session S;
    check(S.open(getFactory()), "editor attached");
    Host& h = S.h;

    std::printf("0. the browser, open by default; the old user bank taken over\n");
    check(clientW(h) == 1460, "the editor is 1460 px wide with the browser (1100 without)", std::to_string(clientW(h)));
    h.command(1000);   // the first bank sound (the bank read again)
    h.run(0.2);
    check(h.stateName() == "USER \xC2\xB7 Old Pad" && std::fabs(h.plain(P_F_CUTOFF) - 3) < 1e-9, "the beta 0.3 bank sound 'Old Pad' is there", h.stateName());
    h.shot(out + L"\\1_browser.png");

    std::printf("1. browsing: Bass, then its 5th sound\n");
    clickAt(h, TAB0_X, TAB_Y);
    clickAt(h, CAT_X, catY(2));   // Bass (after TOP Sounds and Source Phase, beta 0.5)
    clickAt(h, ROW_X, rowY(2));   // its third sound: A · Reese Sub
    h.run(0.2);
    check(h.stateName() == "A \xC2\xB7 Reese Sub", "a click on a sound loads it", h.stateName());
    h.shot(out + L"\\2_bass.png");

    std::printf("2. SAVE PRESET: the factory preset adjusted, under a new name\n");
    h.drag(50, 408, -45);   // CUTOFF
    h.run(0.2);
    const double cut = h.plain(P_F_CUTOFF);
    std::wstring proposed; bool combo = true;
    Responder r1;
    r1.start({{L"Save preset", [&](HWND d) {
      wchar_t b[128] = {}; GetDlgItemTextW(d, 101, b, 128); proposed = b; combo = GetDlgItem(d, 102) != nullptr;
      SetDlgItemTextW(d, 101, L"A · Reese Sub X");
      press(d, IDOK);
    }}});
    clickPosted(h, SAVE_X, SAVE_Y);
    r1.wait(h);
    std::string txt = readFile(lib), blk = factoryBlock(txt, "A \xC2\xB7 Reese Sub");
    check(u8(proposed) == "A \xC2\xB7 Reese Sub" && !combo, "the save window proposes the name (no section for a factory preset)", u8(proposed));
    check(has(blk, "Preset: " + sawX + "\r\nFactory: A \xC2\xB7 Reese Sub\r\nAdjusted: yes\r\n") && has(blk, "  f_cutoff: " + num6(cut) + "   ("),
          "presets file: the preset adjusted, renamed, its new cutoff", fmt("cutoff %.3f", cut));
    check(count(txt, "Adjusted: no") == kNumPresets - 1 && has(txt, "######## USER BANK ########") && has(txt, "Preset: Old Pad"),
          "presets file: every other factory preset and the user bank");
    int dirty = -1;
    check(h.stateName(&dirty) == sawX && dirty == 0, "the preset name now, not modified", h.stateName());

    std::printf("3. a name already used by another preset is refused\n");
    Responder r2;
    r2.start({{L"Save preset", [&](HWND d) { SetDlgItemTextW(d, 101, L"A · Warm Pad"); press(d, IDOK); }},
              {L"Wavelet Synthesizer", [&](HWND d) { PostMessageW(d, WM_COMMAND, IDCANCEL, 0); }}});
    clickPosted(h, SAVE_X, SAVE_Y);
    r2.wait(h);
    check(r2.seen.size() == 2 && has(u8(r2.seen[1]), "already called"), "refused with a message", r2.seen.size() > 1 ? u8(r2.seen[1]) : "");
    check(has(readFile(lib), "Preset: " + sawX), "the file keeps the adjusted preset");

    std::printf("4. TO BANK (browser), then the user tab\n");
    Responder r3;
    r3.start({{L"Save to user bank", [&](HWND d) {
      SetDlgItemTextW(d, 101, L"My Bass X"); SendDlgItemMessageW(d, 102, CB_SETCURSEL, 9, 0); press(d, IDOK); }}});
    clickPosted(h, btnX(0), BTN_Y);
    r3.wait(h);
    txt = readFile(lib);
    check(has(txt, "== Chords ==\r\n\r\nPreset: My Bass X\r\nFrom: " + sawX + "\r\n"), "saved in the user bank (Chords)");
    clickAt(h, TAB1_X, TAB_Y);
    clickAt(h, CAT_X, catY(9));   // Chords
    clickAt(h, ROW_X, rowY(0));
    h.run(0.2);
    check(h.stateName() == "USER \xC2\xB7 My Bass X", "the user tab lists and loads it", h.stateName());
    h.shot(out + L"\\3_user.png");

    std::printf("5. SAVE PRESET on a bank sound: renamed in place\n");
    Responder r4;
    r4.start({{L"Save preset", [&](HWND d) { SetDlgItemTextW(d, 101, L"My Bass Y"); press(d, IDOK); }}});
    clickPosted(h, SAVE_X, SAVE_Y);
    r4.wait(h);
    txt = readFile(lib);
    check(has(txt, "Preset: My Bass Y") && !has(txt, "Preset: My Bass X") && h.stateName() == "USER \xC2\xB7 My Bass Y", "renamed in the bank", h.stateName());

    std::printf("6. DELETE (browser, user tab)\n");
    Responder r5;
    r5.start({{L"Wavelet Synthesizer", [&](HWND d) { press(d, IDYES); }}});
    clickPosted(h, btnX(2), BTN_Y);
    r5.wait(h);
    check(!has(readFile(lib), "My Bass Y") && !r5.seen.empty() && has(u8(r5.seen[0]), "Delete"), "deleted after a question");

    std::printf("7. RESTORE (browser, factory tab)\n");
    clickAt(h, TAB0_X, TAB_Y);
    clickAt(h, CAT_X, catY(2));
    clickAt(h, ROW_X, rowY(2));
    h.run(0.2);
    check(h.stateName() == sawX && std::fabs(h.plain(P_F_CUTOFF) - cut) < 1e-9, "the adjusted preset loads with its new sound", h.stateName());
    Responder r6;
    r6.start({{L"Wavelet Synthesizer", [&](HWND d) { press(d, IDYES); }}});
    clickPosted(h, btnX(1), BTN_Y);
    r6.wait(h);
    h.run(0.2);
    blk = factoryBlock(readFile(lib), "A \xC2\xB7 Reese Sub");
    check(has(blk, "Preset: A \xC2\xB7 Reese Sub\r\nFactory: A \xC2\xB7 Reese Sub\r\nAdjusted: no"), "the file has the original again");
    check(h.stateName() == "A \xC2\xB7 Reese Sub" && std::fabs(h.plain(P_F_CUTOFF) - kPresets[kSaw].v[P_F_CUTOFF]) < 1e-9, "the original sound plays", h.stateName());

    std::printf("8. adjusted again (kept for the next run), exported\n");
    h.drag(50, 408, -30);
    h.run(0.2);
    cutZ = h.plain(P_F_CUTOFF);
    Responder r7;
    r7.start({{L"Save preset", [&](HWND d) { SetDlgItemTextW(d, 101, L"A · Reese Sub Z"); press(d, IDOK); }}});
    clickPosted(h, SAVE_X, SAVE_Y);
    r7.wait(h);
    clickAt(h, btnX(3), BTN_Y);   // EXPORT (WS_PRESETS_EXPORT: no dialog)
    check(!readFile(exported).empty() && noSaved(readFile(exported)) == noSaved(readFile(lib)), "EXPORT writes the whole presets file");

    std::printf("8b. TOP Sounds; DELETE a factory preset, the arrows skip it, it comes back\n");
    clickAt(h, CAT_X, catY(0));   // TOP Sounds
    clickAt(h, ROW_X, rowY(2));   // beta 0.5: its third sound, the third of the factory order
    h.run(0.2);
    check(h.stateName() == kPresets[2].name, "TOP Sounds: OktoPierre's selection, in the factory order", h.stateName());
    clickAt(h, CAT_X, catY(2));   // Bass
    clickAt(h, ROW_X, rowY(4));   // A · Ladder Bass
    h.run(0.2);
    const std::string victim = h.stateName();
    const int kVictim = presetIndex(victim.c_str());
    Responder r9;
    r9.start({{L"Wavelet Synthesizer", [&](HWND d) { press(d, IDYES); }}});
    clickPosted(h, btnX(2), BTN_Y);
    r9.wait(h);
    h.run(0.2);
    std::string vb = factoryBlock(readFile(lib), victim);
    check(kVictim >= 0 && has(vb, "Adjusted: no\r\nDeleted: yes"), "the file marks it \"Deleted: yes\"", victim);
    check(h.stateName() != victim && !h.stateName().empty(), "the next sound of the list plays", h.stateName());
    h.command(100 + kVictim - 1);   // the preset before it, then ▶
    h.run(0.1);
    clickAt(h, 566 + 304 - 15, 24);   // ▶ of the preset box (beta 0.6: the box is 304 wide)
    h.run(0.1);
    check(h.stateName() != victim, "▶ skips the deleted preset", h.stateName());
    h.command(5000 + kVictim);   // the menu's "Deleted presets": back
    check(!has(factoryBlock(readFile(lib), victim), "Deleted: yes"), "brought back", victim);

    std::printf("9. SUB OCT by a click, LFO 2 target by the wheel\n");
    const double oct0 = h.plain(P_SUB_OCT);
    clickAt(h, 594, 232);   // SUB OSC: OCT (beta 0.6: at the top, next to the oscillator)
    h.run(0.1);
    const double oct1 = h.plain(P_SUB_OCT);
    clickAt(h, 594, 232);
    h.run(0.1);
    check(oct1 != oct0 && h.plain(P_SUB_OCT) == oct0, "a click switches OCT, a second click switches it back", fmt("%.0f -> %.0f", oct0, oct1));
    {
      POINT pt{504, 568}; ClientToScreen(h.ed, &pt);   // beta 0.6: LFO 2 TARGET, beside LFO 1
      SendMessageW(h.ed, WM_MOUSEWHEEL, MAKEWPARAM(0, WHEEL_DELTA), MAKELPARAM(pt.x, pt.y));
      h.pump();
    }
    check(h.plain(P_LFO2_TARGET) == 1, "the wheel on the LFO 2 menu: CUTOFF -> SLOPE", fmt("%.0f", h.plain(P_LFO2_TARGET)));
    h.shot(out + L"\\4_lfo2.png");

    std::printf("9b. beta 0.6: the SYNC buttons of the delay and the two LFOs; TIME / RATE become note values\n");
    const double dt0 = h.plain(P_FX_DTIME), dd0 = h.plain(P_FX_DDIV);
    clickAt(h, 596 + 332 + 21, 472 + 29 + 8);   // EFFECTS: the delay's SYNC
    h.run(0.1);
    check(h.plain(P_FX_DSYNC) == 1, "a click on the delay's SYNC turns it on", fmt("%.0f", h.plain(P_FX_DSYNC)));
    {   // the wheel on TIME now moves the note value, not the time in seconds
      POINT pt{596 + 220 + 26, 472 + 64 + 20}; ClientToScreen(h.ed, &pt);
      SendMessageW(h.ed, WM_MOUSEWHEEL, MAKEWPARAM(0, WHEEL_DELTA), MAKELPARAM(pt.x, pt.y));
      h.pump();
    }
    check(h.plain(P_FX_DDIV) == dd0 + 1 && h.plain(P_FX_DTIME) == dt0, "with SYNC, the wheel on TIME steps the note value (1/8 -> 1/4 T); the time in seconds stays",
          fmt("note %.0f", h.plain(P_FX_DDIV)) + fmt(", time %.3f s", h.plain(P_FX_DTIME)));
    clickAt(h, 12 + 230 + 21, 472 + 6 + 8);    // LFO 1's SYNC
    clickAt(h, 304 + 230 + 21, 472 + 6 + 8);   // LFO 2's SYNC
    h.run(0.1);
    check(h.plain(P_LFO_SYNC) == 1 && h.plain(P_LFO2_SYNC) == 1, "LFO 1 and LFO 2 have their own SYNC");
    h.shot(out + L"\\4b_sync.png");
    for (float x : {596.f + 332 + 21, 12.f + 230 + 21, 304.f + 230 + 21}) clickAt(h, x, x > 590 ? 472 + 29 + 8 : 472 + 6 + 8);   // all off
    h.run(0.1);
    check(h.plain(P_FX_DSYNC) == 0 && h.plain(P_LFO_SYNC) == 0 && h.plain(P_LFO2_SYNC) == 0, "a second click turns each SYNC off");

    std::printf("10. HIDE and back; the state keeps it\n");
    clickAt(h, HIDE_X, HIDE_Y);
    check(clientW(h) == 1100, "HIDE: the editor is 1100 px wide", std::to_string(clientW(h)));
    { Stream s; h.ctrl->getState(&s); uint32_t len; std::memcpy(&len, &s.data[12], 4);
      check(s.data.size() == 16 + len + 4, "the state says the browser is closed", std::to_string(s.data.size())); }
    h.shot(out + L"\\5_hidden.png");
    clickAt(h, NAME_X, NAME_Y);
    check(clientW(h) == 1460, "a click on the preset name opens the browser again", std::to_string(clientW(h)));
    { Stream s; h.ctrl->getState(&s); uint32_t len; std::memcpy(&len, &s.data[12], 4);
      check(s.data.size() == 16 + len, "open: the state has no extra bytes (as before)", std::to_string(s.data.size())); }

    std::printf("10b. MOVE UP in a category and in the user bank\n");
    clickAt(h, TAB0_X, TAB_Y);
    clickAt(h, CAT_X, catY(2));   // Bass
    clickAt(h, ROW_X, rowY(2));   // A · Reese Sub Z
    h.run(0.1);
    clickAt(h, UP_X, MOVE_Y);
    txt = readFile(lib);
    check(has(txt, "== Bass ==\r\n1. B \xC2\xB7 Mirror Sub Bass\r\n2. A \xC2\xB7 Reese Sub   (now: " + sawZ + ")\r\n3. A \xC2\xB7 Wave Wobble Bass\r\n4. A \xC2\xB7 Acid Sub\r\n"),
          "▲: the list order in the file (2nd now)");
    check(h.stateName() == sawZ, "the same sound still plays", h.stateName());
    Responder r10;
    r10.start({{L"Save to user bank", [&](HWND d) { SetDlgItemTextW(d, 101, L"Pad Two"); SendDlgItemMessageW(d, 102, CB_SETCURSEL, 4, 0); press(d, IDOK); }}});
    clickPosted(h, btnX(0), BTN_Y);   // TO BANK, section Pad (after "Old Pad")
    r10.wait(h);
    clickAt(h, UP_X, MOVE_Y);         // the user tab is shown, Pad Two playing
    txt = readFile(lib);
    const size_t pu = txt.find("######## USER BANK");
    check(pu != std::string::npos && txt.find("Preset: Pad Two", pu) < txt.find("Preset: Old Pad", pu), "▲ in the user bank: Pad Two before Old Pad");
    h.shot(out + L"\\7_order.png");

    std::printf("11. a folder that cannot be written\n");
    h.command(100 + kPad);   // a factory preset: SAVE PRESET adjusts it
    h.run(0.1);
    SetEnvironmentVariableW(L"WS_PRESETS_FILE", (out + L"\\no such folder\\p.txt").c_str());
    Responder r8;
    r8.start({{L"Save preset", [&](HWND d) { press(d, IDOK); }}, {L"Wavelet Synthesizer", [&](HWND d) { PostMessageW(d, WM_COMMAND, IDCANCEL, 0); }}});
    clickPosted(h, SAVE_X, SAVE_Y);
    r8.wait(h);
    check(r8.seen.size() == 2 && has(u8(r8.seen[1]), "Could not save the preset") && has(u8(r8.seen[1]), "no such folder"), "clear message with the path",
          r8.seen.size() > 1 ? u8(r8.seen[1]).substr(0, 120) : "");
    SetEnvironmentVariableW(L"WS_PRESETS_FILE", lib.c_str());
    check(h.handler.badNesting == 0, "every performEdit inside beginEdit/endEdit");
    S.close();
    if (auto exitDll = (bool (*)())GetProcAddress(mod, "ExitDll")) exitDll();
    FreeLibrary(mod);
  }

  // ================================================================ the plug-in loaded again (Ableton reopened)
  std::printf("12. reopened: the adjusted preset is still there\n");
  {
    HMODULE mod = LoadLibraryW(dll.c_str());
    auto getFactory = (IPluginFactory * (PLUGIN_API*)())GetProcAddress(mod, "GetPluginFactory");
    if (auto initDll = (bool (*)())GetProcAddress(mod, "InitDll")) initDll();
    Session S;
    check(S.open(getFactory()), "editor attached again");
    Host& h = S.h;
    clickAt(h, TAB0_X, TAB_Y);
    clickAt(h, CAT_X, catY(2));   // Bass: the order moved before the reload
    clickAt(h, ROW_X, rowY(1));
    h.run(0.2);
    check(h.stateName() == sawZ && std::fabs(h.plain(P_F_CUTOFF) - cutZ) < 1e-6, "the adjusted preset, its name, sound and place in Bass, after a reload",
          h.stateName() + fmt("  cutoff %.3f", h.plain(P_F_CUTOFF)));
    h.shot(out + L"\\6_reopened.png");

    std::printf("13. the scroll bar (beta 0.4): the 44 sounds of Source Phase, the thumb dragged, the bar clicked\n");
    std::vector<int> spk;
    for (int k = 0; k < kNumPresets; k++) if (std::strcmp(kPresets[k].cat, "Source Phase") == 0) spk.push_back(k);
    std::sort(spk.begin(), spk.end(), [](int a, int b) { return kPresetRank[a] < kPresetRank[b]; });   // the browser's order
    std::vector<std::string> sp;
    for (int k : spk) sp.push_back(kPresets[k].name);
    const size_t nsp = sp.size();
    const float BAR_X = 1104 + 136 + 186 + 2 + 6, BAR_TOP = 8 + 98, BAR_H = 548;   // the bar right of the list
    clickAt(h, CAT_X, catY(1));   // Source Phase (beta 0.5: second, after TOP Sounds)
    h.drag(BAR_X, BAR_TOP + 10, BAR_H);   // the thumb from the top to the bottom
    clickAt(h, ROW_X, rowY(0));
    h.run(0.2);
    check(nsp == 44 && h.stateName() == sp[nsp - 24], "thumb dragged to the bottom: the first row shown is the 21st sound", h.stateName());
    clickAt(h, BAR_X, BAR_TOP + 20);   // a click on the bar above the thumb: the thumb goes there (the top)
    clickAt(h, ROW_X, rowY(0));
    h.run(0.2);
    check(h.stateName() == sp[0], "a click on the bar above the thumb scrolls back to the top", h.stateName());
    h.shot(out + L"\\8_scroll.png");

    std::printf("14. IMPORT (beta 0.4): another presets file replaces the library, a backup copy is kept\n");
    const std::wstring imp = out + L"\\import me.txt", bad = out + L"\\not presets.txt";
    std::string itxt = readFile(exported);   // the export of step 8 (Reese Sub Z, the bank with Old Pad)
    const size_t op = itxt.find("Preset: Old Pad");
    if (op != std::string::npos) itxt.replace(op, 15, "Preset: Imported Pad");
    { FILE* f = _wfopen(imp.c_str(), L"wb"); std::fwrite(itxt.data(), 1, itxt.size(), f); std::fclose(f); }
    { FILE* f = _wfopen(bad.c_str(), L"wb"); std::fputs("just a text file\r\n", f); std::fclose(f); }
    const std::string before = readFile(lib);
    SetEnvironmentVariableW(L"WS_PRESETS_IMPORT", imp.c_str());
    Responder r11;
    r11.start({{L"Wavelet Synthesizer", [&](HWND d) { press(d, IDYES); }}});
    clickPosted(h, btnX(4), BTN_Y);   // IMPORT (WS_PRESETS_IMPORT: no file window)
    r11.wait(h);
    const std::string after = readFile(lib);
    std::string bk;
    { WIN32_FIND_DATAW fd; HANDLE fh = FindFirstFileW((dir + L"\\OKTOWAVE presets (backup *).txt").c_str(), &fd);
      if (fh != INVALID_HANDLE_VALUE) { bk = readFile(dir + L"\\" + fd.cFileName); FindClose(fh); } }
    check(!r11.seen.empty() && has(u8(r11.seen[0]), "Replace your presets"), "a question first", r11.seen.empty() ? "" : u8(r11.seen[0]).substr(0, 60));
    check(has(after, "Preset: Imported Pad") && !has(after, "Preset: Old Pad") && !has(after, "Preset: Pad Two") && has(after, "Preset: " + sawZ),
          "the library is now the imported one (its bank, its adjusted preset)");
    check(!bk.empty() && noSaved(bk) == noSaved(before), "the previous file is kept as a backup copy next to it");
    h.command(1000);   // the first bank sound, the bank read again
    h.run(0.2);
    check(h.stateName() == "USER \xC2\xB7 Imported Pad", "the imported bank sound loads", h.stateName());
    SetEnvironmentVariableW(L"WS_PRESETS_IMPORT", bad.c_str());
    Responder r12;
    r12.start({{L"Wavelet Synthesizer", [&](HWND d) { press(d, IDYES); }}, {L"Wavelet Synthesizer", [&](HWND d) { PostMessageW(d, WM_COMMAND, IDCANCEL, 0); }}});
    clickPosted(h, btnX(4), BTN_Y);
    r12.wait(h);
    check(r12.seen.size() == 2 && has(u8(r12.seen[1]), "Could not import") && readFile(lib) == after, "a file without presets is refused, the library unchanged",
          r12.seen.size() > 1 ? u8(r12.seen[1]).substr(0, 100) : "");
    SetEnvironmentVariableW(L"WS_PRESETS_IMPORT", imp.c_str());   // imported again (the same minute): a second backup, the first kept
    Responder r13;
    r13.start({{L"Wavelet Synthesizer", [&](HWND d) { press(d, IDYES); }}});
    clickPosted(h, btnX(4), BTN_Y);
    r13.wait(h);
    int nb = 0; bool firstKept = false;
    { WIN32_FIND_DATAW fd; HANDLE fh = FindFirstFileW((dir + L"\\OKTOWAVE presets (backup *).txt").c_str(), &fd);
      if (fh != INVALID_HANDLE_VALUE) { do { nb++; if (readFile(dir + L"\\" + fd.cFileName) == before) firstKept = true; } while (FindNextFileW(fh, &fd)); FindClose(fh); } }
    check(nb == 2 && firstKept, "a second import: a second backup copy, the first one (the presets before any import) kept", std::to_string(nb) + " backups");
    SetEnvironmentVariableW(L"WS_PRESETS_IMPORT", nullptr);

    std::printf("15. beta 0.5: a sound dragged to another category, its menu, TOP Sounds, the arrow keys, a bank sound moved\n");
    const std::string mss = "A \xC2\xB7 Mirror Sub Bass Shift", ck = "A \xC2\xB7 Clean Keys", hk = "AB \xC2\xB7 Hybrid Keys",
                      to1 = "B \xC2\xB7 Theatre Organ";
    std::string txt;
    clickAt(h, TAB0_X, TAB_Y);
    clickAt(h, CAT_X, catY(1));   // Source Phase
    dragTo(h, ROW_X, rowY(0), CAT_X, catY(2));   // its first sound onto Bass
    h.run(0.2);
    txt = readFile(lib);
    check(h.stateName() == mss, "the sound pressed plays", h.stateName());
    check(has(txt, "######## LIST ORDER v2") && has(listOf(txt, "Bass"), "7. " + mss) && !has(listOf(txt, "Source Phase"), mss),
          "dragged onto Bass: the file's Bass list ends with it, Source Phase no longer has it", listOf(txt, "Bass"));
    clickAt(h, CAT_X, catY(2));
    clickAt(h, ROW_X, rowY(6));
    h.run(0.2);
    check(h.stateName() == mss, "Bass shows it (7th)", h.stateName());
    h.shot(out + L"\\9_moved.png");
    h.command(7000 + 1);   // the sound menu: Move to / Back to Source Phase (list 1)
    txt = readFile(lib);
    check(has(listOf(txt, "Source Phase"), "== Source Phase ==\r\n1. " + mss + "\r\n") && !has(listOf(txt, "Bass"), mss),
          "back to Source Phase, at its own place (first)", listOf(txt, "Source Phase").substr(0, 80));
    clickAt(h, CAT_X, catY(4));   // Keys
    {   // A · Clean Keys onto TOP Sounds, with a picture while it is dragged (the category under it lit, its name)
      const auto lp = [](float x, float y) { return MAKELPARAM((int)std::lround(x), (int)std::lround(y)); };
      SendMessageW(h.ed, WM_MOUSEMOVE, 0, lp(ROW_X, rowY(0)));
      SendMessageW(h.ed, WM_LBUTTONDOWN, MK_LBUTTON, lp(ROW_X, rowY(0)));
      for (int k = 1; k <= 12; k++)
        SendMessageW(h.ed, WM_MOUSEMOVE, MK_LBUTTON, lp(ROW_X + (CAT_X - ROW_X) * k / 12, rowY(0) + (catY(0) - rowY(0)) * k / 12));
      h.pump();
      h.shot(out + L"\\9b_dragging.png");
      SendMessageW(h.ed, WM_LBUTTONUP, 0, lp(CAT_X, catY(0)));
      h.pump();
    }
    h.run(0.2);
    txt = readFile(lib);
    check(h.stateName() == ck && has(listOf(txt, "TOP Sounds"), std::to_string(kNumTop + 1) + ". " + ck) && has(listOf(txt, "Keys"), "1. " + ck),
          "dragged onto TOP Sounds: added at its end, still in Keys", h.stateName());
    h.command(7101);   // the sound menu: Remove from TOP Sounds
    txt = readFile(lib);
    check(!has(listOf(txt, "TOP Sounds"), ck) && has(listOf(txt, "Keys"), "1. " + ck), "taken out of TOP Sounds again (still in Keys)");
    keyTo(h, VK_DOWN);   // Keys is shown, Clean Keys playing
    check(h.stateName() == hk, "↓: the next sound of the list plays", h.stateName());
    keyTo(h, VK_UP);
    check(h.stateName() == ck, "↑: the sound above", h.stateName());
    keyTo(h, VK_RIGHT);   // the next category: Organ
    check(h.stateName() == ck, "→ shows the next category without changing the sound", h.stateName());
    keyTo(h, VK_DOWN);
    check(h.stateName() == to1, "↓ there: its first sound (B · Theatre Organ)", h.stateName());
    h.view->onKeyDown(0, KEY_DOWN, 0);   // VST3: the key as a host passes it
    h.run(0.05);
    check(h.stateName() == "B \xC2\xB7 Full Drawbar Organ", "IPlugView::onKeyDown(KEY_DOWN): the next one", h.stateName());
    check(h.view->onKeyDown('a', 0, 0) == kResultFalse, "another key is left to the host");
    clickAt(h, TAB1_X, TAB_Y);    // the user bank: Imported Pad (Pad)
    clickAt(h, CAT_X, catY(4));   // Pad
    dragTo(h, ROW_X, rowY(0), CAT_X, catY(1));   // onto Lead
    h.run(0.2);
    txt = readFile(lib);
    check(has(txt, "== Lead ==\r\n\r\nPreset: Imported Pad\r\n") && h.stateName() == "USER \xC2\xB7 Imported Pad", "a bank sound dragged onto Lead moves there",
          h.stateName());
    h.shot(out + L"\\10_bank_moved.png");
    S.close();
    FreeLibrary(mod);
  }
  std::printf("\npresets file (start):\n%s\n", readFile(lib).substr(0, 700).c_str());
  std::printf(gFails ? "%d FAILED\n" : "ALL PASS\n", gFails);
  return gFails ? 1 : 0;
}
