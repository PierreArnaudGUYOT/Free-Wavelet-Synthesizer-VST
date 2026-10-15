// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// Plugin editor: native Win32 window drawn with GDI+ (part of Windows).
// Same layout as the web UI (generated from tools/spec.js).
#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>
#include <algorithm>
namespace Gdiplus { using std::min; using std::max; }
#include <gdiplus.h>
#include <cmath>
#include <cstring>
#include <map>
#include <vector>
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "common.h"

using namespace Steinberg;
namespace G = Gdiplus;

namespace ws {

// ------------------------------------------------------------------ palette
static G::Color rgb(uint32_t c, int a = 255) { return G::Color((BYTE)a, (BYTE)(c >> 16), (BYTE)(c >> 8), (BYTE)c); }
static const uint32_t kText = 0xd5dce6, kDim = 0x8792a1, kFaint = 0x566070, kInset = 0x101317, kInsetEdge = 0x262c35;
static const uint32_t kAccentA = 0x2fd4c6, kAccentB = 0xffae42;

static ULONG_PTR gGdiToken = 0;
static int gGdiUsers = 0, gClassUsers = 0;
static const wchar_t* kClassName = L"WaveletSynthesizerEditorWnd";

static HMODULE thisModule() {
  HMODULE h = nullptr;
  GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCWSTR)&thisModule, &h);
  return h;
}

struct R { float x, y, w, h; bool has(float px, float py) const { return px >= x && py >= y && px < x + w && py < y + h; }
  bool hits(const R& o) const { return x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h; } };

struct Item { const WidgetDef* w; int section; R r; };

static const char* kNoteNames[] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
static std::wstring noteName(int n) { return toW(std::string(kNoteNames[n % 12]) + std::to_string(n / 12 - 1)); }
static bool isBlack(int n) { int k = n % 12; return k == 1 || k == 3 || k == 6 || k == 8 || k == 10; }
static const int KB_LO = 36, KB_HI = 96;

class Editor : public IPlugView, public IPlugViewContentScaleSupport {
 public:
  Editor(EditorHost* h, FUnknown* keep) : host(h), keepAlive(keep) {
    if (keepAlive) keepAlive->addRef();
    for (int s = 0; s < kNumSections; s++) {
      const SectionDef& sd = kSections[s];
      for (int k = 0; k < sd.numWidgets; k++) {
        const WidgetDef& w = kWidgets[sd.firstWidget + k];
        items.push_back(Item{&w, s, R{sd.x + w.x, sd.y + w.y, w.w, w.h}});
      }
    }
    for (int i = 0; i < kNumParams; i++) lastPlain[i] = host->getPlain(i);
  }
  virtual ~Editor() { cleanup(); if (keepAlive) keepAlive->release(); }

  // FUnknown
  tresult PLUGIN_API queryInterface(const TUID _iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(_iid, IPlugView::iid) || FUnknownPrivate::iidEqual(_iid, FUnknown::iid)) { addRef(); *obj = static_cast<IPlugView*>(this); return kResultOk; }
    if (FUnknownPrivate::iidEqual(_iid, IPlugViewContentScaleSupport::iid)) { addRef(); *obj = static_cast<IPlugViewContentScaleSupport*>(this); return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
  uint32 PLUGIN_API addRef() override { return ++refs; }
  uint32 PLUGIN_API release() override { uint32 r = --refs; if (!r) delete this; return r; }

  // IPlugView
  tresult PLUGIN_API isPlatformTypeSupported(FIDString type) override { return type && std::strcmp(type, kPlatformTypeHWND) == 0 ? kResultTrue : kResultFalse; }
  tresult PLUGIN_API attached(void* parent, FIDString type) override {
    if (!parent || isPlatformTypeSupported(type) != kResultTrue || hwnd) return kResultFalse;
    if (gGdiUsers++ == 0) { G::GdiplusStartupInput in; G::GdiplusStartup(&gGdiToken, &in, nullptr); }
    if (gClassUsers++ == 0) {
      WNDCLASSEXW wc{}; wc.cbSize = sizeof wc; wc.style = CS_DBLCLKS; wc.lpfnWndProc = &Editor::wndProc;
      wc.hInstance = thisModule(); wc.hCursor = LoadCursor(nullptr, IDC_ARROW); wc.lpszClassName = kClassName;
      RegisterClassExW(&wc);
    }
    HWND p = (HWND)parent;
    if (!hostScale) dpiScale = windowDpi(p);
    int W = pxW(), H = pxH();
    hwnd = CreateWindowExW(0, kClassName, L"Wavelet Synthesizer", WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS, 0, 0, W, H, p, nullptr, thisModule(), this);
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)this);
    SetTimer(hwnd, 1, 33, nullptr);
    rebuildDisplay(true);
    if (frame && (W != reportedW || H != reportedH)) requestResize();
    return kResultOk;
  }
  tresult PLUGIN_API removed() override { cleanup(); return kResultOk; }
  tresult PLUGIN_API onWheel(float distance) override {
    if (hover >= 0) wheelOn(hover, distance > 0 ? 1 : -1);
    return kResultTrue;
  }
  tresult PLUGIN_API onKeyDown(char16, int16, int16) override { return kResultFalse; }
  tresult PLUGIN_API onKeyUp(char16, int16, int16) override { return kResultFalse; }
  tresult PLUGIN_API getSize(ViewRect* size) override {
    if (!size) return kInvalidArgument;
    if (!hwnd && !hostScale) dpiScale = systemDpi();
    reportedW = pxW(); reportedH = pxH();
    *size = ViewRect(0, 0, reportedW, reportedH);
    return kResultOk;
  }
  tresult PLUGIN_API onSize(ViewRect* r) override {
    if (!r) return kInvalidArgument;
    if (hwnd) SetWindowPos(hwnd, nullptr, 0, 0, r->getWidth(), r->getHeight(), SWP_NOZORDER | SWP_NOMOVE | SWP_NOACTIVATE);
    return kResultOk;
  }
  tresult PLUGIN_API onFocus(TBool) override { return kResultOk; }
  tresult PLUGIN_API setFrame(IPlugFrame* f) override { frame = f; return kResultOk; }
  tresult PLUGIN_API canResize() override { return kResultFalse; }
  tresult PLUGIN_API checkSizeConstraint(ViewRect* r) override { if (r) *r = ViewRect(0, 0, pxW(), pxH()); return kResultTrue; }

  // IPlugViewContentScaleSupport
  tresult PLUGIN_API setContentScaleFactor(ScaleFactor f) override {
    if (!(f > 0.25f && f < 8.0f)) return kResultFalse;
    hostScale = true;
    if (std::fabs(f - dpiScale) > 1e-3) { dpiScale = f; if (hwnd) requestResize(); }
    return kResultOk;
  }

 private:
  std::atomic<uint32> refs{1};
  EditorHost* host;
  FUnknown* keepAlive;
  IPlugFrame* frame = nullptr;
  HWND hwnd = nullptr;
  double dpiScale = 1; bool hostScale = false;
  int reportedW = 0, reportedH = 0;
  std::vector<Item> items;
  // back buffer
  HDC memDC = nullptr; HBITMAP memBmp = nullptr, oldBmp = nullptr; int bufW = 0, bufH = 0;
  std::map<int, G::Font*> fonts;
  G::FontFamily* family = nullptr;
  // state
  double lastPlain[kNumParams];
  uint32_t lastVersion = 0;
  int mode = 0;
  Tables disp; uint64_t dispSig = ~0ull;
  std::map<int, Atom> atoms;
  // live data
  float liveGains[NB] = {}; float liveC = 0, liveW = 1, liveD = 0; int liveNote = -1, liveMode = 0; uint32_t liveVoices = 0;
  uint32_t liveKeys[4] = {}; float meterL = 0, meterR = 0;
  // interaction
  int hover = -1, drag = -1; float dragY = 0; double dragNorm = 0; bool dragShift = false;
  int mouseNote = -1; int wheelDrag = -1;  // 0 bend, 1 mod
  bool tracking = false;

  double scale() const { return dpiScale * host->zoom(); }
  int pxW() const { return (int)std::lround(kDeviceW * scale()); }
  int pxH() const { return (int)std::lround(kDeviceH * scale()); }
  uint32_t accent() const { return mode == 0 ? kAccentA : kAccentB; }

  static double systemDpi() {
    typedef UINT(WINAPI * Fn)();
    static Fn fn = (Fn)GetProcAddress(GetModuleHandleW(L"user32.dll"), "GetDpiForSystem");
    if (fn) return fn() / 96.0;
    HDC dc = GetDC(nullptr); int d = GetDeviceCaps(dc, LOGPIXELSX); ReleaseDC(nullptr, dc); return d / 96.0;
  }
  static double windowDpi(HWND w) {
    typedef UINT(WINAPI * Fn)(HWND);
    static Fn fn = (Fn)GetProcAddress(GetModuleHandleW(L"user32.dll"), "GetDpiForWindow");
    if (fn) { UINT d = fn(w); if (d) return d / 96.0; }
    return systemDpi();
  }

  void requestResize() {
    ViewRect r(0, 0, pxW(), pxH());
    reportedW = r.getWidth(); reportedH = r.getHeight();
    if (frame) frame->resizeView(this, &r);
    if (hwnd) SetWindowPos(hwnd, nullptr, 0, 0, r.getWidth(), r.getHeight(), SWP_NOZORDER | SWP_NOMOVE | SWP_NOACTIVATE);
    InvalidateRect(hwnd, nullptr, FALSE);
  }

  void cleanup() {
    if (hwnd) {
      KillTimer(hwnd, 1);
      if (mouseNote >= 0) noteOff(mouseNote);
      SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
      DestroyWindow(hwnd); hwnd = nullptr;
      freeBuffer();
      for (auto& f : fonts) delete f.second;
      fonts.clear();
      delete family; family = nullptr;
      if (--gGdiUsers == 0) G::GdiplusShutdown(gGdiToken);
      if (--gClassUsers == 0) UnregisterClassW(kClassName, thisModule());
    }
  }
  void freeBuffer() {
    if (memDC) { SelectObject(memDC, oldBmp); DeleteObject(memBmp); DeleteDC(memDC); memDC = nullptr; memBmp = nullptr; }
    bufW = bufH = 0;
  }

  // ---------------------------------------------------------------- params & display data
  double plainOf(int id) { return host->getPlain(id); }
  void currentParams(double* v) { for (int i = 0; i < kNumParams; i++) v[i] = host->getPlain(i); }

  void rebuildDisplay(bool force) {
    double v[kNumParams]; currentParams(v);
    uint64_t sig = 1469598103934665603ull;
    for (int i = 0; i < kNumParams; i++) if (kParams[i].structural) {
      uint64_t bits; double d = v[i]; std::memcpy(&bits, &d, 8); sig = (sig ^ bits) * 1099511628211ull;
    }
    if (force || sig != dispSig) { buildTables(v, false, disp); dispSig = sig; }
    mode = (int)jsRound(v[P_ENGINE]);
  }

  bool visible(const Item& it) const {
    int m = kSections[it.section].mode;
    return m < 0 || m == mode;
  }

  void invalidateLogical(const R& r) {
    if (!hwnd) return;
    double s = scale();
    RECT rc{(LONG)std::floor((r.x - 2) * s), (LONG)std::floor((r.y - 2) * s), (LONG)std::ceil((r.x + r.w + 2) * s), (LONG)std::ceil((r.y + r.h + 2) * s)};
    InvalidateRect(hwnd, &rc, FALSE);
  }
  void invalidateType(int type) { for (auto& it : items) if (it.w->type == type) invalidateLogical(bubbleRect(it, true)); }
  void invalidateItem(int idx) { if (idx >= 0) invalidateLogical(bubbleRect(items[idx], true)); }
  R bubbleRect(const Item& it, bool withBubble) const {
    R r = it.r;
    if (withBubble && (it.w->type == W_KNOBS || it.w->type == W_DRAWBAR)) { r.x -= 60; r.w += 120; r.y -= 28; r.h += 28; }
    return r;
  }

  void onTimer() {
    // parameter changes (automation, preset loads, host)
    uint32_t ver = host->paramVersion();
    if (ver != lastVersion) {
      lastVersion = ver;
      int oldMode = mode;
      bool any = false, structural = false;
      for (int i = 0; i < kNumParams; i++) {
        double v = host->getPlain(i);
        if (v == lastPlain[i]) continue;
        lastPlain[i] = v; any = true;
        if (kParams[i].structural) structural = true;
        for (size_t k = 0; k < items.size(); k++) if (items[k].w->param == i) invalidateItem((int)k);
      }
      if (any) {
        rebuildDisplay(false);
        if (structural || mode != oldMode) InvalidateRect(hwnd, nullptr, FALSE);
        else for (int t : {W_SCOPE, W_SCALOGRAM, W_WINDOW, W_ADSR, W_LEDS, W_WHEELS, W_PRESETS}) invalidateType(t);
      }
      invalidateType(W_PRESETS);
    }
    // live data from the audio thread
    auto sh = host->sharedState();
    if (sh) {
      float g[NB]; bool changed = false;
      for (int b = 0; b < NB; b++) { g[b] = sh->gains[b].load(); if (g[b] != liveGains[b]) changed = true; liveGains[b] = g[b]; }
      float c = sh->center.load(), w = sh->width.load(), d = sh->depth.load();
      int n = sh->note.load(), m = sh->mode.load(); uint32_t vo = sh->voices.load();
      if (c != liveC || w != liveW || d != liveD || n != liveNote || m != liveMode) changed = true;
      liveC = c; liveW = w; liveD = d; liveNote = n; liveMode = m;
      if (changed) { invalidateType(W_SCOPE); invalidateType(W_SCALOGRAM); invalidateType(W_WINDOW); }
      if (vo != liveVoices) { liveVoices = vo; invalidateType(W_LEDS); }
      bool kc = false;
      for (int k = 0; k < 4; k++) { uint32_t b = sh->keys[k].load(); if (b != liveKeys[k]) kc = true; liveKeys[k] = b; }
      if (kc) invalidateType(W_KEYBOARD);
      float pl = sh->peakL.exchange(0), pr = sh->peakR.exchange(0);
      float nl = std::max(pl, meterL * 0.86f), nr = std::max(pr, meterR * 0.86f);
      if (std::fabs(nl - meterL) > 1e-5f || std::fabs(nr - meterR) > 1e-5f) { meterL = nl; meterR = nr; invalidateType(W_METER); }
    }
  }

  // ---------------------------------------------------------------- drawing helpers
  G::Font* font(float px, bool bold) {
    int key = (int)std::lround(px * 10) * 2 + (bold ? 1 : 0);
    auto it = fonts.find(key);
    if (it != fonts.end()) return it->second;
    if (!family) family = new G::FontFamily(L"Segoe UI");
    G::Font* f = new G::Font(family, px, bold ? G::FontStyleBold : G::FontStyleRegular, G::UnitPixel);
    fonts[key] = f;
    return f;
  }
  void text(G::Graphics& g, const std::wstring& s, R r, float px, bool bold, G::Color c, int align = 1, bool vcenter = true) {
    G::StringFormat f;
    f.SetAlignment(align == 0 ? G::StringAlignmentNear : align == 1 ? G::StringAlignmentCenter : G::StringAlignmentFar);
    f.SetLineAlignment(vcenter ? G::StringAlignmentCenter : G::StringAlignmentNear);
    f.SetFormatFlags(G::StringFormatFlagsNoWrap | G::StringFormatFlagsNoClip);
    f.SetTrimming(G::StringTrimmingNone);
    G::SolidBrush b(c);
    g.DrawString(s.c_str(), -1, font(px, bold), G::RectF(r.x, r.y, r.w, r.h), &f, &b);
  }
  static void rrPath(G::GraphicsPath& p, R r, float rad) {
    float d = rad * 2;
    if (rad <= 0) { p.AddRectangle(G::RectF(r.x, r.y, r.w, r.h)); return; }
    p.AddArc(r.x, r.y, d, d, 180, 90);
    p.AddArc(r.x + r.w - d, r.y, d, d, 270, 90);
    p.AddArc(r.x + r.w - d, r.y + r.h - d, d, d, 0, 90);
    p.AddArc(r.x, r.y + r.h - d, d, d, 90, 90);
    p.CloseFigure();
  }
  void fillRR(G::Graphics& g, R r, float rad, const G::Brush& b) { G::GraphicsPath p; rrPath(p, r, rad); g.FillPath(&b, &p); }
  void strokeRR(G::Graphics& g, R r, float rad, G::Color c, float w = 1) { G::GraphicsPath p; rrPath(p, r, rad); G::Pen pen(c, w); g.DrawPath(&pen, &p); }
  void inset(G::Graphics& g, R r, float rad = 7) {
    G::SolidBrush b(rgb(kInset)); fillRR(g, r, rad, b); strokeRR(g, R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, rad, rgb(kInsetEdge));
  }
  void screen(G::Graphics& g, R r) {
    G::SolidBrush b(rgb(0x0c0f13)); fillRR(g, r, 7, b); strokeRR(g, R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, 7, rgb(0x252b34));
  }
  void pill(G::Graphics& g, const std::wstring& s, float x, float y, bool right, G::Color c) {
    G::RectF bound;
    G::StringFormat f; f.SetFormatFlags(G::StringFormatFlagsNoWrap);
    g.MeasureString(s.c_str(), -1, font(9.5f, true), G::PointF(0, 0), &f, &bound);
    float w = bound.Width + 6, x0 = right ? x - w + 4 : x - 4;
    G::SolidBrush bg(rgb(0x0c0f13, 200)); g.FillRectangle(&bg, x0, y - 11, w, 14.f);
    text(g, s, R{x0 + 1, y - 11, w, 14}, 9.5f, true, c, 0);
  }

  // ---------------------------------------------------------------- paint
  void paint() {
    PAINTSTRUCT ps; HDC hdc = BeginPaint(hwnd, &ps);
    RECT cr; GetClientRect(hwnd, &cr);
    int W = cr.right, H = cr.bottom;
    if (W <= 0 || H <= 0) { EndPaint(hwnd, &ps); return; }
    if (!memDC || W != bufW || H != bufH) {
      freeBuffer();
      memDC = CreateCompatibleDC(hdc);
      memBmp = CreateCompatibleBitmap(hdc, W, H);
      oldBmp = (HBITMAP)SelectObject(memDC, memBmp);
      bufW = W; bufH = H;
      ps.rcPaint = cr;
    }
    {
      G::Graphics g(memDC);
      g.SetClip(G::Rect(ps.rcPaint.left, ps.rcPaint.top, ps.rcPaint.right - ps.rcPaint.left, ps.rcPaint.bottom - ps.rcPaint.top));
      g.SetSmoothingMode(G::SmoothingModeAntiAlias);
      g.SetTextRenderingHint(G::TextRenderingHintAntiAlias);   // no grid fitting: even letter spacing at small sizes
      g.SetPixelOffsetMode(G::PixelOffsetModeHalf);
      float s = (float)scale();
      g.ScaleTransform(s, s);
      R dirty{ps.rcPaint.left / s - 1, ps.rcPaint.top / s - 1, (ps.rcPaint.right - ps.rcPaint.left) / s + 2, (ps.rcPaint.bottom - ps.rcPaint.top) / s + 2};
      // device background
      G::LinearGradientBrush bg(G::PointF(0, 0), G::PointF(0, kDeviceH), rgb(0x1a1d23), rgb(0x13161b));
      g.FillRectangle(&bg, dirty.x, dirty.y, dirty.w, dirty.h);
      for (int si = 0; si < kNumSections; si++) {
        const SectionDef& sd = kSections[si];
        if (sd.mode >= 0 && sd.mode != mode) continue;
        R r{sd.x, sd.y, sd.w, sd.h};
        if (!r.hits(dirty) || sd.title[0] == 0) continue;
        G::LinearGradientBrush cb(G::PointF(0, r.y), G::PointF(0, r.y + r.h), rgb(0x1f242c), rgb(0x1a1e25));
        fillRR(g, r, 10, cb);
        strokeRR(g, R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, 10, rgb(0x2b313b));
        std::string t = sd.title; size_t dot = t.find(" \xC2\xB7 ");
        if (dot != std::string::npos) {
          std::wstring a = toW(t.substr(0, dot)), b = toW(t.substr(dot));
          G::RectF bound; G::StringFormat f; f.SetFormatFlags(G::StringFormatFlagsNoWrap);
          g.MeasureString(a.c_str(), -1, font(10.5f, true), G::PointF(0, 0), &f, &bound);
          text(g, a, R{r.x + 12, r.y + 4, 300, 16}, 10.5f, true, rgb(accent()), 0);
          text(g, b, R{r.x + 12 + bound.Width - 3, r.y + 4, 400, 16}, 10.5f, true, rgb(kDim), 0);
        } else text(g, toW(t), R{r.x + 12, r.y + 4, 300, 16}, 10.5f, true, rgb(kDim), 0);
      }
      for (size_t k = 0; k < items.size(); k++) {
        const Item& it = items[k];
        if (!visible(it) || !it.r.hits(dirty)) continue;
        drawItem(g, (int)k);
      }
      // value bubble for small knobs and drawbars
      int b = drag >= 0 ? drag : hover;
      if (b >= 0 && visible(items[b]) && (items[b].w->type == W_KNOBS || items[b].w->type == W_DRAWBAR)) drawBubble(g, items[b]);
    }
    BitBlt(hdc, ps.rcPaint.left, ps.rcPaint.top, ps.rcPaint.right - ps.rcPaint.left, ps.rcPaint.bottom - ps.rcPaint.top, memDC, ps.rcPaint.left, ps.rcPaint.top, SRCCOPY);
    EndPaint(hwnd, &ps);
  }

  void drawBubble(G::Graphics& g, const Item& it) {
    const ParamDef& p = kParams[it.w->param];
    std::wstring s = toW(std::string(it.w->type == W_DRAWBAR ? "Band " : "") + (it.w->type == W_DRAWBAR ? std::string(p.shortName) + " level" : p.name) + ": " + formatValue(p, plainOf(it.w->param)));
    G::RectF bound; G::StringFormat f; f.SetFormatFlags(G::StringFormatFlagsNoWrap);
    g.MeasureString(s.c_str(), -1, font(11, false), G::PointF(0, 0), &f, &bound);
    float w = bound.Width + 12, x = it.r.x + it.r.w / 2 - w / 2;
    x = std::max(4.0f, std::min(kDeviceW - w - 4, x));
    R r{x, it.r.y - 26, w, 20};
    G::SolidBrush b(rgb(0x0b0d10, 240)); fillRR(g, r, 5, b); strokeRR(g, r, 5, rgb(0x343b47));
    text(g, s, r, 11, false, rgb(kText));
  }

  void drawItem(G::Graphics& g, int idx) {
    const Item& it = items[idx];
    switch (it.w->type) {
      case W_KNOBL: case W_KNOBM: case W_KNOBS: case W_KNOBT: drawKnob(g, idx); break;
      case W_SEG: drawSeg(g, it); break;
      case W_STEP: drawStep(g, it); break;
      case W_DRAWBAR: drawDrawbar(g, idx); break;
      case W_SCOPE: screen(g, it.r); drawScope(g, it.r); break;
      case W_SCALOGRAM: screen(g, it.r); drawScalogram(g, it.r); break;
      case W_ATOM: screen(g, it.r); drawAtom(g, it.r); break;
      case W_SOURCE: screen(g, it.r); drawSource(g, it.r); break;
      case W_WINDOW: screen(g, it.r); drawWindow(g, it.r); break;
      case W_ADSR: screen(g, it.r); drawAdsr(g, it); break;
      case W_LEDS: drawLeds(g, it.r); break;
      case W_FXHEADS: drawFxHeads(g, it.r); break;
      case W_KEYBOARD: drawKeyboard(g, it.r); break;
      case W_WHEELS: drawWheels(g, it.r); break;
      case W_LOGO: drawLogo(g, it.r); break;
      case W_PRESETS: drawPresets(g, it.r); break;
      case W_MANUALA: case W_MANUALB: drawManualBtn(g, it); break;
      case W_METER: drawMeter(g, it.r); break;
      case W_ZOOM: drawZoom(g, it.r); break;
      case W_CREDIT: text(g, toW(std::string(kAppCredit) + " \xC2\xB7 " + kAppVersion + " \xC2\xB7 " + kAppLicense), it.r, 9.5f, false, rgb(kFaint), 2); break;
      default: break;
    }
  }

  // angle 0 = 12 o'clock, clockwise, radians -> GDI+ degrees (0 = 3 o'clock, clockwise)
  static float gdiDeg(double a) { return (float)(a * 180 / PI - 90); }

  bool disabledParam(int id) {
    if (id == P_A_WIDTH) { int w = (int)jsRound(plainOf(P_A_WAVE)); return !(w == 2 || w == 3); }
    if (id == P_B_SEED) return (int)jsRound(plainOf(P_B_PATTERN)) != 5;
    return false;
  }

  void drawKnob(G::Graphics& g, int idx) {
    const Item& it = items[idx];
    const ParamDef& p = kParams[it.w->param];
    bool big = it.w->type == W_KNOBL, small = it.w->type == W_KNOBS, tiny = it.w->type == W_KNOBT;
    float d = big ? 56.f : small ? 30.f : tiny ? 26.f : 38.f, cx = it.r.x + it.r.w / 2, cy = it.r.y + (big ? 32.f : small ? 18.f : tiny ? 15.f : 20.f), r = d / 2;
    float ar = r + (small || tiny ? 2.f : 4.f), sw = small || tiny ? 2.5f : 3.f;
    int alpha = disabledParam(it.w->param) ? 90 : 255;
    double v = plainOf(it.w->param), n = toNorm(p, v);
    const double A0 = -0.75 * PI, A1 = 0.75 * PI, a = A0 + (A1 - A0) * n;
    G::Pen track(rgb(0x2a303a, alpha), sw); track.SetStartCap(G::LineCapRound); track.SetEndCap(G::LineCapRound);
    g.DrawArc(&track, cx - ar, cy - ar, 2 * ar, 2 * ar, gdiDeg(A0), 270);
    bool bip = p.min < 0 && p.max > 0;
    double from = bip ? A0 + (A1 - A0) * toNorm(p, 0) : A0;
    double lo = std::min(from, a), hi = std::max(from, a);
    if (hi - lo > 1e-3) {
      G::Pen val(rgb(accent(), alpha), sw); val.SetStartCap(G::LineCapRound); val.SetEndCap(G::LineCapRound);
      g.DrawArc(&val, cx - ar, cy - ar, 2 * ar, 2 * ar, gdiDeg(lo), (float)((hi - lo) * 180 / PI));
    }
    G::LinearGradientBrush body(G::PointF(cx - r, cy - r), G::PointF(cx + r, cy + r), rgb(0x3a414c, alpha), rgb(0x161a1f, alpha));
    g.FillEllipse(&body, cx - r + 1, cy - r + 1, 2 * r - 2, 2 * r - 2);
    G::Pen edge(rgb(0x0b0d10, alpha), 1.5f); g.DrawEllipse(&edge, cx - r + 1, cy - r + 1, 2 * r - 2, 2 * r - 2);
    G::Pen ring(G::Color(alpha / 20, 255, 255, 255), 1); g.DrawEllipse(&ring, cx - r + 4, cy - r + 4, 2 * r - 8, 2 * r - 8);
    G::Pen ptr(rgb(0xeef2f7, alpha), big ? 3.f : tiny ? 2.f : 2.2f); ptr.SetStartCap(G::LineCapRound); ptr.SetEndCap(G::LineCapRound);
    float r0 = r * 0.25f, r1 = r - 4;
    g.DrawLine(&ptr, cx + r0 * (float)std::sin(a), cy - r0 * (float)std::cos(a), cx + r1 * (float)std::sin(a), cy - r1 * (float)std::cos(a));
    if (!small) {
      bool showVal = (hover == idx || drag == idx);
      std::wstring s = showVal ? toW(formatValue(p, v)) : toW(p.shortName);
      R lr{it.r.x - 8, it.r.y + (big ? 68.f : tiny ? 31.f : 42.f), it.r.w + 16, 14};
      text(g, s, lr, big ? 10.5f : tiny ? 8.5f : 9.5f, true, showVal ? rgb(accent(), alpha) : rgb(kDim, alpha));
    }
  }

  void drawSeg(G::Graphics& g, const Item& it) {
    const ParamDef& p = kParams[it.w->param];
    bool engine = it.w->style == 1;
    inset(g, it.r, engine ? 9.f : 7.f);
    int n = p.numChoices, cur = (int)jsRound(plainOf(it.w->param));
    float pad = engine ? 3.f : 2.f, gap = 2, bw = (it.r.w - 2 * pad - gap * (n - 1)) / n;
    for (int k = 0; k < n; k++) {
      R b{it.r.x + pad + k * (bw + gap), it.r.y + pad, bw, it.r.h - 2 * pad};
      bool on = k == cur;
      if (on) {
        uint32_t c = engine ? (k == 0 ? kAccentA : kAccentB) : accent();
        G::SolidBrush br(rgb(c)); fillRR(g, b, 5, br);
      }
      text(g, toW(p.choiceShort[k]), b, engine ? 11.f : 10.f, true, on ? rgb(0x0d1014) : rgb(kDim));
    }
  }

  void drawStep(G::Graphics& g, const Item& it) {
    const ParamDef& p = kParams[it.w->param];
    inset(g, it.r, 7);
    text(g, L"◀", R{it.r.x, it.r.y, 30, it.r.h}, 11, false, rgb(kDim));
    text(g, L"▶", R{it.r.x + it.r.w - 30, it.r.y, 30, it.r.h}, 11, false, rgb(kDim));
    int v = (int)jsRound(plainOf(it.w->param));
    std::wstring name = toW(p.choices[v]);
    if (it.w->w >= 200) {
      text(g, toW(p.shortName), R{it.r.x + 30, it.r.y, 80, it.r.h}, 9.5f, true, rgb(kFaint), 1);
      text(g, name, R{it.r.x + 90, it.r.y, it.r.w - 130, it.r.h}, 12, true, rgb(kText), 1);
    } else text(g, name, R{it.r.x + 28, it.r.y, it.r.w - 56, it.r.h}, 12, true, rgb(kText), 1);
  }

  void drawDrawbar(G::Graphics& g, int idx) {
    const Item& it = items[idx];
    double v = plainOf(it.w->param);
    R tr{it.r.x + 7, it.r.y, it.r.w - 14, it.r.h};
    G::SolidBrush ib(rgb(kInset)); fillRR(g, tr, 5, ib);
    float fh = (float)(v * tr.h);
    if (fh > 0.5f) {
      G::LinearGradientBrush fb(G::PointF(0, tr.y + tr.h - fh - 1), G::PointF(0, tr.y + tr.h + 1), rgb(accent(), 220), rgb(0xffae42, 90));
      g.FillRectangle(&fb, tr.x + 1, tr.y + tr.h - fh, tr.w - 2, fh);
    }
    strokeRR(g, tr, 5, rgb(kInsetEdge));
    float cy = it.r.y + (float)((1 - v) * (it.r.h - 10));
    G::LinearGradientBrush cap(G::PointF(0, cy), G::PointF(0, cy + 10), rgb(0xf1f4f8), rgb(0xb9c1cc));
    fillRR(g, R{it.r.x, cy, it.r.w, 10}, 3, cap);
    bool hot = hover == idx || drag == idx;
    text(g, toW(kParams[it.w->param].shortName), R{it.r.x - 4, it.r.y + it.r.h + 2, it.r.w + 8, 14}, 9.5f, true, hot ? rgb(accent()) : rgb(kDim));
  }

  void gainsForDisplay(double* g, double& c, double& w, double& d, int& note) {
    if (liveNote >= 0 && liveMode == mode && host->sharedState()) {
      for (int b = 0; b < NB; b++) g[b] = liveGains[b];
      c = liveC; w = liveW; d = liveD; note = liveNote; return;
    }
    double v[kNumParams]; currentParams(v);
    staticGains(v, g); c = v[P_P_CENTER]; w = v[P_P_WIDTH]; d = v[P_P_DEPTH]; note = -1;
  }

  void polyline(G::Graphics& g, const double* arr, R r, double sy, G::Color c, float width, bool glow) {
    int W = (int)r.w;
    std::vector<G::PointF> pts(W + 1);
    for (int x = 0; x <= W; x++) {
      int i = std::min(N - 1, (int)((double)x / W * N));
      pts[x] = G::PointF(r.x + x, (float)(r.y + r.h / 2 - arr[i] * sy));
    }
    if (glow) { G::Pen gp(G::Color(60, c.GetR(), c.GetG(), c.GetB()), width + 4); gp.SetLineJoin(G::LineJoinRound); g.DrawLines(&gp, pts.data(), (int)pts.size()); }
    G::Pen pen(c, width); pen.SetLineJoin(G::LineJoinRound);
    g.DrawLines(&pen, pts.data(), (int)pts.size());
  }

  void drawScope(G::Graphics& g, R r) {
    G::Pen grid(G::Color(13, 255, 255, 255), 1);
    for (int k = 1; k < 4; k++) g.DrawLine(&grid, r.x + r.w * k / 4, r.y + 4, r.x + r.w * k / 4, r.y + r.h - 4);
    G::Pen zero(G::Color(23, 255, 255, 255), 1); g.DrawLine(&zero, r.x, r.y + r.h / 2, r.x + r.w, r.y + r.h / 2);
    if (disp.mode != mode) return;
    double gains[NB], c, w, d; int note;
    gainsForDisplay(gains, c, w, d, note);
    std::vector<double> y(N);
    displayCycle(disp, gains, c, w, d, y.data());
    const double* ghost = disp.mode == 0 ? disp.layer(DRY) : nullptr;
    double peak = 0.25;
    for (int i = 0; i < N; i++) { peak = std::max(peak, std::fabs(y[i])); if (ghost) peak = std::max(peak, std::fabs(ghost[i])); }
    double sy = (r.h / 2 - 8) / peak;
    if (d > 0) {
      for (int x = 0; x < (int)r.w; x += 2) {
        double wv = windowValue(x / r.w, c, w, 1);
        if (wv > 0.01) { G::SolidBrush b(rgb(accent(), (int)(26 * wv * d))); g.FillRectangle(&b, r.x + x, r.y + 1, 2.f, r.h - 2); }
      }
    }
    if (ghost) polyline(g, ghost, r, sy, G::Color(46, 200, 210, 225), 1.2f, false);
    polyline(g, y.data(), r, sy, rgb(accent()), 2, true);
    pill(g, disp.mode == 0 ? L"ONE CYCLE · DRY (GREY) vs FILTERED" : L"ONE CYCLE · SUM OF ATOM BANDS", r.x + 8, r.y + 14, false, rgb(0xc8d2e1, 160));
    if (note >= 0) pill(g, noteName(note) + L" · LIVE", r.x + r.w - 8, r.y + 14, true, rgb(accent()));
  }

  void drawScalogram(G::Graphics& g, R r) {
    const float lm = 26, pw = r.w - lm - 4, rh = (r.h - 6) / NB, top = r.y + 3;
    for (int b = 1; b <= NB; b++)
      text(g, L"B" + std::to_wstring(b), R{r.x, top + (NB - b) * rh, lm - 4, rh}, 8.5f, true, G::Color(102, 200, 210, 225), 2);
    if (disp.mode != mode) return;
    double gains[NB], c, w, d; int note;
    gainsForDisplay(gains, c, w, d, note);
    int PW = (int)pw;
    G::Bitmap bmp(PW, NB, PixelFormat32bppARGB);
    G::BitmapData bd; G::Rect lr(0, 0, PW, NB);
    bmp.LockBits(&lr, G::ImageLockModeWrite, PixelFormat32bppARGB, &bd);
    uint32_t ac = accent(); int ar = (ac >> 16) & 255, ag = (ac >> 8) & 255, ab = ac & 255;
    const double sq = 1 / std::sqrt((double)N);
    for (int b = 1; b <= NB; b++) {
      int n = 1 << (b - 1);
      uint32_t* row = (uint32_t*)((uint8_t*)bd.Scan0 + (NB - b) * bd.Stride);
      double sc = disp.bandScale[b - 1] * std::pow(2.0, (b - 1) / 2.0) * sq * std::fabs(gains[b - 1]);
      for (int x = 0; x < PW; x++) {
        int k0 = (int)((double)x / PW * n), k1 = std::max(k0 + 1, (int)((double)(x + 1) / PW * n));
        double t = 0;
        for (int k = k0; k < k1 && k < n; k++) {
          double v = std::fabs(disp.coeffs[n + k]) * sc;
          if (v > 0) t = std::max(t, std::min(1.0, std::max(0.0, (20 * std::log10(v) + 60) / 60)));
        }
        bool gapCol = (double)PW / n >= 4 && (int)((double)(x + 1) / PW * n) != k0;
        uint32_t col = 0;
        if (t > 0 && !gapCol) {
          int R0, G0, B0;
          if (t < 0.75) { double kk = t / 0.75; R0 = (int)(18 + (ar - 18) * kk); G0 = (int)(22 + (ag - 22) * kk); B0 = (int)(28 + (ab - 28) * kk); }
          else { double kk = (t - 0.75) / 0.25; R0 = (int)(ar + (255 - ar) * kk); G0 = (int)(ag + (255 - ag) * kk); B0 = (int)(ab + (255 - ab) * kk); }
          col = 0xff000000u | (R0 << 16) | (G0 << 8) | B0;
        }
        row[x] = col;
      }
    }
    bmp.UnlockBits(&bd);
    auto im = g.GetInterpolationMode(); auto po = g.GetPixelOffsetMode();
    g.SetInterpolationMode(G::InterpolationModeNearestNeighbor); g.SetPixelOffsetMode(G::PixelOffsetModeHalf);
    g.DrawImage(&bmp, G::RectF(r.x + lm, top, (float)PW, rh * NB), 0, 0, (float)PW, (float)NB, G::UnitPixel);
    g.SetInterpolationMode(im); g.SetPixelOffsetMode(po);
    G::Pen sep(rgb(0x0c0f13), 1);
    for (int b = 1; b < NB; b++) g.DrawLine(&sep, r.x + lm, top + b * rh, r.x + lm + PW, top + b * rh);
    if (d > 0) {
      std::vector<G::PointF> pts;
      for (int x = 0; x <= PW; x += 2) pts.push_back(G::PointF(r.x + lm + x, (float)(top + (1 - windowValue((double)x / PW, c, w, d)) * (r.h - 6))));
      G::Pen dash(G::Color(140, 255, 255, 255), 1); dash.SetDashStyle(G::DashStyleDash);
      g.DrawLines(&dash, pts.data(), (int)pts.size());
    }
  }

  void drawAtom(G::Graphics& g, R r) {
    int wi = (int)jsRound(plainOf(P_WAVELET));
    if (!atoms.count(wi)) atoms[wi] = atomShape(wi);
    const Atom& a = atoms[wi];
    double span = a.hi - a.lo + 1, margin = std::max(4.0, span * 0.15), lo = a.lo - margin, hi = a.hi + margin;
    double peak = 1e-9; for (int i = a.lo; i <= a.hi; i++) peak = std::max(peak, std::fabs(a.x[i]));
    double sy = (r.h / 2 - 16) / peak, mid = r.y + r.h / 2 + 6;
    G::Pen zl(G::Color(20, 255, 255, 255), 1); g.DrawLine(&zl, r.x, (float)mid, r.x + r.w, (float)mid);
    std::vector<G::PointF> pts; pts.push_back(G::PointF(r.x, (float)mid));
    for (int x = 0; x <= (int)r.w; x++) {
      int i = (int)std::lround(lo + x * (hi - lo) / r.w);
      double v = (i >= a.lo && i <= a.hi) ? a.x[i] : 0;
      pts.push_back(G::PointF(r.x + x, (float)(mid - v * sy)));
    }
    pts.push_back(G::PointF(r.x + r.w, (float)mid));
    G::SolidBrush fill(rgb(accent(), 36)); g.FillPolygon(&fill, pts.data(), (int)pts.size());
    G::Pen glow(rgb(accent(), 60), 5); g.DrawLines(&glow, pts.data() + 1, (int)pts.size() - 2);
    G::Pen pen(rgb(accent()), 2); g.DrawLines(&pen, pts.data() + 1, (int)pts.size() - 2);
    text(g, L"ψ  ATOM SHAPE", R{r.x + 8, r.y + 4, 150, 14}, 9.5f, true, G::Color(128, 200, 210, 225), 0);
    text(g, std::to_wstring(filter(wi).L) + L" TAPS", R{r.x + r.w - 108, r.y + 4, 100, 14}, 9.5f, true, G::Color(128, 200, 210, 225), 2);
  }

  void drawSource(G::Graphics& g, R r) {
    if (disp.mode != 0) return;
    std::vector<double> raw(N);
    sourceCycle((int)jsRound(plainOf(P_A_WAVE)), plainOf(P_A_WIDTH), raw.data());
    const double* dry = disp.layer(DRY);
    double peak = 1; for (int i = 0; i < N; i++) peak = std::max(peak, std::fabs(dry[i]));
    double sy = (r.h / 2 - 8) / peak;
    polyline(g, raw.data(), r, sy, G::Color(51, 200, 210, 225), 1.2f, false);
    polyline(g, dry, r, sy, rgb(accent()), 1.8f, false);
    pill(g, L"SOURCE CYCLE", r.x + 7, r.y + 13, false, G::Color(153, 200, 210, 225));
    pill(g, std::to_wstring(disp.kept) + L" / " + std::to_wstring(disp.nonzero) + L" ATOMS KEPT", r.x + r.w - 7, r.y + r.h - 5, true, rgb(accent()));
  }

  void drawWindow(G::Graphics& g, R r) {
    double gains[NB], c, w, d; int note;
    gainsForDisplay(gains, c, w, d, note);
    G::Pen base(G::Color(15, 255, 255, 255), 1); g.DrawLine(&base, r.x, r.y + r.h - 4.5f, r.x + r.w, r.y + r.h - 4.5f);
    if (d <= 0) { text(g, L"WINDOW OFF · RAISE DEPTH", r, 9, true, G::Color(90, 200, 210, 225)); return; }
    std::vector<G::PointF> pts;
    for (int x = 0; x <= (int)r.w; x++) pts.push_back(G::PointF(r.x + x, (float)(r.y + r.h - 4 - windowValue(x / r.w, c, w, d) * (r.h - 8))));
    G::Pen pen(rgb(accent()), 1.6f); g.DrawLines(&pen, pts.data(), (int)pts.size());
  }

  void drawAdsr(G::Graphics& g, const Item& it) {
    R r = it.r;
    int base = it.w->env == 0 ? P_AMP_A : P_MOD_A;
    double a = plainOf(base), d = plainOf(base + 1), s = plainOf(base + 2), rl = plainOf(base + 3);
    auto f = [](double t) { return 0.06 + std::log10(1 + t * 100) / std::log10(1001.0); };
    double wa = f(a), wd = f(d), wr = f(rl), hold = 0.35, tot = wa + wd + hold + wr;
    auto X = [&](double v) { return (float)(r.x + 4 + v / tot * (r.w - 8)); };
    auto Y = [&](double v) { return (float)(r.y + r.h - 4 - v * (r.h - 8)); };
    std::vector<G::PointF> pts;
    pts.push_back(G::PointF(X(0), Y(0))); pts.push_back(G::PointF(X(wa), Y(1)));
    for (int k = 1; k <= 16; k++) { double t = k / 16.0; pts.push_back(G::PointF(X(wa + wd * t), Y(s + (1 - s) * std::pow(0.001, t)))); }
    pts.push_back(G::PointF(X(wa + wd + hold), Y(s)));
    for (int k = 1; k <= 16; k++) { double t = k / 16.0; pts.push_back(G::PointF(X(wa + wd + hold + wr * t), Y(s * std::pow(0.001, t)))); }
    std::vector<G::PointF> poly = pts; poly.push_back(G::PointF(X(tot), Y(0)));
    G::SolidBrush fill(rgb(accent(), 33)); g.FillPolygon(&fill, poly.data(), (int)poly.size());
    G::Pen pen(rgb(accent()), 1.6f); g.DrawLines(&pen, pts.data(), (int)pts.size());
  }

  void drawLeds(G::Graphics& g, R r) {
    int maxV = (int)jsRound(plainOf(P_V_VOICES));
    const float step = (r.w - 10) / 15;
    for (int k = 0; k < 16; k++) {
      bool on = (liveVoices >> k) & 1, avail = k < std::max(1, maxV);
      float x = r.x + 5 + k * step, y = r.y + 8.5f;
      if (on) { G::SolidBrush gb(rgb(accent(), 70)); g.FillEllipse(&gb, x - 7, y - 7, 14.f, 14.f); }
      G::SolidBrush b(on ? rgb(accent()) : avail ? rgb(0x2a303a) : rgb(0x1a1e24));
      g.FillEllipse(&b, x - 4, y - 4, 8.f, 8.f);
    }
  }

  void drawFxHeads(G::Graphics& g, R r) {
    struct H { const wchar_t* t; float x, w; } hs[] = {{L"SATURATION", 26, 52}, {L"PING-PONG DELAY", 78, 156}, {L"REVERB", 234, 104}};
    G::Pen ln(G::Color(20, 255, 255, 255), 1);
    for (auto& h : hs) {
      text(g, h.t, R{r.x + h.x, r.y, h.w, 16}, 9, true, G::Color(107, 200, 210, 225));
      g.DrawLine(&ln, r.x + h.x + 4, r.y + 17.5f, r.x + h.x + h.w - 4, r.y + 17.5f);
    }
  }

  bool keyDown(int n) const { return ((liveKeys[n >> 5] >> (n & 31)) & 1) || n == mouseNote; }

  void drawKeyboard(G::Graphics& g, R r) {
    std::vector<int> whites; for (int n = KB_LO; n <= KB_HI; n++) if (!isBlack(n)) whites.push_back(n);
    float ww = r.w / whites.size();
    for (size_t k = 0; k < whites.size(); k++) {
      int n = whites[k]; float x = r.x + k * ww; bool on = keyDown(n);
      G::LinearGradientBrush b(G::PointF(0, r.y), G::PointF(0, r.y + r.h), on ? rgb(accent()) : rgb(0xd9dee5), on ? rgb(0xe9fbf9) : rgb(0xf6f8fa));
      g.FillRectangle(&b, x + 0.5f, r.y, ww - 1, r.h);
      G::SolidBrush sh(G::Color(64, 0, 0, 0)); g.FillRectangle(&sh, x + 0.5f, r.y + r.h - 3, ww - 1, 3.f);
      if (n % 12 == 0) text(g, noteName(n), R{x, r.y + r.h - 22, ww, 14}, 9, true, on ? rgb(0x0d1014) : rgb(0x7a8594));
    }
    for (int n = KB_LO; n <= KB_HI; n++) {
      if (!isBlack(n)) continue;
      int k = (int)(std::find(whites.begin(), whites.end(), n - 1) - whites.begin());
      float x = r.x + (k + 1) * ww - ww * 0.31f, bw = ww * 0.62f, bh = r.h * 0.6f; bool on = keyDown(n);
      G::LinearGradientBrush b(G::PointF(0, r.y), G::PointF(0, r.y + bh), on ? rgb(accent()) : rgb(0x262b33), on ? rgb(0x0f5a54) : rgb(0x0d0f12));
      g.FillRectangle(&b, x, r.y, bw, bh);
      G::SolidBrush hl(G::Color(20, 255, 255, 255)); g.FillRectangle(&hl, x + 2, r.y + bh - 5, bw - 4, 3.f);
    }
  }

  int keyAt(R r, float px, float py, double& vel) {
    std::vector<int> whites; for (int n = KB_LO; n <= KB_HI; n++) if (!isBlack(n)) whites.push_back(n);
    float ww = r.w / whites.size(), lx = px - r.x, ly = py - r.y;
    if (ly < r.h * 0.6f) {
      for (int n = KB_LO; n <= KB_HI; n++) {
        if (!isBlack(n)) continue;
        int k = (int)(std::find(whites.begin(), whites.end(), n - 1) - whites.begin());
        float x = (k + 1) * ww - ww * 0.31f;
        if (lx >= x && lx <= x + ww * 0.62f) { vel = std::min(1.0, std::max(0.1, 0.35 + 0.65 * ly / (r.h * 0.6))); return n; }
      }
    }
    int k = std::max(0, std::min((int)whites.size() - 1, (int)(lx / ww)));
    vel = std::min(1.0, std::max(0.1, 0.35 + 0.65 * ly / r.h));
    return whites[k];
  }

  void drawWheels(G::Graphics& g, R r) {
    double bend = plainOf(P_BEND), mod = plainOf(P_MODWHEEL);
    struct Wh { float x; double v; const wchar_t* lab; bool center; } ws2[] = {{r.x, (bend + 1) / 2, L"PITCH", true}, {r.x + r.w - 24, mod, L"MOD", false}};
    for (auto& w : ws2) {
      float h = r.h - 14;
      G::LinearGradientBrush b(G::PointF(w.x, 0), G::PointF(w.x + 24, 0), rgb(0x0b0d10), rgb(0x1c2128));
      g.FillRectangle(&b, w.x, r.y, 24.f, h);
      G::Pen rib(G::Color(13, 255, 255, 255), 1);
      for (float y = 4; y < h; y += 5) g.DrawLine(&rib, w.x + 3, r.y + y, w.x + 21, r.y + y);
      if (w.center) { G::SolidBrush c(G::Color(46, 255, 255, 255)); g.FillRectangle(&c, w.x, r.y + h / 2 - 0.5f, 24.f, 1.f); }
      float yy = r.y + (float)((1 - w.v) * (h - 8) + 4);
      G::SolidBrush gl(rgb(accent(), 70)); g.FillRectangle(&gl, w.x, yy - 4, 24.f, 8.f);
      G::SolidBrush a(rgb(accent())); g.FillRectangle(&a, w.x + 2, yy - 2, 20.f, 4.f);
      text(g, w.lab, R{w.x - 6, r.y + r.h - 12, 36, 12}, 8, true, G::Color(115, 200, 210, 225));
    }
  }

  void drawLogo(G::Graphics& g, R r) {
    R m{r.x, r.y + 1, 30, 30};
    G::SolidBrush ib(rgb(kInset)); fillRR(g, m, 8, ib); strokeRR(g, m, 8, rgb(0x2a303a));
    G::PointF pts[] = {{m.x + 3, m.y + 15}, {m.x + 8, m.y + 15}, {m.x + 11, m.y + 7}, {m.x + 15, m.y + 23}, {m.x + 19, m.y + 11}, {m.x + 22, m.y + 17}, {m.x + 27, m.y + 17}};
    G::Pen pen(rgb(accent()), 2.2f); pen.SetLineJoin(G::LineJoinRound); pen.SetStartCap(G::LineCapRound); pen.SetEndCap(G::LineCapRound);
    g.DrawLines(&pen, pts, 7);
    text(g, L"WAVELET", R{r.x + 40, r.y + 1, 160, 18}, 13.5f, true, rgb(0xeef2f7), 0);
    text(g, L"SYNTHESIZER", R{r.x + 40, r.y + 17, 160, 14}, 9, true, rgb(accent()), 0);
  }

  void drawPresets(G::Graphics& g, R r) {
    inset(g, r, 8);
    text(g, L"◀", R{r.x, r.y, 30, r.h}, 11, false, rgb(kDim));
    text(g, L"▶", R{r.x + r.w - 30, r.y, 30, r.h}, 11, false, rgb(kDim));
    int pi = host->presetIndex();
    std::wstring name = pi >= 0 && pi < kNumPresets ? toW(kPresets[pi].name) : L"User sound";
    if (host->presetDirty()) name += L"  •";
    text(g, name + L"  ▾", R{r.x + 30, r.y, r.w - 60, r.h}, 12.5f, true, rgb(0xeef2f7));
  }

  void drawManualBtn(G::Graphics& g, const Item& it) {
    bool b = it.w->type == W_MANUALB;
    inset(g, it.r, 8);
    text(g, L"MANUAL", R{it.r.x, it.r.y + 3, it.r.w, 12}, 9.5f, true, rgb(kDim));
    text(g, b ? L"B" : L"A", R{it.r.x, it.r.y + 14, it.r.w, 14}, 12, true, rgb(b ? kAccentB : kAccentA));
  }

  void drawMeter(G::Graphics& g, R r) {
    float bw = (r.w - 2) / 2;
    float lv[2] = {meterL, meterR};
    for (int k = 0; k < 2; k++) {
      float x = r.x + k * (bw + 2);
      G::SolidBrush bg(rgb(0x0c0f13)); g.FillRectangle(&bg, x, r.y, bw, r.h);
      double db = 20 * std::log10(lv[k] + 1e-9), t = std::min(1.0, std::max(0.0, (db + 48) / 48));
      float h = (float)(t * r.h);
      if (h > 0.5f) {
        G::LinearGradientBrush gb(G::PointF(0, r.y + r.h), G::PointF(0, r.y), rgb(0x2fd4c6), rgb(0xff5d5d));
        g.FillRectangle(&gb, x, r.y + r.h - h, bw, h);
      }
    }
  }

  void drawZoom(G::Graphics& g, R r) {
    inset(g, r, 5);
    text(g, std::to_wstring((int)std::lround(host->zoom() * 100)) + L"%", r, 9.5f, true, rgb(kDim));
  }

  // ---------------------------------------------------------------- interaction
  int hit(float x, float y) {
    for (int k = (int)items.size() - 1; k >= 0; k--) if (visible(items[k]) && items[k].r.has(x, y)) return k;
    return -1;
  }
  void logical(LPARAM lp, float& x, float& y) { double s = scale(); x = (float)(GET_X_LPARAM(lp) / s); y = (float)(GET_Y_LPARAM(lp) / s); }
  void setPlain(int id, double v) { host->performEditPlain(id, v); }
  void gesture(int id, double v) { host->setPlainGesture(id, v); onTimer(); }
  void noteOn(int n, double vel) { auto sh = host->sharedState(); if (sh) sh->push(SharedState::Ev{(int16_t)n, (int16_t)std::max(1, (int)std::lround(vel * 127))}); }
  void noteOff(int n) { auto sh = host->sharedState(); if (sh) sh->push(SharedState::Ev{(int16_t)n, 0}); }

  void wheelOn(int idx, int dir) {
    const Item& it = items[idx];
    int id = it.w->param;
    if (id < 0 || !(it.w->type == W_KNOBL || it.w->type == W_KNOBM || it.w->type == W_KNOBS || it.w->type == W_KNOBT || it.w->type == W_DRAWBAR || it.w->type == W_SEG || it.w->type == W_STEP)) return;
    const ParamDef& p = kParams[id];
    double cur = plainOf(id), v;
    if (p.curve == CURVE_INT || p.curve == CURVE_CHOICE) v = std::min(p.max, std::max(p.min, jsRound(cur) + dir));
    else v = toPlain(p, std::min(1.0, std::max(0.0, toNorm(p, cur) + dir * ((GetKeyState(VK_SHIFT) & 0x8000) ? 0.002 : 0.01))));
    gesture(id, v);
  }

  void mouseDown(float x, float y, bool dbl) {
    int idx = hit(x, y);
    if (idx < 0) return;
    const Item& it = items[idx];
    const WidgetDef& w = *it.w;
    bool ctrl = (GetKeyState(VK_CONTROL) & 0x8000) != 0;
    switch (w.type) {
      case W_KNOBL: case W_KNOBM: case W_KNOBS: case W_KNOBT: case W_DRAWBAR: {
        const ParamDef& p = kParams[w.param];
        if (dbl || ctrl) { gesture(w.param, p.def); return; }
        drag = idx; dragY = y; dragNorm = toNorm(p, plainOf(w.param)); dragShift = (GetKeyState(VK_SHIFT) & 0x8000) != 0;
        host->beginEdit(w.param);
        SetCapture(hwnd);
        invalidateItem(idx);
        return;
      }
      case W_SEG: {
        const ParamDef& p = kParams[w.param];
        float pad = w.style == 1 ? 3.f : 2.f, bw = (it.r.w - 2 * pad) / p.numChoices;
        int k = std::max(0, std::min(p.numChoices - 1, (int)((x - it.r.x - pad) / bw)));
        gesture(w.param, p.min + k);
        return;
      }
      case W_STEP: {
        const ParamDef& p = kParams[w.param];
        int n = (int)(p.max - p.min + 1), cur = (int)jsRound(plainOf(w.param)) - (int)p.min;
        int d = (x < it.r.x + 30) ? -1 : 1;
        gesture(w.param, p.min + ((cur + d) % n + n) % n);
        return;
      }
      case W_PRESETS: {
        int pi = host->presetIndex();
        if (x < it.r.x + 30) host->loadPreset(((pi < 0 ? 0 : pi - 1) + kNumPresets) % kNumPresets);
        else if (x > it.r.x + it.r.w - 30) host->loadPreset((pi + 1 + kNumPresets) % kNumPresets);
        else presetMenu(it);
        onTimer(); InvalidateRect(hwnd, nullptr, FALSE);
        return;
      }
      case W_MANUALA: case W_MANUALB: openManual(w.type == W_MANUALA ? L"manual-a.html" : L"manual-b.html"); return;
      case W_ZOOM: zoomMenu(it); return;
      case W_KEYBOARD: {
        double vel; int n = keyAt(it.r, x, y, vel);
        mouseNote = n; noteOn(n, vel);
        SetCapture(hwnd); drag = idx; invalidateItem(idx);
        return;
      }
      case W_WHEELS: {
        wheelDrag = x < it.r.x + it.r.w / 2 ? 0 : 1;
        host->beginEdit(wheelDrag == 0 ? P_BEND : P_MODWHEEL);
        drag = idx; SetCapture(hwnd);
        wheelMove(it, y);
        return;
      }
      default: return;
    }
  }

  void wheelMove(const Item& it, float y) {
    float h = it.r.h - 14;
    double v = std::min(1.0, std::max(0.0, 1.0 - (double)(y - it.r.y - 4) / (h - 8)));
    if (wheelDrag == 0) setPlain(P_BEND, v * 2 - 1); else setPlain(P_MODWHEEL, v);
    invalidateItem(drag);
  }

  void mouseMove(float x, float y) {
    if (drag >= 0) {
      const Item& it = items[drag];
      if (it.w->type == W_KEYBOARD) {
        double vel; int n = keyAt(it.r, std::max(it.r.x, std::min(it.r.x + it.r.w - 1, x)), std::max(it.r.y, std::min(it.r.y + it.r.h - 1, y)), vel);
        if (n != mouseNote) { if (mouseNote >= 0) noteOff(mouseNote); mouseNote = n; noteOn(n, vel); invalidateItem(drag); }
        return;
      }
      if (it.w->type == W_WHEELS) { wheelMove(it, y); return; }
      const ParamDef& p = kParams[it.w->param];
      bool shift = (GetKeyState(VK_SHIFT) & 0x8000) != 0;
      if (shift != dragShift) { dragShift = shift; dragY = y; dragNorm = toNorm(p, plainOf(it.w->param)); return; }
      double range = it.w->type == W_DRAWBAR ? 120 : 180;
      double n = std::min(1.0, std::max(0.0, dragNorm - (y - dragY) / (shift ? range * 5 : range)));
      double v = toPlain(p, n);
      if (v != plainOf(it.w->param)) { setPlain(it.w->param, v); onTimer(); }
      return;
    }
    int h = hit(x, y);
    if (h != hover) {
      int old = hover; hover = h;
      invalidateItem(old); invalidateItem(hover);
    }
    if (!tracking) { TRACKMOUSEEVENT t{sizeof t, TME_LEAVE, hwnd, 0}; TrackMouseEvent(&t); tracking = true; }
  }

  void mouseUp() {
    if (drag < 0) return;
    const Item& it = items[drag];
    if (it.w->type == W_KEYBOARD) { if (mouseNote >= 0) noteOff(mouseNote); mouseNote = -1; }
    else if (it.w->type == W_WHEELS) {
      int id = wheelDrag == 0 ? P_BEND : P_MODWHEEL;
      if (wheelDrag == 0) setPlain(P_BEND, 0);
      host->endEdit(id); wheelDrag = -1;
    } else host->endEdit(it.w->param);
    int old = drag; drag = -1;
    ReleaseCapture();
    invalidateItem(old);
    onTimer();
  }

  void presetMenu(const Item& it) {
    HMENU m = CreatePopupMenu();
    int cur = host->presetIndex();
    for (int k = 0; k < kNumPresets; k++) {
      AppendMenuW(m, MF_STRING | (k == cur ? MF_CHECKED : 0), 100 + k, toW(kPresets[k].name).c_str());
    }
    POINT pt{(LONG)((it.r.x + 30) * scale()), (LONG)((it.r.y + it.r.h) * scale())};
    ClientToScreen(hwnd, &pt);
    int cmd = TrackPopupMenu(m, TPM_RETURNCMD | TPM_LEFTALIGN | TPM_TOPALIGN | TPM_NONOTIFY, pt.x, pt.y, 0, hwnd, nullptr);
    DestroyMenu(m);
    if (cmd >= 100 && cmd < 100 + kNumPresets) host->loadPreset(cmd - 100);
  }

  void zoomMenu(const Item& it) {
    const int z[] = {70, 80, 90, 100, 115, 130, 150};
    HMENU m = CreatePopupMenu();
    int cur = (int)std::lround(host->zoom() * 100);
    for (int k : z) AppendMenuW(m, MF_STRING | (k == cur ? MF_CHECKED : 0), k, (L"Window size " + std::to_wstring(k) + L"%").c_str());
    POINT pt{(LONG)(it.r.x * scale()), (LONG)((it.r.y + it.r.h) * scale())};
    ClientToScreen(hwnd, &pt);
    int cmd = TrackPopupMenu(m, TPM_RETURNCMD | TPM_LEFTALIGN | TPM_TOPALIGN | TPM_NONOTIFY, pt.x, pt.y, 0, hwnd, nullptr);
    DestroyMenu(m);
    if (cmd > 0 && cmd != cur) { host->setZoom(cmd / 100.0); requestResize(); }
  }

  void openManual(const wchar_t* file) {
    wchar_t path[MAX_PATH * 2] = {};
    GetModuleFileNameW(thisModule(), path, MAX_PATH * 2);
    std::wstring p = path;
    // <bundle>.vst3\Contents\x86_64-win\<name>.vst3  ->  <bundle>.vst3\Contents\Resources\manual\<file>
    for (int up = 0; up < 2; up++) { size_t s = p.find_last_of(L"\\/"); if (s != std::wstring::npos) p = p.substr(0, s); }
    std::wstring man = p + L"\\Resources\\manual\\" + file;
    if (GetFileAttributesW(man.c_str()) == INVALID_FILE_ATTRIBUTES) {
      MessageBoxW(hwnd, (L"The manual was not found:\n" + man + L"\n\nInstall the complete WaveletSynthesizer.vst3 bundle folder.").c_str(), L"Wavelet Synthesizer", MB_OK | MB_ICONINFORMATION);
      return;
    }
    ShellExecuteW(nullptr, L"open", man.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
  }

  static LRESULT CALLBACK wndProc(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    Editor* e = (Editor*)GetWindowLongPtrW(h, GWLP_USERDATA);
    if (!e) return DefWindowProcW(h, msg, wp, lp);
    float x, y;
    switch (msg) {
      case WM_PAINT: e->paint(); return 0;
      case WM_ERASEBKGND: return 1;
      case WM_SIZE: InvalidateRect(h, nullptr, FALSE); return 0;
      case WM_TIMER: e->onTimer(); return 0;
      case WM_LBUTTONDOWN: e->logical(lp, x, y); e->mouseDown(x, y, false); return 0;
      case WM_LBUTTONDBLCLK: e->logical(lp, x, y); e->mouseDown(x, y, true); return 0;
      case WM_MOUSEMOVE: e->logical(lp, x, y); e->mouseMove(x, y); return 0;
      case WM_LBUTTONUP: e->mouseUp(); return 0;
      case WM_CAPTURECHANGED: if ((HWND)lp != h) e->mouseUp(); return 0;
      case WM_MOUSELEAVE: e->tracking = false; if (e->drag < 0 && e->hover >= 0) { int o = e->hover; e->hover = -1; e->invalidateItem(o); } return 0;
      case WM_MOUSEWHEEL: {
        POINT pt{GET_X_LPARAM(lp), GET_Y_LPARAM(lp)}; ScreenToClient(h, &pt);
        double s = e->scale(); int idx = e->hit((float)(pt.x / s), (float)(pt.y / s));
        if (idx >= 0) e->wheelOn(idx, GET_WHEEL_DELTA_WPARAM(wp) > 0 ? 1 : -1);
        return 0;
      }
      default: break;
    }
    return DefWindowProcW(h, msg, wp, lp);
  }
};

IPlugView* createEditor(EditorHost* host, FUnknown* keepAlive) { return new Editor(host, keepAlive); }

}  // namespace ws
