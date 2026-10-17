// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// Plugin editor: the panel, the same on every system. It draws through editor_platform.h: a Win32 window drawn with GDI+
// (editor_win.cpp) or a Cocoa view drawn with Core Graphics (editor_mac.mm, Mac port of beta 0.3).
// Same layout as the web UI (generated from tools/spec.js).
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstring>
#include <map>
#include <string>
#include <vector>
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "common.h"
#include "bank.h"
#include "editor_platform.h"

using namespace Steinberg;

namespace ws {

// ------------------------------------------------------------------ palette
static const uint32_t kText = 0xd5dce6, kDim = 0x8792a1, kFaint = 0x566070, kInset = 0x101317, kInsetEdge = 0x262c35;
static const uint32_t kAccentA = 0x2fd4c6, kAccentB = 0xffae42;

struct Item { const WidgetDef* w; int section; R r; };

static const char* kNoteNames[] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
static std::wstring noteName(int n) { return toW(std::string(kNoteNames[n % 12]) + std::to_string(n / 12 - 1)); }
static bool isBlack(int n) { int k = n % 12; return k == 1 || k == 3 || k == 6 || k == 8 || k == 10; }
static const int KB_LO = 36, KB_HI = 96;

// where the presets file must be writable (the message of a failed save)
#ifdef _WIN32
static const wchar_t* kFolderNote = L"The presets file is kept next to the WaveletSynthesizer.vst3 folder: that folder must allow "
                                    L"writing (the VST3 system folder, C:\\Program Files\\Common Files\\VST3, needs administrator rights).";
#else
static const wchar_t* kFolderNote = L"The presets file is kept next to the WaveletSynthesizer.vst3 folder: that folder must allow "
                                    L"writing (the system folder /Library/Audio/Plug-Ins/VST3 needs administrator rights: install the "
                                    L"plug-in in your own folder, ~/Library/Audio/Plug-Ins/VST3).";
#endif

class Editor : public IPlugView, public IPlugViewContentScaleSupport, public EditorEvents {
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
    // beta 0.3: SAVE PRESET takes the right end of the preset box (left of MANUAL A); the preset browser's categories
    for (auto& it : items) if (it.w->type == W_PRESETS) it.r.w = kSaveBtn.x - 6 - it.r.x;
    buildCategories();
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
  tresult PLUGIN_API isPlatformTypeSupported(FIDString type) override { return type && std::strcmp(type, editorPlatformType()) == 0 ? kResultTrue : kResultFalse; }
  tresult PLUGIN_API attached(void* parent, FIDString type) override {
    if (!parent || isPlatformTypeSupported(type) != kResultTrue || win) return kResultFalse;
    if (!hostScale) dpiScale = windowScaleOf(parent);
    int W = pxW(), H = pxH();
    win = createEditorWindow(this, parent, W, H);
    if (!win) return kResultFalse;
    rebuildDisplay(true);
    bReveal();
    if (frame && (W != reportedW || H != reportedH)) requestResize();
    return kResultOk;
  }
  tresult PLUGIN_API removed() override { cleanup(); return kResultOk; }
  tresult PLUGIN_API onWheel(float distance) override {
    if (bHover >= 1000) browserWheel(distance > 0 ? 1 : -1);
    else if (hover >= 0) wheelOn(hover, distance > 0 ? 1 : -1);
    return kResultTrue;
  }
  tresult PLUGIN_API onKeyDown(char16, int16, int16) override { return kResultFalse; }
  tresult PLUGIN_API onKeyUp(char16, int16, int16) override { return kResultFalse; }
  tresult PLUGIN_API getSize(ViewRect* size) override {
    if (!size) return kInvalidArgument;
    if (!win && !hostScale) dpiScale = systemScale();
    reportedW = pxW(); reportedH = pxH();
    *size = ViewRect(0, 0, reportedW, reportedH);
    return kResultOk;
  }
  tresult PLUGIN_API onSize(ViewRect* r) override {
    if (!r) return kInvalidArgument;
    if (win) win->setSize(r->getWidth(), r->getHeight());
    return kResultOk;
  }
  tresult PLUGIN_API onFocus(TBool) override { return kResultOk; }
  tresult PLUGIN_API setFrame(IPlugFrame* f) override { frame = f; return kResultOk; }
  tresult PLUGIN_API canResize() override { return kResultFalse; }
  tresult PLUGIN_API checkSizeConstraint(ViewRect* r) override { if (r) *r = ViewRect(0, 0, pxW(), pxH()); return kResultTrue; }

  // IPlugViewContentScaleSupport
  tresult PLUGIN_API setContentScaleFactor(ScaleFactor f) override {
#ifdef __APPLE__
    (void)f;
    return kResultFalse;   // macOS sizes the view in points and scales them itself (Retina)
#else
    if (!(f > 0.25f && f < 8.0f)) return kResultFalse;
    hostScale = true;
    if (std::fabs(f - dpiScale) > 1e-3) { dpiScale = f; if (win) requestResize(); }
    return kResultOk;
#endif
  }

 private:
  std::atomic<uint32> refs{1};
  EditorHost* host;
  FUnknown* keepAlive;
  IPlugFrame* frame = nullptr;
  EditorWindow* win = nullptr;   // the system window while attached
  double dpiScale = 1; bool hostScale = false;
  int reportedW = 0, reportedH = 0;
  std::vector<Item> items;
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
  int hover = -1, drag = -1; float dragY = 0; double dragNorm = 0; bool dragShift = false, dragMoved = false;   // hover -2 = SAVE PRESET
  int mouseNote = -1; int wheelDrag = -1;  // 0 bend, 1 mod

  double scale() const override { return dpiScale * host->zoom(); }
  int pxW() const { return (int)std::lround((kDeviceW + (host->browserOpen() ? kBrowserW : 0)) * scale()); }   // + the browser
  int pxH() const { return (int)std::lround(kDeviceH * scale()); }
  uint32_t accent() const { return mode == 0 ? kAccentA : kAccentB; }

  void requestResize() {
    ViewRect r(0, 0, pxW(), pxH());
    reportedW = r.getWidth(); reportedH = r.getHeight();
    if (frame) frame->resizeView(this, &r);
    if (win) { win->setSize(r.getWidth(), r.getHeight()); win->invalidateAll(); }
  }

  void cleanup() {
    if (win) {
      if (mouseNote >= 0) noteOff(mouseNote);
      delete win; win = nullptr;   // the timer, the window and its drawing resources
    }
  }
  void invalidateAll() { if (win) win->invalidateAll(); }

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
    if (!win) return;
    double s = scale();
    win->invalidate((int)std::floor((r.x - 2) * s), (int)std::floor((r.y - 2) * s), (int)std::ceil((r.x + r.w + 2) * s), (int)std::ceil((r.y + r.h + 2) * s));
  }
  void invalidateType(int type) { for (auto& it : items) if (it.w->type == type) invalidateLogical(bubbleRect(it, true)); }
  void invalidateItem(int idx) { if (idx >= 0) invalidateLogical(bubbleRect(items[idx], true)); }
  R bubbleRect(const Item& it, bool withBubble) const {
    R r = it.r;
    if (withBubble && (it.w->type == W_KNOBS || it.w->type == W_DRAWBAR)) { r.x -= 60; r.w += 120; r.y -= 28; r.h += 28; }
    return r;
  }

  void timer() override { onTimer(); }
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
        if (structural || mode != oldMode) invalidateAll();
        else for (int t : {W_SCOPE, W_SCALOGRAM, W_WINDOW, W_ADSR, W_LEDS, W_WHEELS, W_PRESETS}) invalidateType(t);
      }
      invalidateType(W_PRESETS);
      if (host->browserOpen()) invalidateLogical(bCard());
    }
    // the presets file may be changed by another instance: read it again about once a second
    if (++libTick >= 30) { libTick = 0; Library::get().refresh(); }
    if (Library::get().version() != libVer) {
      libVer = Library::get().version();
      invalidateType(W_PRESETS);
      if (host->browserOpen()) invalidateLogical(bCard());
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
  void text(Canvas& g, const std::wstring& s, R r, float px, bool bold, Col c, int align = 1, bool vcenter = true) {
    g.text(s, r, px, bold, c, align, vcenter);
  }
  void fillRR(Canvas& g, R r, float rad, const Brush& b) { g.fillRR(r, rad, b); }
  void strokeRR(Canvas& g, R r, float rad, Col c, float w = 1) { g.strokeRR(r, rad, Pen(c, w)); }
  void inset(Canvas& g, R r, float rad = 7) {
    fillRR(g, r, rad, rgb(kInset)); strokeRR(g, R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, rad, rgb(kInsetEdge));
  }
  void screen(Canvas& g, R r) {
    fillRR(g, r, 7, rgb(0x0c0f13)); strokeRR(g, R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, 7, rgb(0x252b34));
  }
  void pill(Canvas& g, const std::wstring& s, float x, float y, bool right, Col c) {
    float w = g.textWidth(s, 9.5f, true) + 6, x0 = right ? x - w + 4 : x - 4;
    g.fillRect(R{x0, y - 11, w, 14.f}, rgb(0x0c0f13, 200));
    text(g, s, R{x0 + 1, y - 11, w, 14}, 9.5f, true, c, 0);
  }

  // ---------------------------------------------------------------- paint
  // the window has set its scale, clip and smoothing; dirty is the logical area to draw again
  void paint(Canvas& g, R dirty) override {
    // device background
    g.fillRect(dirty, Brush(Pt{0, 0}, Pt{0, (float)kDeviceH}, rgb(0x1a1d23), rgb(0x13161b)));
    for (int si = 0; si < kNumSections; si++) {
      const SectionDef& sd = kSections[si];
      if (sd.mode >= 0 && sd.mode != mode) continue;
      R r{sd.x, sd.y, sd.w, sd.h};
      if (!r.hits(dirty) || sd.title[0] == 0) continue;
      fillRR(g, r, 10, Brush(Pt{0, r.y}, Pt{0, r.y + r.h}, rgb(0x1f242c), rgb(0x1a1e25)));
      strokeRR(g, R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, 10, rgb(0x2b313b));
      std::string t = sd.title; size_t dot = t.find(" \xC2\xB7 ");
      if (dot != std::string::npos) {
        std::wstring a = toW(t.substr(0, dot)), b = toW(t.substr(dot));
        const float aw = g.textWidth(a, 10.5f, true);
        text(g, a, R{r.x + 12, r.y + 4, 300, 16}, 10.5f, true, rgb(accent()), 0);
        text(g, b, R{r.x + 12 + aw - 3, r.y + 4, 400, 16}, 10.5f, true, rgb(kDim), 0);
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
    drawSaveBtn(g);
    if (host->browserOpen()) drawBrowser(g);
  }

  void drawBubble(Canvas& g, const Item& it) {
    const ParamDef& p = kParams[it.w->param];
    std::wstring s = toW(std::string(it.w->type == W_DRAWBAR ? "Band " : "") + (it.w->type == W_DRAWBAR ? std::string(p.shortName) + " level" : p.name) + ": " + formatValue(p, plainOf(it.w->param)));
    float w = g.textWidth(s, 11, false) + 12, x = it.r.x + it.r.w / 2 - w / 2;
    x = std::max(4.0f, std::min(kDeviceW - w - 4, x));
    R r{x, it.r.y - 26, w, 20};
    fillRR(g, r, 5, rgb(0x0b0d10, 240)); strokeRR(g, r, 5, rgb(0x343b47));
    text(g, s, r, 11, false, rgb(kText));
  }

  void drawItem(Canvas& g, int idx) {
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
      case W_MENU: drawMenu(g, idx); break;
      case W_CREDIT: text(g, toW(std::string(kAppCredit) + " \xC2\xB7 " + kAppVersion + " \xC2\xB7 " + kAppLicense), it.r, 9.5f, false, rgb(kFaint), 2); break;
      default: break;
    }
  }

  // angle 0 = 12 o'clock, clockwise, radians -> canvas degrees (0 = 3 o'clock, clockwise)
  static float gdiDeg(double a) { return (float)(a * 180 / PI - 90); }

  bool disabledParam(int id) {
    if (id == P_A_WIDTH) { int w = (int)jsRound(plainOf(P_A_WAVE)); return !(w == 2 || w == 3); }
    if (id == P_B_SEED) return (int)jsRound(plainOf(P_B_PATTERN)) != 5;
    return false;
  }

  void drawKnob(Canvas& g, int idx) {
    const Item& it = items[idx];
    const ParamDef& p = kParams[it.w->param];
    bool big = it.w->type == W_KNOBL, small = it.w->type == W_KNOBS, tiny = it.w->type == W_KNOBT;
    float d = big ? 56.f : small ? 30.f : tiny ? 26.f : 38.f, cx = it.r.x + it.r.w / 2, cy = it.r.y + (big ? 32.f : small ? 18.f : tiny ? 15.f : 20.f), r = d / 2;
    float ar = r + (small || tiny ? 2.f : 4.f), sw = small || tiny ? 2.5f : 3.f;
    int alpha = disabledParam(it.w->param) ? 90 : 255;
    double v = plainOf(it.w->param), n = toNorm(p, v);
    const double A0 = -0.75 * PI, A1 = 0.75 * PI, a = A0 + (A1 - A0) * n;
    const R ring{cx - ar, cy - ar, 2 * ar, 2 * ar};
    g.arc(ring, gdiDeg(A0), 270, Pen(rgb(0x2a303a, alpha), sw).caps());
    bool bip = p.min < 0 && p.max > 0;
    double from = bip ? A0 + (A1 - A0) * toNorm(p, 0) : A0;
    double lo = std::min(from, a), hi = std::max(from, a);
    if (hi - lo > 1e-3) g.arc(ring, gdiDeg(lo), (float)((hi - lo) * 180 / PI), Pen(rgb(accent(), alpha), sw).caps());
    const R body{cx - r + 1, cy - r + 1, 2 * r - 2, 2 * r - 2};
    g.fillEllipse(body, Brush(Pt{cx - r, cy - r}, Pt{cx + r, cy + r}, rgb(0x3a414c, alpha), rgb(0x161a1f, alpha)));
    g.strokeEllipse(body, Pen(rgb(0x0b0d10, alpha), 1.5f));
    g.strokeEllipse(R{cx - r + 4, cy - r + 4, 2 * r - 8, 2 * r - 8}, Pen(argb(alpha / 20, 255, 255, 255), 1));
    float r0 = r * 0.25f, r1 = r - 4;
    g.line(Pt{cx + r0 * (float)std::sin(a), cy - r0 * (float)std::cos(a)}, Pt{cx + r1 * (float)std::sin(a), cy - r1 * (float)std::cos(a)},
           Pen(rgb(0xeef2f7, alpha), big ? 3.f : tiny ? 2.f : 2.2f).caps());
    if (!small) {
      bool showVal = (hover == idx || drag == idx);
      std::wstring s = showVal ? toW(formatValue(p, v)) : toW(p.shortName);
      R lr{it.r.x - 8, it.r.y + (big ? 68.f : tiny ? 31.f : 42.f), it.r.w + 16, 14};
      text(g, s, lr, big ? 10.5f : tiny ? 8.5f : 9.5f, true, showVal ? rgb(accent(), alpha) : rgb(kDim, alpha));
    }
  }

  void drawSeg(Canvas& g, const Item& it) {
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
        fillRR(g, b, 5, rgb(c));
      }
      text(g, toW(p.choiceShort[k]), b, engine ? 11.f : 10.f, true, on ? rgb(0x0d1014) : rgb(kDim));
    }
  }

  void drawStep(Canvas& g, const Item& it) {
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

  void drawDrawbar(Canvas& g, int idx) {
    const Item& it = items[idx];
    double v = plainOf(it.w->param);
    R tr{it.r.x + 7, it.r.y, it.r.w - 14, it.r.h};
    fillRR(g, tr, 5, rgb(kInset));
    float fh = (float)(v * tr.h);
    if (fh > 0.5f)
      g.fillRect(R{tr.x + 1, tr.y + tr.h - fh, tr.w - 2, fh}, Brush(Pt{0, tr.y + tr.h - fh - 1}, Pt{0, tr.y + tr.h + 1}, rgb(accent(), 220), rgb(0xffae42, 90)));
    strokeRR(g, tr, 5, rgb(kInsetEdge));
    float cy = it.r.y + (float)((1 - v) * (it.r.h - 10));
    fillRR(g, R{it.r.x, cy, it.r.w, 10}, 3, Brush(Pt{0, cy}, Pt{0, cy + 10}, rgb(0xf1f4f8), rgb(0xb9c1cc)));
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

  void polyline(Canvas& g, const double* arr, R r, double sy, Col c, float width, bool glow) {
    int W = (int)r.w;
    std::vector<Pt> pts(W + 1);
    for (int x = 0; x <= W; x++) {
      int i = std::min(N - 1, (int)((double)x / W * N));
      pts[x] = Pt{r.x + x, (float)(r.y + r.h / 2 - arr[i] * sy)};
    }
    if (glow) g.lines(pts.data(), (int)pts.size(), Pen(argb(60, c.r, c.g, c.b), width + 4).join());
    g.lines(pts.data(), (int)pts.size(), Pen(c, width).join());
  }

  void drawScope(Canvas& g, R r) {
    const Pen grid(argb(13, 255, 255, 255), 1);
    for (int k = 1; k < 4; k++) g.line(Pt{r.x + r.w * k / 4, r.y + 4}, Pt{r.x + r.w * k / 4, r.y + r.h - 4}, grid);
    g.line(Pt{r.x, r.y + r.h / 2}, Pt{r.x + r.w, r.y + r.h / 2}, Pen(argb(23, 255, 255, 255), 1));
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
        if (wv > 0.01) g.fillRect(R{r.x + x, r.y + 1, 2.f, r.h - 2}, rgb(accent(), (int)(26 * wv * d)));
      }
    }
    if (ghost) polyline(g, ghost, r, sy, argb(46, 200, 210, 225), 1.2f, false);
    polyline(g, y.data(), r, sy, rgb(accent()), 2, true);
    pill(g, disp.mode == 0 ? L"ONE CYCLE · DRY (GREY) vs FILTERED" : L"ONE CYCLE · SUM OF ATOM BANDS", r.x + 8, r.y + 14, false, rgb(0xc8d2e1, 160));
    if (note >= 0) pill(g, noteName(note) + L" · LIVE", r.x + r.w - 8, r.y + 14, true, rgb(accent()));
  }

  void drawScalogram(Canvas& g, R r) {
    const float lm = 26, pw = r.w - lm - 4, rh = (r.h - 6) / NB, top = r.y + 3;
    for (int b = 1; b <= NB; b++)
      text(g, L"B" + std::to_wstring(b), R{r.x, top + (NB - b) * rh, lm - 4, rh}, 8.5f, true, argb(102, 200, 210, 225), 2);
    if (disp.mode != mode) return;
    double gains[NB], c, w, d; int note;
    gainsForDisplay(gains, c, w, d, note);
    int PW = (int)pw;
    std::vector<uint32_t> img((size_t)PW * NB);
    uint32_t ac = accent(); int ar = (ac >> 16) & 255, ag = (ac >> 8) & 255, ab = ac & 255;
    const double sq = 1 / std::sqrt((double)N);
    for (int b = 1; b <= NB; b++) {
      int n = 1 << (b - 1);
      uint32_t* row = img.data() + (size_t)(NB - b) * PW;
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
    g.pixels(img.data(), PW, NB, R{r.x + lm, top, (float)PW, rh * NB});
    const Pen sep(rgb(0x0c0f13), 1);
    for (int b = 1; b < NB; b++) g.line(Pt{r.x + lm, top + b * rh}, Pt{r.x + lm + PW, top + b * rh}, sep);
    if (d > 0) {
      std::vector<Pt> pts;
      for (int x = 0; x <= PW; x += 2) pts.push_back(Pt{r.x + lm + x, (float)(top + (1 - windowValue((double)x / PW, c, w, d)) * (r.h - 6))});
      g.lines(pts.data(), (int)pts.size(), Pen(argb(140, 255, 255, 255), 1).dashed());
    }
  }

  void drawAtom(Canvas& g, R r) {
    int wi = (int)jsRound(plainOf(P_WAVELET));
    if (!atoms.count(wi)) atoms[wi] = atomShape(wi);
    const Atom& a = atoms[wi];
    double span = a.hi - a.lo + 1, margin = std::max(4.0, span * 0.15), lo = a.lo - margin, hi = a.hi + margin;
    double peak = 1e-9; for (int i = a.lo; i <= a.hi; i++) peak = std::max(peak, std::fabs(a.x[i]));
    double sy = (r.h / 2 - 16) / peak, mid = r.y + r.h / 2 + 6;
    g.line(Pt{r.x, (float)mid}, Pt{r.x + r.w, (float)mid}, Pen(argb(20, 255, 255, 255), 1));
    std::vector<Pt> pts; pts.push_back(Pt{r.x, (float)mid});
    for (int x = 0; x <= (int)r.w; x++) {
      int i = (int)std::lround(lo + x * (hi - lo) / r.w);
      double v = (i >= a.lo && i <= a.hi) ? a.x[i] : 0;
      pts.push_back(Pt{r.x + x, (float)(mid - v * sy)});
    }
    pts.push_back(Pt{r.x + r.w, (float)mid});
    g.fillPolygon(pts.data(), (int)pts.size(), rgb(accent(), 36));
    g.lines(pts.data() + 1, (int)pts.size() - 2, Pen(rgb(accent(), 60), 5));
    g.lines(pts.data() + 1, (int)pts.size() - 2, Pen(rgb(accent()), 2));
    text(g, L"ψ  ATOM SHAPE", R{r.x + 8, r.y + 4, 150, 14}, 9.5f, true, argb(128, 200, 210, 225), 0);
    text(g, std::to_wstring(filter(wi).L) + L" TAPS", R{r.x + r.w - 108, r.y + 4, 100, 14}, 9.5f, true, argb(128, 200, 210, 225), 2);
  }

  void drawSource(Canvas& g, R r) {
    if (disp.mode != 0) return;
    std::vector<double> raw(N);
    sourceCycle((int)jsRound(plainOf(P_A_WAVE)), plainOf(P_A_WIDTH), raw.data(), plainOf(P_A_PHASE));   // shifted by SOURCE PHASE
    const double* dry = disp.layer(DRY);
    double peak = 1; for (int i = 0; i < N; i++) peak = std::max(peak, std::fabs(dry[i]));
    double sy = (r.h / 2 - 8) / peak;
    polyline(g, raw.data(), r, sy, argb(51, 200, 210, 225), 1.2f, false);
    polyline(g, dry, r, sy, rgb(accent()), 1.8f, false);
    pill(g, L"SOURCE CYCLE", r.x + 7, r.y + 13, false, argb(153, 200, 210, 225));
    pill(g, std::to_wstring(disp.kept) + L" / " + std::to_wstring(disp.nonzero) + L" ATOMS KEPT", r.x + r.w - 7, r.y + r.h - 5, true, rgb(accent()));
  }

  void drawWindow(Canvas& g, R r) {
    double gains[NB], c, w, d; int note;
    gainsForDisplay(gains, c, w, d, note);
    g.line(Pt{r.x, r.y + r.h - 4.5f}, Pt{r.x + r.w, r.y + r.h - 4.5f}, Pen(argb(15, 255, 255, 255), 1));
    if (d <= 0) { text(g, L"WINDOW OFF · RAISE DEPTH", r, 9, true, argb(90, 200, 210, 225)); return; }
    std::vector<Pt> pts;
    for (int x = 0; x <= (int)r.w; x++) pts.push_back(Pt{r.x + x, (float)(r.y + r.h - 4 - windowValue(x / r.w, c, w, d) * (r.h - 8))});
    g.lines(pts.data(), (int)pts.size(), Pen(rgb(accent()), 1.6f));
  }

  void drawAdsr(Canvas& g, const Item& it) {
    R r = it.r;
    int base = it.w->env == 0 ? P_AMP_A : P_MOD_A;
    double a = plainOf(base), d = plainOf(base + 1), s = plainOf(base + 2), rl = plainOf(base + 3);
    auto f = [](double t) { return 0.06 + std::log10(1 + t * 100) / std::log10(1001.0); };
    double wa = f(a), wd = f(d), wr = f(rl), hold = 0.35, tot = wa + wd + hold + wr;
    auto X = [&](double v) { return (float)(r.x + 4 + v / tot * (r.w - 8)); };
    auto Y = [&](double v) { return (float)(r.y + r.h - 4 - v * (r.h - 8)); };
    std::vector<Pt> pts;
    pts.push_back(Pt{X(0), Y(0)}); pts.push_back(Pt{X(wa), Y(1)});
    for (int k = 1; k <= 16; k++) { double t = k / 16.0; pts.push_back(Pt{X(wa + wd * t), Y(s + (1 - s) * std::pow(0.001, t))}); }
    pts.push_back(Pt{X(wa + wd + hold), Y(s)});
    for (int k = 1; k <= 16; k++) { double t = k / 16.0; pts.push_back(Pt{X(wa + wd + hold + wr * t), Y(s * std::pow(0.001, t))}); }
    std::vector<Pt> poly = pts; poly.push_back(Pt{X(tot), Y(0)});
    g.fillPolygon(poly.data(), (int)poly.size(), rgb(accent(), 33));
    g.lines(pts.data(), (int)pts.size(), Pen(rgb(accent()), 1.6f));
  }

  void drawLeds(Canvas& g, R r) {
    int maxV = (int)jsRound(plainOf(P_V_VOICES));
    const float step = (r.w - 10) / 15;
    for (int k = 0; k < 16; k++) {
      bool on = (liveVoices >> k) & 1, avail = k < std::max(1, maxV);
      float x = r.x + 5 + k * step, y = r.y + 8.5f;
      if (on) g.fillEllipse(R{x - 7, y - 7, 14.f, 14.f}, rgb(accent(), 70));
      g.fillEllipse(R{x - 4, y - 4, 8.f, 8.f}, on ? rgb(accent()) : avail ? rgb(0x2a303a) : rgb(0x1a1e24));
    }
  }

  void drawFxHeads(Canvas& g, R r) {
    struct H { const wchar_t* t; float x, w; } hs[] = {{L"SATURATION", 26, 52}, {L"PING-PONG DELAY", 78, 156}, {L"REVERB", 234, 104}};
    const Pen ln(argb(20, 255, 255, 255), 1);
    for (auto& h : hs) {
      text(g, h.t, R{r.x + h.x, r.y, h.w, 16}, 9, true, argb(107, 200, 210, 225));
      g.line(Pt{r.x + h.x + 4, r.y + 17.5f}, Pt{r.x + h.x + h.w - 4, r.y + 17.5f}, ln);
    }
  }

  bool keyDown(int n) const { return ((liveKeys[n >> 5] >> (n & 31)) & 1) || n == mouseNote; }

  void drawKeyboard(Canvas& g, R r) {
    std::vector<int> whites; for (int n = KB_LO; n <= KB_HI; n++) if (!isBlack(n)) whites.push_back(n);
    float ww = r.w / whites.size();
    for (size_t k = 0; k < whites.size(); k++) {
      int n = whites[k]; float x = r.x + k * ww; bool on = keyDown(n);
      g.fillRect(R{x + 0.5f, r.y, ww - 1, r.h}, Brush(Pt{0, r.y}, Pt{0, r.y + r.h}, on ? rgb(accent()) : rgb(0xd9dee5), on ? rgb(0xe9fbf9) : rgb(0xf6f8fa)));
      g.fillRect(R{x + 0.5f, r.y + r.h - 3, ww - 1, 3.f}, argb(64, 0, 0, 0));
      if (n % 12 == 0) text(g, noteName(n), R{x, r.y + r.h - 22, ww, 14}, 9, true, on ? rgb(0x0d1014) : rgb(0x7a8594));
    }
    for (int n = KB_LO; n <= KB_HI; n++) {
      if (!isBlack(n)) continue;
      int k = (int)(std::find(whites.begin(), whites.end(), n - 1) - whites.begin());
      float x = r.x + (k + 1) * ww - ww * 0.31f, bw = ww * 0.62f, bh = r.h * 0.6f; bool on = keyDown(n);
      g.fillRect(R{x, r.y, bw, bh}, Brush(Pt{0, r.y}, Pt{0, r.y + bh}, on ? rgb(accent()) : rgb(0x262b33), on ? rgb(0x0f5a54) : rgb(0x0d0f12)));
      g.fillRect(R{x + 2, r.y + bh - 5, bw - 4, 3.f}, argb(20, 255, 255, 255));
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

  void drawWheels(Canvas& g, R r) {
    double bend = plainOf(P_BEND), mod = plainOf(P_MODWHEEL);
    struct Wh { float x; double v; const wchar_t* lab; bool center; } ws2[] = {{r.x, (bend + 1) / 2, L"PITCH", true}, {r.x + r.w - 24, mod, L"MOD", false}};
    for (auto& w : ws2) {
      float h = r.h - 14;
      g.fillRect(R{w.x, r.y, 24.f, h}, Brush(Pt{w.x, 0}, Pt{w.x + 24, 0}, rgb(0x0b0d10), rgb(0x1c2128)));
      const Pen rib(argb(13, 255, 255, 255), 1);
      for (float y = 4; y < h; y += 5) g.line(Pt{w.x + 3, r.y + y}, Pt{w.x + 21, r.y + y}, rib);
      if (w.center) g.fillRect(R{w.x, r.y + h / 2 - 0.5f, 24.f, 1.f}, argb(46, 255, 255, 255));
      float yy = r.y + (float)((1 - w.v) * (h - 8) + 4);
      g.fillRect(R{w.x, yy - 4, 24.f, 8.f}, rgb(accent(), 70));
      g.fillRect(R{w.x + 2, yy - 2, 20.f, 4.f}, rgb(accent()));
      text(g, w.lab, R{w.x - 6, r.y + r.h - 12, 36, 12}, 8, true, argb(115, 200, 210, 225));
    }
  }

  void drawLogo(Canvas& g, R r) {
    R m{r.x, r.y + 1, 30, 30};
    fillRR(g, m, 8, rgb(kInset)); strokeRR(g, m, 8, rgb(0x2a303a));
    const Pt pts[] = {{m.x + 3, m.y + 15}, {m.x + 8, m.y + 15}, {m.x + 11, m.y + 7}, {m.x + 15, m.y + 23}, {m.x + 19, m.y + 11}, {m.x + 22, m.y + 17}, {m.x + 27, m.y + 17}};
    g.lines(pts, 7, Pen(rgb(accent()), 2.2f).join().caps());
    text(g, L"OKTOWAVE", R{r.x + 40, r.y + 1, 160, 18}, 13.5f, true, rgb(0xeef2f7), 0);   // beta 0.3
    text(g, L"WAVELET SYNTHESIZER", R{r.x + 40, r.y + 17, 160, 14}, 9, true, rgb(accent()), 0);
  }

  void drawPresets(Canvas& g, R r) {
    inset(g, r, 8);
    text(g, L"◀", R{r.x, r.y, 30, r.h}, 11, false, rgb(kDim));
    text(g, L"▶", R{r.x + r.w - 30, r.y, 30, r.h}, 11, false, rgb(kDim));
    std::wstring name = toW(shownName());
    if (host->presetDirty()) name += L"  •";
    if (!host->browserOpen()) name += L"  ▸";   // a click opens the preset browser
    // a long name gets a smaller font rather than overflowing the arrows
    float px = 12.5f;
    for (; px > 9.5f; px -= 0.5f) if (g.textWidth(name, px, true) <= r.w - 64) break;
    text(g, name, R{r.x + 30, r.y, r.w - 60, r.h}, px, true, rgb(0xeef2f7));
  }

  void drawManualBtn(Canvas& g, const Item& it) {
    bool b = it.w->type == W_MANUALB;
    inset(g, it.r, 8);
    text(g, L"MANUAL", R{it.r.x, it.r.y + 3, it.r.w, 12}, 9.5f, true, rgb(kDim));
    text(g, b ? L"B" : L"A", R{it.r.x, it.r.y + 14, it.r.w, 14}, 12, true, rgb(b ? kAccentB : kAccentA));
  }

  void drawMeter(Canvas& g, R r) {
    float bw = (r.w - 2) / 2;
    float lv[2] = {meterL, meterR};
    for (int k = 0; k < 2; k++) {
      float x = r.x + k * (bw + 2);
      g.fillRect(R{x, r.y, bw, r.h}, rgb(0x0c0f13));
      double db = 20 * std::log10(lv[k] + 1e-9), t = std::min(1.0, std::max(0.0, (db + 48) / 48));
      float h = (float)(t * r.h);
      if (h > 0.5f) g.fillRect(R{x, r.y + r.h - h, bw, h}, Brush(Pt{0, r.y + r.h}, Pt{0, r.y}, rgb(0x2fd4c6), rgb(0xff5d5d)));
    }
  }

  void drawZoom(Canvas& g, R r) {
    inset(g, r, 5);
    text(g, std::to_wstring((int)std::lround(host->zoom() * 100)) + L"%", r, 9.5f, true, rgb(kDim));
  }

  // ---------------------------------------------------------------- interaction
  int hit(float x, float y) {
    for (int k = (int)items.size() - 1; k >= 0; k--) if (visible(items[k]) && items[k].r.has(x, y)) return k;
    return -1;
  }
  bool shiftDown() { return win && win->shiftDown(); }
  void setPlain(int id, double v) { host->performEditPlain(id, v); }
  void gesture(int id, double v) { host->setPlainGesture(id, v); onTimer(); }
  void noteOn(int n, double vel) { auto sh = host->sharedState(); if (sh) sh->push(SharedState::Ev{(int16_t)n, (int16_t)std::max(1, (int)std::lround(vel * 127))}); }
  void noteOff(int n) { auto sh = host->sharedState(); if (sh) sh->push(SharedState::Ev{(int16_t)n, 0}); }

  void wheelOn(int idx, int dir) {
    const Item& it = items[idx];
    int id = it.w->param;
    if (id < 0 || !(it.w->type == W_KNOBL || it.w->type == W_KNOBM || it.w->type == W_KNOBS || it.w->type == W_KNOBT || it.w->type == W_DRAWBAR || it.w->type == W_SEG || it.w->type == W_STEP || it.w->type == W_MENU)) return;
    const ParamDef& p = kParams[id];
    double cur = plainOf(id), v;
    if (p.curve == CURVE_INT || p.curve == CURVE_CHOICE) v = std::min(p.max, std::max(p.min, jsRound(cur) + dir));
    else v = toPlain(p, std::min(1.0, std::max(0.0, toNorm(p, cur) + dir * (shiftDown() ? 0.002 : 0.01))));
    gesture(id, v);
  }
  void wheel(float x, float y, int dir) override {
    if (host->browserOpen() && bList().has(x, y)) { browserWheel(dir); return; }
    int idx = hit(x, y);
    if (idx >= 0) wheelOn(idx, dir);
  }

  void mouseDown(float x, float y, bool dbl) override {
    if (kSaveBtn.has(x, y)) { if (!dbl) savePreset(); onTimer(); invalidateAll(); return; }
    if (host->browserOpen() && x >= kDeviceW) { browserClick(x, y); return; }
    int idx = hit(x, y);
    if (idx < 0) return;
    const Item& it = items[idx];
    const WidgetDef& w = *it.w;
    bool ctrl = win && win->ctrlDown();
    switch (w.type) {
      case W_KNOBL: case W_KNOBM: case W_KNOBS: case W_KNOBT: case W_DRAWBAR: {
        const ParamDef& p = kParams[w.param];
        if (dbl || ctrl) { gesture(w.param, p.def); return; }
        drag = idx; dragY = y; dragNorm = toNorm(p, plainOf(w.param)); dragShift = shiftDown(); dragMoved = false;
        host->beginEdit(w.param);
        if (win) win->capture(true);
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
        if (x < it.r.x + 30) { const int k = stepPreset(pi, -1); if (k >= 0) host->loadPreset(k); }   // deleted presets skipped
        else if (x > it.r.x + it.r.w - 30) { const int k = stepPreset(pi, 1); if (k >= 0) host->loadPreset(k); }
        else if (!host->browserOpen()) setBrowser(true);   // the name opens the preset browser (right-click: the menu)
        else bReveal();
        onTimer(); invalidateAll();
        return;
      }
      case W_MENU: choiceMenu(it); return;
      case W_MANUALA: case W_MANUALB: openManual(w.type == W_MANUALA ? L"manual-a.html" : L"manual-b.html"); return;
      case W_ZOOM: zoomMenu(it); return;
      case W_KEYBOARD: {
        double vel; int n = keyAt(it.r, x, y, vel);
        mouseNote = n; noteOn(n, vel);
        if (win) win->capture(true);
        drag = idx; invalidateItem(idx);
        return;
      }
      case W_WHEELS: {
        wheelDrag = x < it.r.x + it.r.w / 2 ? 0 : 1;
        host->beginEdit(wheelDrag == 0 ? P_BEND : P_MODWHEEL);
        drag = idx; if (win) win->capture(true);
        wheelMove(it, y);
        return;
      }
      default: return;
    }
  }
  // right-click (or Control-click on a Mac) on the preset name: the classic menu
  void rightDown(float x, float y) override {
    const int idx = hit(x, y);
    if (idx >= 0 && items[idx].w->type == W_PRESETS) { presetMenu(items[idx]); onTimer(); invalidateAll(); }
  }

  void wheelMove(const Item& it, float y) {
    float h = it.r.h - 14;
    double v = std::min(1.0, std::max(0.0, 1.0 - (double)(y - it.r.y - 4) / (h - 8)));
    if (wheelDrag == 0) setPlain(P_BEND, v * 2 - 1); else setPlain(P_MODWHEEL, v);
    invalidateItem(drag);
  }

  bool mouseMove(float x, float y) override {
    if (drag >= 0) {
      const Item& it = items[drag];
      if (it.w->type == W_KEYBOARD) {
        double vel; int n = keyAt(it.r, std::max(it.r.x, std::min(it.r.x + it.r.w - 1, x)), std::max(it.r.y, std::min(it.r.y + it.r.h - 1, y)), vel);
        if (n != mouseNote) { if (mouseNote >= 0) noteOff(mouseNote); mouseNote = n; noteOn(n, vel); invalidateItem(drag); }
        return false;
      }
      if (it.w->type == W_WHEELS) { wheelMove(it, y); return false; }
      const ParamDef& p = kParams[it.w->param];
      // beta 0.3: a knob with few positions (SUB OCT, shapes) moves 24 px per step; a click without moving steps to the
      // next value (mouseUp)
      const bool few = it.w->type != W_DRAWBAR && (p.curve == CURVE_INT || p.curve == CURVE_CHOICE) && p.max - p.min <= 4;
      if (std::fabs(y - dragY) > 3) dragMoved = true;
      bool shift = shiftDown() && !few;
      if (shift != dragShift) { dragShift = shift; dragY = y; dragNorm = toNorm(p, plainOf(it.w->param)); return false; }
      double range = few ? 24 * (p.max - p.min) : it.w->type == W_DRAWBAR ? 120 : 180;
      double n = std::min(1.0, std::max(0.0, dragNorm - (y - dragY) / (shift ? range * 5 : range)));
      double v = toPlain(p, n);
      if (v != plainOf(it.w->param)) { setPlain(it.w->param, v); onTimer(); }
      return false;
    }
    int h = kSaveBtn.has(x, y) ? -2 : hit(x, y);
    if (h != hover) {
      int old = hover; hover = h;
      invalidateItem(old); invalidateItem(hover);
      if (old == -2 || h == -2) invalidateLogical(kSaveBtn);
    }
    const int bh = host->browserOpen() && x >= kDeviceW ? bHit(x, y) : -1;
    if (bh != bHover) { bHover = bh; invalidateLogical(bCard()); }
    return true;
  }

  void mouseUp() override {
    if (drag < 0) return;
    const Item& it = items[drag];
    if (it.w->type == W_KEYBOARD) { if (mouseNote >= 0) noteOff(mouseNote); mouseNote = -1; }
    else if (it.w->type == W_WHEELS) {
      int id = wheelDrag == 0 ? P_BEND : P_MODWHEEL;
      if (wheelDrag == 0) setPlain(P_BEND, 0);
      host->endEdit(id); wheelDrag = -1;
    } else {
      const int id = it.w->param;
      const ParamDef& p = kParams[id];
      if (it.w->type != W_DRAWBAR && (p.curve == CURVE_INT || p.curve == CURVE_CHOICE) && p.max - p.min <= 4 && !dragMoved) {
        const int n = (int)(p.max - p.min + 1);   // a click: the next value, round the end
        setPlain(id, p.min + (((int)jsRound(plainOf(id)) - (int)p.min + 1) % n));
      }
      host->endEdit(id);
    }
    int old = drag; drag = -1;
    if (win) win->capture(false);
    invalidateItem(old);
    onTimer();
  }

  void mouseLeave() override {
    if (drag < 0 && hover >= 0) { int o = hover; hover = -1; invalidateItem(o); }
    if (hover == -2) { hover = -1; invalidateLogical(kSaveBtn); }
    if (bHover >= 0) { bHover = -1; invalidateLogical(bCard()); }
  }

  // developer test (vst/devtest/bank_session.cpp, tests/machost): a preset-menu command, the bank read again
  void testCommand(int cmd) override {
    menuBank = Library::get().bank();
    menuCommand(cmd);
  }

  // ================================================================ presets: menu, library, browser (beta 0.3)
  // The preset name opens the PRESET BROWSER (a panel at the right of the synth, which can be hidden); a right-click on it
  // opens the classic menu. SAVE PRESET overwrites the preset shown: a factory preset is ADJUSTED in the library (it
  // keeps its place, optionally under a new name; RESTORE brings the original back), a sound of the user bank is
  // replaced. Everything lives in the library file (bank.h), which another instance may change at any time: every action
  // reads it again first. DELETE hides a factory preset from the lists (the file keeps it, "Deleted: yes"; the menu's
  // "Deleted presets" brings it back).
  static constexpr int kCmdBankSave = 900, kCmdBankExport = 901, kCmdBankShow = 902, kCmdSavePreset = 910, kCmdRestore = 911,
                       kCmdBrowser = 912, kCmdDelete = 913, kCmdBankLoad = 1000, kCmdBankDelete = 3000, kCmdUndelete = 5000;
  static constexpr float kBrowserW = 360;                  // logical width added at the right while the browser is open
  static constexpr R kSaveBtn{800, 9, 68, 30};             // SAVE PRESET, left of MANUAL A (the preset box is shorter)
  std::vector<BankPreset> menuBank;                        // the bank as listed by the last menu / browser (commands index it)
  struct BCat { std::wstring label; std::vector<int> presets; };   // a factory category of the browser
  std::vector<BCat> fCats;                                 // TOP Sounds, then the categories in factory order
  int bTab = 0, bCat = 0, bScroll = 0, bHover = -1;        // tab (0 factory, 1 user bank), category row, first row, hover
  uint32_t libVer = 0; int libTick = 0;
  std::wstring bStatus;                                    // last browser message

  // the browser's factory lists, as the library keeps them (TOP Sounds, then the categories, in the player's order)
  void buildCategories() {
    fCats.clear();
    for (const auto& l : Library::get().lists()) fCats.push_back(BCat{toW(l.first), l.second});
  }
  std::string shownName() {   // the preset browser's text: the bank sound, else the factory preset as named now
    const std::string user = host->userPresetName();
    if (!user.empty()) return user;
    const int pi = host->presetIndex();
    return pi >= 0 && pi < kNumPresets ? Library::get().name(pi) : "User sound";
  }

  // ---------------------------------------------------------------- classic menu (right-click on the preset name)
  void presetMenu(const Item& it) {
    Library& lib = Library::get();
    std::vector<MenuItem> m;
    const int cur = host->presetIndex();
    const std::string user = host->userPresetName();
    m.push_back(MenuItem::item(L"★ Favourites", 0, false, true));
    for (int k = 0; k < kNumFavourites && k < kNumPresets; k++)
      if (!lib.deleted(k)) m.push_back(MenuItem::item(toW(lib.name(k)), 100 + k, k == cur && user.empty()));
    m.push_back(MenuItem::sep());
    for (int k = kNumFavourites; k < kNumPresets;) {
      const char* cat = kPresets[k].cat;
      std::vector<MenuItem> sub;
      bool here = false;
      int n = 0;
      for (; k < kNumPresets && std::strcmp(kPresets[k].cat, cat) == 0; k++) {
        if (lib.deleted(k)) continue;
        sub.push_back(MenuItem::item(toW(lib.name(k)), 100 + k, k == cur && user.empty()));
        if (k == cur && user.empty()) here = true;
        n++;
      }
      m.push_back(MenuItem::popup(toW(cat) + L"\t" + std::to_wstring(n), std::move(sub), here));
    }
    menuBank = lib.bank();
    m.push_back(MenuItem::sep());
    std::vector<MenuItem> ub, del;
    bool inBank = false;
    for (int sec = 0; sec < kNumBankSections; sec++) {
      std::vector<MenuItem> sub, dsub;
      int n = 0; bool here = false;
      for (size_t i = 0; i < menuBank.size(); i++) {
        if (menuBank[i].section != sec) continue;
        const bool c = !user.empty() && user == kUserPrefix + menuBank[i].name;
        sub.push_back(MenuItem::item(toW(menuBank[i].name), kCmdBankLoad + (int)i, c));
        dsub.push_back(MenuItem::item(toW(menuBank[i].name), kCmdBankDelete + (int)i));
        n++; here = here || c;
      }
      if (!n) sub.push_back(MenuItem::item(L"(empty)", 0, false, true));
      const std::wstring label = toW(kBankSections[sec]) + L"\t" + std::to_wstring(n);
      ub.push_back(MenuItem::popup(label, std::move(sub), here));
      if (n) del.push_back(MenuItem::popup(label, std::move(dsub)));
      inBank = inBank || here;
    }
    ub.push_back(MenuItem::sep());
    ub.push_back(MenuItem::item(L"Save the current sound…", kCmdBankSave));
    if (!menuBank.empty()) ub.push_back(MenuItem::popup(L"Delete", std::move(del)));
    m.push_back(MenuItem::popup(L"USER BANK\t" + std::to_wstring(menuBank.size()), std::move(ub), inBank));
    m.push_back(MenuItem::sep());
    m.push_back(MenuItem::item(L"Save preset (overwrite)…", kCmdSavePreset));
    m.push_back(MenuItem::item(L"Save to user bank…", kCmdBankSave));
    if (user.empty() && lib.adjusted(cur)) m.push_back(MenuItem::item(L"Restore the original preset", kCmdRestore));
    if (user.empty() && !lib.deleted(cur)) m.push_back(MenuItem::item(L"Delete this preset from the list…", kCmdDelete));
    if (lib.deletedCount() > 0) {   // bring a deleted factory preset back
      std::vector<MenuItem> dm;
      for (int k = 0; k < kNumPresets; k++) if (lib.deleted(k)) dm.push_back(MenuItem::item(toW(lib.name(k)), kCmdUndelete + k));
      m.push_back(MenuItem::popup(L"Deleted presets (click to bring back)\t" + std::to_wstring(lib.deletedCount()), std::move(dm)));
    }
    m.push_back(MenuItem::item(L"Export all presets (.txt)…", kCmdBankExport));
    m.push_back(MenuItem::item(L"Show the presets file", kCmdBankShow));
    m.push_back(MenuItem::item(host->browserOpen() ? L"Hide the preset browser" : L"Show the preset browser", kCmdBrowser));
    const int cmd = win ? win->popupMenu(m, it.r.x + 30, it.r.y + it.r.h) : 0;
    menuCommand(cmd);
  }
  // a command of the menu or the browser (also sent by the developer tests, with the bank read again)
  void menuCommand(int cmd) {
    if (cmd >= 100 && cmd < 100 + kNumPresets) host->loadPreset(cmd - 100);
    else if (cmd == kCmdBankSave) bankSave();
    else if (cmd == kCmdBankExport) bankExport();
    else if (cmd == kCmdBankShow) bankShow();
    else if (cmd == kCmdSavePreset) savePreset();
    else if (cmd == kCmdRestore) restorePreset(host->presetIndex());
    else if (cmd == kCmdBrowser) setBrowser(!host->browserOpen());
    else if (cmd == kCmdDelete) deletePreset(host->presetIndex());
    else if (cmd >= kCmdUndelete && cmd < kCmdUndelete + kNumPresets) {
      if (!libError(Library::get().setDeleted(cmd - kCmdUndelete, false), L"Could not save the presets file:"))
        bStatus = L"“" + toW(Library::get().name(cmd - kCmdUndelete)) + L"” is back in the list.";
    }
    else if (cmd >= kCmdBankLoad && cmd < kCmdBankLoad + (int)menuBank.size()) {
      const BankPreset& p = menuBank[cmd - kCmdBankLoad];
      host->loadUserSound(p.v, kUserPrefix + p.name);
    } else if (cmd >= kCmdBankDelete && cmd < kCmdBankDelete + (int)menuBank.size()) bankDelete(menuBank[cmd - kCmdBankDelete]);
    else return;
    onTimer(); invalidateAll();
  }

  // ---------------------------------------------------------------- library actions
  bool libError(const std::wstring& e, const wchar_t* what) {
    if (e.empty()) return false;
    const std::wstring path = Library::get().path();
    if (win) win->message(std::wstring(what) + L"\n" + path + L"\n\n" + e + L".\n\n" + kFolderNote, true);
    return true;
  }
  bool ask(const std::wstring& q) { return win && win->ask(q); }
  void currentSound(double* v) {
    currentParams(v);
    for (int i = 0; i < kNumParams; i++) if (kParams[i].hidden) v[i] = kParams[i].def;
  }
  // SAVE PRESET: overwrites the preset shown (a factory preset is adjusted, a bank sound replaced), name editable
  void savePreset() {
    Library& lib = Library::get();
    lib.refresh();
    double v[kNumParams];
    currentSound(v);
    const std::string user = host->userPresetName();
    if (!user.empty()) {   // a sound of the user bank
      const std::string old = user.substr(std::strlen(kUserPrefix));
      BankPreset np;
      bool found = false;
      for (const BankPreset& p : lib.bank()) if (p.name == old) { np = p; found = true; break; }
      if (!found) { bankSave(); return; }   // no longer in the bank (deleted elsewhere): save it again
      SaveDlg d; d.name = toW(old);
      const std::wstring note = L"Overwrites “" + d.name + L"” in the user bank (" + toW(kBankSections[np.section]) + L").";
      if (!win || !win->saveDialog(d, L"Save preset", false, note.c_str())) return;
      np.name = fromW(d.name);
      std::memcpy(np.v, v, sizeof v);
      if (libError(lib.putUser(np, old), L"Could not save the preset:")) return;
      host->loadUserSound(np.v, kUserPrefix + np.name);
      bStatus = L"Saved “" + d.name + L"” in the user bank.";
      return;
    }
    const int k = host->presetIndex();
    if (k < 0 || k >= kNumPresets) return;
    SaveDlg d; d.name = toW(lib.name(k));
    const std::wstring note = std::wstring(L"Overwrites the factory preset “") + toW(lib.name(k)) +
                              L"” in the list (RESTORE in the preset browser brings the original back).";
    if (!win || !win->saveDialog(d, L"Save preset", false, note.c_str())) return;
    const std::string nn = fromW(d.name);
    const int other = lib.find(nn);
    if (other >= 0 && other != k) {
      win->message(L"Another preset is already called “" + d.name + L"”: choose another name.", false);
      return;
    }
    if (libError(lib.adjust(k, nn, v), L"Could not save the preset:")) return;
    host->presetStored(k);
    bStatus = L"Saved “" + d.name + L"” (adjusted factory preset).";
  }
  void restorePreset(int k) {
    Library& lib = Library::get();
    lib.refresh();
    if (k < 0 || k >= kNumPresets || !lib.adjusted(k)) return;
    if (!ask(L"Restore the original factory preset “" + toW(kPresets[k].name) + L"”? Your adjustments of “" +
             toW(lib.name(k)) + L"” are lost.")) return;
    if (libError(lib.restore(k), L"Could not save the presets file:")) return;
    if (host->userPresetName().empty() && host->presetIndex() == k) host->loadPreset(k);   // the original sound again
    bStatus = L"Restored “" + toW(kPresets[k].name) + L"”.";
  }
  // DELETE (factory tab): the preset leaves the lists (kept in the file as "Deleted: yes"); the next one of the list plays
  void deletePreset(int k) {
    Library& lib = Library::get();
    lib.refresh();
    buildCategories();
    if (k < 0 || k >= kNumPresets || lib.deleted(k)) return;
    if (!ask(L"Delete “" + toW(lib.name(k)) + L"” from the preset list?\n\nIt stays in the presets file (\"Deleted: yes\"), "
             L"so that the next version can leave it out; a right-click on the preset name, “Deleted presets”, brings it back.")) return;
    const std::vector<int> rows = bTab == 0 ? bRows() : std::vector<int>();
    int next = -1;
    for (size_t j = 0; j < rows.size(); j++) if (rows[j] == k) {
      for (size_t i = j + 1; i < rows.size() && next < 0; i++) if (!lib.deleted(rows[i])) next = rows[i];
      for (size_t i = j; i-- > 0 && next < 0;) if (!lib.deleted(rows[i])) next = rows[i];
    }
    if (libError(lib.setDeleted(k, true), L"Could not save the presets file:")) return;
    bStatus = L"Deleted “" + toW(lib.name(k)) + L"” from the list.";
    if (next < 0) next = stepPreset(k, 1);
    if (next >= 0) host->loadPreset(next);
  }
  // the next (dir 1) or previous (dir -1) factory preset that is not deleted
  int stepPreset(int from, int dir) {
    Library& lib = Library::get();
    for (int i = 1; i <= kNumPresets; i++) {
      const int k = ((from < 0 ? 0 : from) + dir * i + kNumPresets * 2) % kNumPresets;
      if (!lib.deleted(k)) return k;
    }
    return -1;
  }
  void bankSave() {   // the current sound into the user bank: name and section
    Library& lib = Library::get();
    lib.refresh();
    SaveDlg d;
    const std::string user = host->userPresetName();
    const int pi = host->presetIndex();
    if (!user.empty()) {
      d.name = toW(user.substr(std::strlen(kUserPrefix)));
      for (const BankPreset& p : lib.bank()) if (kUserPrefix + p.name == user) { d.section = p.section; break; }
    } else if (pi >= 0 && pi < kNumPresets) {
      d.name = toW(lib.name(pi));
      d.section = std::max(0, bankSectionOf(kPresets[pi].cat));
    }
    if (!win || !win->saveDialog(d, L"Save to user bank", true, nullptr)) return;
    BankPreset np;
    np.section = d.section; np.name = fromW(d.name);
    currentSound(np.v);
    np.from = !user.empty() ? user.substr(std::strlen(kUserPrefix)) : pi >= 0 && pi < kNumPresets ? lib.name(pi) : "";
    if (!np.from.empty() && host->presetDirty()) np.from += " (modified)";
    const std::vector<BankPreset> bank = lib.bank();
    if (std::any_of(bank.begin(), bank.end(), [&](const BankPreset& p) { return p.section == np.section && p.name == np.name; }) &&
        !ask(L"“" + d.name + L"” already exists in " + toW(kBankSections[np.section]) + L". Replace it?")) return;
    if (libError(lib.putUser(np), L"Could not save the user bank:")) return;
    host->loadUserSound(np.v, kUserPrefix + np.name);   // the sound is now this bank entry
    bTab = 1; bCat = np.section; bScroll = 0;
    bStatus = L"Saved “" + d.name + L"” in " + toW(kBankSections[np.section]) + L".";
  }
  void bankDelete(const BankPreset& p) {
    if (!ask(L"Delete “" + toW(p.name) + L"” from the user bank (" + toW(kBankSections[p.section]) + L")?")) return;
    if (libError(Library::get().removeUser(p.section, p.name), L"Could not save the user bank:")) return;
    bStatus = L"Deleted “" + toW(p.name) + L"”.";
  }
  void bankExport() {
    std::wstring path = envPath(L"WS_PRESETS_EXPORT");   // developer test: no dialog
    if (path.empty()) {
      if (!win) return;
      path = win->saveFileDialog(L"Export all presets (factory presets and user bank)", L"OKTOWAVE presets.txt");
      if (path.empty()) return;
    }
    Library::get().refresh();
    const std::wstring e = Library::get().exportTo(path);
    if (!e.empty()) { if (win) win->message(L"Could not export the presets:\n" + path + L"\n\n" + e + L".", true); }
    else bStatus = L"Exported to " + path.substr(path.find_last_of(L"\\/") + 1) + L".";
  }
  void bankShow() {
    const std::wstring path = Library::get().path();
    if (!fileExists(path)) {
      bStatus = L"No presets file yet: it is written by the first SAVE.";
      return;
    }
    if (win) win->reveal(path);
  }

  // ---------------------------------------------------------------- preset browser panel
  R bCard() const { return R{kDeviceW + 4, 8, kBrowserW - 12, 704}; }
  R bHide() const { const R c = bCard(); return R{c.x + c.w - 70, c.y + 6, 58, 20}; }
  R bTabR(int t) const { const R c = bCard(); const float w = (c.w - 24) / 2; return R{c.x + 12 + t * w, c.y + 34, w, 26}; }
  R bCatR(int i) const { const R c = bCard(); return R{c.x + 12, c.y + 72 + i * 26.0f, 118, 24}; }
  R bList() const { const R c = bCard(); return R{c.x + 136, c.y + 98, c.w - 148, 548}; }
  R bListHead() const { const R c = bCard(); return R{c.x + 136, c.y + 72, c.w - 148, 20}; }   // its name, ▲ ▼
  R bMoveR(int dir) const { const R h = bListHead(); return R{h.x + h.w - (dir < 0 ? 52 : 26), h.y, 24, 20}; }
  static constexpr float kRowH = 22;
  int bVisibleRows() const { return (int)(bList().h / kRowH); }
  R bRowR(int j) const { const R l = bList(); return R{l.x, l.y + j * kRowH, l.w, kRowH - 1}; }
  static constexpr int kBtns = 5;   // TO BANK, RESTORE, DELETE, EXPORT, FILE
  R bBtnR(int b) const { const R c = bCard(); const float w = (c.w - 24 - 4 * 5) / kBtns; return R{c.x + 12 + b * (w + 5), c.y + 654, w, 26}; }
  int bNumCats() const { return bTab == 0 ? (int)fCats.size() : kNumBankSections; }
  // the rows of the selected category: factory preset indices, or indices into menuBank
  std::vector<int> bRows() {
    std::vector<int> r;
    if (bTab == 0) { if (bCat >= 0 && bCat < (int)fCats.size()) for (int k : fCats[bCat].presets) if (!Library::get().deleted(k)) r.push_back(k); }
    else for (size_t i = 0; i < menuBank.size(); i++) if (menuBank[i].section == bCat) r.push_back((int)i);
    return r;
  }
  bool bMoveEnabled() {   // the sound playing is in the list shown
    for (int row : bRows()) if (bRowIsCurrent(row)) return true;
    return false;
  }
  // MOVE UP (dir -1) / DOWN (+1): the sound playing moves in the list shown; the order is kept in the presets file
  void bMove(int dir) {
    Library& lib = Library::get();
    const std::string user = host->userPresetName();
    std::wstring e;
    if (bTab == 0) { if (!user.empty()) return; e = lib.moveInList(bCat, host->presetIndex(), dir); }
    else { if (user.empty()) return; e = lib.moveUser(bCat, user.substr(std::strlen(kUserPrefix)), dir); }
    if (libError(e, L"Could not save the presets file:")) return;
    buildCategories();
    menuBank = lib.bank();
    const std::vector<int> rows = bRows();
    const int vis = bVisibleRows();
    for (int j = 0; j < (int)rows.size(); j++)
      if (bRowIsCurrent(rows[j])) { if (j < bScroll) bScroll = j; else if (j >= bScroll + vis) bScroll = j - vis + 1; }
  }
  void setBrowser(bool open) {
    host->setBrowserOpen(open);
    if (open) bReveal();
    requestResize();
    invalidateAll();
  }
  // the tab, category and scroll of the sound shown
  void bReveal() {
    buildCategories();
    menuBank = Library::get().bank();
    const std::string user = host->userPresetName();
    if (!user.empty()) {
      for (size_t i = 0; i < menuBank.size(); i++)
        if (kUserPrefix + menuBank[i].name == user) { bTab = 1; bCat = menuBank[i].section; break; }
    } else {
      const int pi = host->presetIndex();
      bTab = 0;
      if (!(bCat >= 0 && bCat < (int)fCats.size() && std::count(fCats[bCat].presets.begin(), fCats[bCat].presets.end(), pi)))
        for (size_t c = 1; c < fCats.size(); c++)
          if (std::count(fCats[c].presets.begin(), fCats[c].presets.end(), pi)) { bCat = (int)c; break; }
    }
    const std::vector<int> rows = bRows();
    int at = -1;
    for (size_t j = 0; j < rows.size(); j++) if (bRowIsCurrent(rows[j])) at = (int)j;
    bScroll = at < 0 ? 0 : std::max(0, std::min(at - bVisibleRows() / 2, (int)rows.size() - bVisibleRows()));
  }
  bool bRowIsCurrent(int row) {
    const std::string user = host->userPresetName();
    if (bTab == 0) return user.empty() && row == host->presetIndex();
    return row >= 0 && row < (int)menuBank.size() && user == kUserPrefix + menuBank[row].name;
  }
  // hover / click ids: 1 HIDE, 10 + t tab, 100 + i category, 1000 + j visible sound row, 500 + b button
  int bHit(float x, float y) {
    if (bHide().has(x, y)) return 1;
    if (bMoveR(-1).has(x, y)) return 20;
    if (bMoveR(1).has(x, y)) return 21;
    for (int t = 0; t < 2; t++) if (bTabR(t).has(x, y)) return 10 + t;
    for (int i = 0; i < bNumCats(); i++) if (bCatR(i).has(x, y)) return 100 + i;
    for (int j = 0; j < bVisibleRows(); j++) if (bRowR(j).has(x, y)) return 1000 + j;
    for (int b = 0; b < kBtns; b++) if (bBtnR(b).has(x, y)) return 500 + b;
    return -1;
  }
  bool bBtnEnabled(int b) {
    const bool factory = host->userPresetName().empty();
    if (b == 1) return bTab == 0 && factory && Library::get().adjusted(host->presetIndex());   // RESTORE
    if (b == 2) return bTab == 0 ? factory && !Library::get().deleted(host->presetIndex()) : !factory;   // DELETE
    return true;
  }
  void browserClick(float x, float y) {
    buildCategories();
    menuBank = Library::get().bank();
    const int h = bHit(x, y);
    if (h == 1) { setBrowser(false); return; }
    if (h == 20 || h == 21) { if (bMoveEnabled()) bMove(h == 20 ? -1 : 1); invalidateAll(); return; }
    if (h == 10 || h == 11) {   // a tab; it shows the sound playing only when that sound belongs to it
      bTab = h - 10; bCat = 0; bScroll = 0;
      if ((bTab == 0) == host->userPresetName().empty()) bReveal();
    }
    else if (h >= 100 && h < 500) { bCat = h - 100; bScroll = 0; }
    else if (h >= 1000) {
      const std::vector<int> rows = bRows();
      const int j = h - 1000 + bScroll;
      if (j < (int)rows.size()) {
        if (bTab == 0) host->loadPreset(rows[j]);
        else host->loadUserSound(menuBank[rows[j]].v, kUserPrefix + menuBank[rows[j]].name);
        bStatus.clear();
        onTimer();
      }
    } else if (h >= 500 && h < 500 + kBtns && bBtnEnabled(h - 500)) {
      const int b = h - 500;
      if (b == 0) bankSave();
      else if (b == 1) restorePreset(host->presetIndex());
      else if (b == 2 && bTab == 0) deletePreset(host->presetIndex());
      else if (b == 2) {
        const std::string user = host->userPresetName();
        for (const BankPreset& p : Library::get().bank()) if (kUserPrefix + p.name == user) { bankDelete(p); break; }
      } else if (b == 3) bankExport();
      else bankShow();
      menuBank = Library::get().bank();
      onTimer();
    }
    invalidateAll();
  }
  void browserWheel(int dir) {
    buildCategories();
    const int n = (int)bRows().size(), maxScroll = std::max(0, n - bVisibleRows());
    const int s = std::max(0, std::min(maxScroll, bScroll - dir * 3));
    if (s != bScroll) { bScroll = s; invalidateLogical(bList()); }
  }
  // a preset name with its engine letters coloured as in the panel (A teal, B orange)
  void nameText(Canvas& g, const std::string& name, R r, float px, bool bold, Col rest, int alpha) {
    const size_t dot = name.find(" \xC2\xB7 ");
    std::string pre = dot != std::string::npos && dot <= 2 ? name.substr(0, dot) : "";
    if (pre != "A" && pre != "B" && pre != "AB") pre.clear();
    float x = r.x;
    auto part = [&](const std::wstring& s, Col c) {
      const float bw = g.textWidth(s, px, bold);
      text(g, s, R{x, r.y, bw + 2, r.h}, px, bold, c, 0);
      x += bw - px * 0.28f;
    };
    if (!pre.empty()) {
      for (char ch : pre) part(std::wstring(1, (wchar_t)ch), rgb(ch == 'A' ? kAccentA : kAccentB, alpha));
      part(toW(name.substr(pre.size())), rest);
    } else g.textEllipsis(toW(name), r, px, bold, rest, true);
  }
  void drawBrowser(Canvas& g) {
    Library& lib = Library::get();
    buildCategories();
    menuBank = lib.bank();
    const R c = bCard();
    fillRR(g, c, 10, Brush(Pt{0, c.y}, Pt{0, c.y + c.h}, rgb(0x1f242c), rgb(0x1a1e25)));
    strokeRR(g, R{c.x + 0.5f, c.y + 0.5f, c.w - 1, c.h - 1}, 10, rgb(0x2b313b));
    text(g, L"PRESET BROWSER", R{c.x + 12, c.y + 6, 200, 18}, 10.5f, true, rgb(accent()), 0);
    {   // HIDE
      const R h = bHide(); const bool hot = bHover == 1;
      fillRR(g, h, 5, rgb(hot ? 0x262c35 : kInset));
      strokeRR(g, R{h.x + 0.5f, h.y + 0.5f, h.w - 1, h.h - 1}, 5, rgb(hot ? 0x3a4250 : kInsetEdge));
      text(g, L"HIDE \u25B8", h, 9, true, rgb(hot ? kText : kDim));
    }
    // tabs
    const std::wstring tabs[2] = {L"FACTORY  " + std::to_wstring(kNumPresets), L"USER BANK  " + std::to_wstring(menuBank.size())};
    {
      const R all{bTabR(0).x, bTabR(0).y, bTabR(0).w * 2, bTabR(0).h};
      inset(g, all, 7);
      for (int t = 0; t < 2; t++) {
        const R r = bTabR(t);
        if (t == bTab) fillRR(g, R{r.x + 2, r.y + 2, r.w - 4, r.h - 4}, 5, rgb(accent()));
        text(g, tabs[t], r, 10, true, t == bTab ? rgb(0x0d1014) : rgb(bHover == 10 + t ? kText : kDim));
      }
    }
    // categories
    inset(g, R{c.x + 8, c.y + 68, 126, 582}, 7);
    for (int i = 0; i < bNumCats(); i++) {
      const R r = bCatR(i);
      const bool sel = i == bCat, hot = bHover == 100 + i;
      int n = 0;
      std::wstring label;
      if (bTab == 0) { for (int k : fCats[i].presets) n += !lib.deleted(k); label = fCats[i].label; }
      else { for (const BankPreset& p : menuBank) n += p.section == i; label = toW(kBankSections[i]); }
      if (sel || hot) fillRR(g, R{r.x, r.y, r.w, r.h}, 5, sel ? rgb(accent(), 46) : rgb(0xffffff, 10));
      if (sel) g.fillRect(R{r.x, r.y + 4, 2.5f, r.h - 8}, rgb(accent()));
      const Col col = sel ? rgb(0xeef2f7) : n ? rgb(hot ? kText : 0xaeb7c4) : rgb(kFaint);
      text(g, label, R{r.x + 8, r.y, r.w - 34, r.h}, 11, sel, col, 0);
      text(g, std::to_wstring(n), R{r.x + r.w - 30, r.y, 24, r.h}, 9.5f, false, rgb(n ? kDim : kFaint), 2);
    }
    // sounds: the list's name and ▲ ▼ above it
    const R l = bList();
    const std::vector<int> rows = bRows();
    {
      const R hd = bListHead();
      const std::wstring nm = bTab == 0 ? (bCat < (int)fCats.size() ? fCats[bCat].label : L"") : toW(kBankSections[bCat]);
      std::wstring up = nm; for (auto& ch : up) ch = (wchar_t)towupper(ch);
      text(g, up + L"  \u00B7  " + std::to_wstring(rows.size()), R{hd.x + 2, hd.y, hd.w - 60, hd.h}, 9.5f, true, rgb(kDim), 0);
      const bool en = bMoveEnabled();
      for (int d : {-1, 1}) {
        const R b = bMoveR(d);
        const bool hot = en && bHover == (d < 0 ? 20 : 21);
        fillRR(g, b, 5, rgb(hot ? 0x262c35 : kInset));
        strokeRR(g, R{b.x + 0.5f, b.y + 0.5f, b.w - 1, b.h - 1}, 5, rgb(hot ? 0x3a4250 : kInsetEdge));
        text(g, d < 0 ? L"\u25B2" : L"\u25BC", b, 9, false, en ? rgb(hot ? kText : kDim) : rgb(kFaint));
      }
    }
    inset(g, R{l.x - 4, l.y - 4, l.w + 8, l.h + 8}, 7);
    const int vis = bVisibleRows();
    if (rows.empty())
      text(g, bTab == 1 ? L"Empty — SAVE TO BANK keeps the sound you hear here." : L"No preset.", R{l.x + 8, l.y + 8, l.w - 16, 18}, 10, false, rgb(kFaint), 0);
    for (int j = 0; j < vis && j + bScroll < (int)rows.size(); j++) {
      const int row = rows[j + bScroll];
      const R r = bRowR(j);
      const bool cur = bRowIsCurrent(row), hot = bHover == 1000 + j;
      if (cur || hot) fillRR(g, r, 4, cur ? rgb(accent(), 52) : rgb(0xffffff, 12));
      if (cur) g.fillRect(R{r.x, r.y + 3, 2.5f, r.h - 6}, rgb(accent()));
      std::string name;
      bool fav = false, adj = false;
      int vote = 0;
      if (bTab == 0) { name = lib.name(row); fav = row < kNumFavourites; adj = lib.adjusted(row); vote = kPresetStars[row]; }
      else name = menuBank[row].name;
      float right = r.x + r.w - 6;
      if (adj) {   // adjusted by the player
        const R p{right - 26, r.y + 5, 26, r.h - 10};
        fillRR(g, p, 3, rgb(accent(), 40));
        text(g, L"ADJ", p, 8, true, rgb(accent()));
        right -= 30;
      }
      if (fav) { starShape(g, right - 7, r.y + r.h / 2, 5, rgb(0xffcf4a)); right -= 16; }   // a favourite
      else if (vote > 0) {   // OktoPierre's vote in the listening test
        starShape(g, right - 6, r.y + r.h / 2, 4, rgb(0xffcf4a, 170));
        text(g, std::to_wstring(vote), R{right - 30, r.y, 18, r.h}, 9.5f, true, rgb(0xffcf4a, 200), 2);
        right -= 32;
      }
      nameText(g, name, R{r.x + 8, r.y, right - r.x - 10, r.h}, 11.5f, cur, cur ? rgb(0xffffff) : rgb(0xd5dce6), 255);
    }
    if ((int)rows.size() > vis) {   // scroll bar
      const float th = l.h * vis / rows.size(), ty = l.y + (l.h - th) * bScroll / std::max(1, (int)rows.size() - vis);
      fillRR(g, R{l.x + l.w + 1, ty, 3, th}, 1.5f, rgb(0xffffff, 40));
    }
    // buttons
    const wchar_t* labels[kBtns] = {L"TO BANK\u2026", L"RESTORE", L"DELETE", L"EXPORT\u2026", L"FILE"};
    for (int b = 0; b < kBtns; b++) {
      const R r = bBtnR(b);
      const bool en = bBtnEnabled(b), hot = en && bHover == 500 + b;
      fillRR(g, r, 6, rgb(hot ? 0x262c35 : kInset));
      strokeRR(g, R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, 6, rgb(hot ? 0x3a4250 : kInsetEdge));
      text(g, labels[b], r, 9, true, en ? (b == 2 && hot ? rgb(0xff6b6b) : rgb(hot ? kText : kDim)) : rgb(kFaint));
    }
    // status: the last message, else the library in one line
    std::wstring st = bStatus;
    if (st.empty())
      st = std::to_wstring(lib.adjustedCount()) + L" adjusted \u00B7 " + std::to_wstring(lib.deletedCount()) + L" deleted \u00B7 " +
           std::to_wstring(menuBank.size()) + L" in the user bank \u00B7 OKTOWAVE presets.txt";
    g.textEllipsis(st, R{c.x + 12, c.y + 684, c.w - 24, 14}, 9, false, rgb(kFaint), false);
  }
  void starShape(Canvas& g, float cx, float cy, float r, Col c) {
    Pt p[10];
    for (int k = 0; k < 10; k++) {
      const double a = PI * k / 5, rr = k % 2 ? r * 0.45 : r;
      p[k] = Pt{cx + (float)(rr * std::sin(a)), cy - (float)(rr * std::cos(a))};
    }
    g.fillPolygon(p, 10, c);
  }
  void drawSaveBtn(Canvas& g) {
    const R r = kSaveBtn;
    const bool hot = hover == -2;
    fillRR(g, r, 8, rgb(hot ? 0x262c35 : kInset));
    strokeRR(g, R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, 8, rgb(hot ? 0x3a4250 : kInsetEdge));
    text(g, L"SAVE", R{r.x, r.y + 3, r.w, 12}, 9.5f, true, rgb(kDim));
    text(g, L"PRESET", R{r.x, r.y + 14, r.w, 14}, 10.5f, true, rgb(accent()));
  }
  void drawMenu(Canvas& g, int idx) {   // a choice parameter as a drop-down (LFO 2 TARGET)
    const Item& it = items[idx];
    const ParamDef& p = kParams[it.w->param];
    const int v = (int)jsRound(plainOf(it.w->param));
    const bool hot = hover == idx;
    fillRR(g, it.r, 5, rgb(kInset));
    strokeRR(g, R{it.r.x + 0.5f, it.r.y + 0.5f, it.r.w - 1, it.r.h - 1}, 5, rgb(hot ? 0x3a4250 : kInsetEdge));
    text(g, toW(p.choiceShort[v]), R{it.r.x + 6, it.r.y, it.r.w - 18, it.r.h}, 9.5f, true, rgb(accent()), 0);
    text(g, L"\u25BE", R{it.r.x + it.r.w - 14, it.r.y, 12, it.r.h}, 9, false, rgb(kDim));
  }
  void choiceMenu(const Item& it) {
    const ParamDef& p = kParams[it.w->param];
    const int cur = (int)jsRound(plainOf(it.w->param));
    std::vector<MenuItem> m;
    for (int k = 0; k < p.numChoices; k++) m.push_back(MenuItem::item(toW(p.choices[k]), 1 + k, k == cur));
    const int cmd = win ? win->popupMenu(m, it.r.x, it.r.y + it.r.h) : 0;
    if (cmd >= 1) gesture(it.w->param, p.min + cmd - 1);
  }

  void zoomMenu(const Item& it) {
    const int z[] = {70, 80, 90, 100, 115, 130, 150};
    std::vector<MenuItem> m;
    int cur = (int)std::lround(host->zoom() * 100);
    for (int k : z) m.push_back(MenuItem::item(L"Window size " + std::to_wstring(k) + L"%", k, k == cur));
    const int cmd = win ? win->popupMenu(m, it.r.x, it.r.y + it.r.h) : 0;
    if (cmd > 0 && cmd != cur) { host->setZoom(cmd / 100.0); requestResize(); }
  }

  void openManual(const wchar_t* file) {
    // <bundle>.vst3/Contents/<binary folder>/<binary>  ->  <bundle>.vst3/Contents/Resources/manual/<file>
    const std::wstring man = contentsFolder() + kPathSep + L"Resources" + kPathSep + L"manual" + kPathSep + file;
    if (!fileExists(man)) {
      if (win) win->message(L"The manual was not found:\n" + man + L"\n\nInstall the complete WaveletSynthesizer.vst3 bundle folder.", false);
      return;
    }
    if (win) win->openDocument(man);
  }
};

IPlugView* createEditor(EditorHost* host, FUnknown* keepAlive) { return new Editor(host, keepAlive); }

}  // namespace ws
