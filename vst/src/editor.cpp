// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.6).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// Plugin editor: the panel, the same on every system. It draws through editor_platform.h: a Win32 window drawn with GDI+
// (editor_win.cpp) or a Cocoa view drawn with Core Graphics (editor_mac.mm, Mac port of beta 0.3).
// Same layout as the web UI (generated from tools/spec.js).
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <cwchar>
#include <functional>
#include <map>
#include <string>
#include <vector>
#include "pluginterfaces/base/keycodes.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "common.h"
#include "bank.h"
#include "editor_platform.h"

using namespace Steinberg;

namespace ws {

// ------------------------------------------------------------------ palette
// Version 1.0.6, the CRÉPUSCULE theme (the same look as the web app's css/synth.css): frosted glass over an orange-violet gradient. The cards are translucent white, the controls' insets
// translucent black (28 %) with a white 20 % edge, the text pale blue-white, the accents gold (A1 A2) and cyan (B1). Every system draws it the same way (the Canvas has alpha and gradients).
static const uint32_t kText = 0xf6f9ff, kDim = 0xc2d1e6, kFaint = 0x7f93b0, kTitle = 0xdbe6f6, kOnAccent = 0x10222e;   // kOnAccent: the text on an accent fill
static const uint32_t kAccentA = 0xffd166, kAccentB = 0x7ae7ff;   // A1 A2 gold, B1 cyan (the oriental opal().a / opal().b: generated/spec.h)
static const uint32_t kPage = 0x0f0a12;   // behind the panel (and the gap before the preset browser)
inline Col insetC() { return argb(71, 0, 0, 0); }            // rgba(0,0,0,.28)
inline Col edgeC(bool hot = false) { return argb(hot ? 102 : 51, 255, 255, 255); }   // rgba(255,255,255,.2), .4 hovered
inline Col hotC() { return argb(26, 255, 255, 255); }         // a hovered control's fill

struct Item { const WidgetDef* w; int section; R r; };

// kNoteNames: dsp.h (Okto MultiWave Synth: shared with the chord names)
static std::wstring noteName(int n) { return toW(std::string(kNoteNames[n % 12]) + std::to_string(n / 12 - 1)); }
static bool isBlack(int n) { int k = n % 12; return k == 1 || k == 3 || k == 6 || k == 8 || k == 10; }
static const int KB_LO = 36, KB_HI = 96;

// where the presets file must be writable (the message of a failed save)
#ifdef _WIN32
static const wchar_t* kFolderNote = L"The presets file is kept next to the OktoMultiWaveSynth.vst3 folder: that folder must allow "
                                    L"writing (the VST3 system folder, C:\\Program Files\\Common Files\\VST3, needs administrator rights).";
#else
static const wchar_t* kFolderNote = L"The presets file is kept next to the OktoMultiWaveSynth.vst3 folder: that folder must allow "
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
        if (w.only == 1) continue;   // beta 0.6: the web app's own (DOWNLOAD VST)
        items.push_back(Item{&w, s, R{sd.x + w.x, sd.y + w.y, w.w, w.h}});
      }
    }
    for (int s = 0; s < kNumSections; s++) if (std::strcmp(kSections[s].id, "chord") == 0) chordSec = s;
    for (size_t k = 0; k < items.size(); k++) if (items[k].section == chordSec) chordItems.push_back((int)k);
    for (int i = 0; i < kNumParams; i++) lastPlain[i] = host->getPlain(i);
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
    parentWin = parent; updateAuto();
    int W = pxW(), H = pxH();
    win = createEditorWindow(this, parent, W, H);
    if (!win) return kResultFalse;
    rebuildDisplay(true);
    layoutChordItems();
    bReveal();
    if (frame && (W != reportedW || H != reportedH)) requestResize();
    return kResultOk;
  }
  tresult PLUGIN_API removed() override { cleanup(); return kResultOk; }
  tresult PLUGIN_API onWheel(float distance) override {
    if (bHover >= 1000 || bHover == 30) browserWheel(distance > 0 ? 1 : -1);
    else if (hover >= 0) wheelOn(hover, distance > 0 ? 1 : -1);
    return kResultTrue;
  }
  // beta 0.5: keys the host passes to the editor (VST3, and VST2's effEditKeyDown): the arrow keys
  tresult PLUGIN_API onKeyDown(char16, int16 keyCode, int16 mods) override {
    if (mods & (kCommandKey | kAlternateKey | kControlKey)) return kResultFalse;
    const int k = keyCode == KEY_LEFT ? kKeyLeft : keyCode == KEY_UP ? kKeyUp : keyCode == KEY_RIGHT ? kKeyRight : keyCode == KEY_DOWN ? kKeyDown : 0;
    return k && key(k) ? kResultTrue : kResultFalse;
  }
  tresult PLUGIN_API onKeyUp(char16, int16 keyCode, int16 mods) override {
    if (mods & (kCommandKey | kAlternateKey | kControlKey)) return kResultFalse;
    return keyCode == KEY_LEFT || keyCode == KEY_UP || keyCode == KEY_RIGHT || keyCode == KEY_DOWN ? kResultTrue : kResultFalse;
  }
  tresult PLUGIN_API getSize(ViewRect* size) override {
    if (!size) return kInvalidArgument;
    if (!win && !hostScale) dpiScale = systemScale();
    if (!win) updateAuto();
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
  void* parentWin = nullptr;   // the host's window (the screen it is on)
  double autoZ = 1;            // beta 0.3.2: the zoom that fits the window to the screen (the zoom chosen is 0 = fit)
  int reportedW = 0, reportedH = 0;
  std::vector<Item> items;
  // state
  double lastPlain[kNumParams];
  uint32_t lastVersion = 0;
  int view = 0, mode = 0;   // the oscillator shown (A1 A2 B1) and its engine
  bool orient = false;      // beta 0.3.4: the TUNING switch is ARAB or TURK: the oriental colour code and the pattern of the PLAY card
  int orientMode = 0;       // version 1.0.5: 0 WEST, 1 ARAB (sand-gold), 2 TURK (carmine): opal() is its palette
  bool chordOn = false;     // CHORD MODE: the chord card is shown (under the keyboard and the panel taller, or under the list of the browser)
  int chordSec = -1; std::vector<int> chordItems;   // beta 0.3.3: the chord card's section and its items (moved into the browser while it is open)
  bool chordInBrowser() const { return chordOn && host->browserOpen(); }
  Tables disp; uint64_t dispSig = ~0ull;
  ScopeSets scopeSets;   // beta 0.3: the raw layers of every oscillator that plays (the scope and the scalogram show the whole sound)
  ScopeLive scopeLive;   // beta 0.3.1: the live gains and window of the oscillators that play in the last voice (the displays move with the sound)
  std::map<int, Atom> atoms;
  // live data
  float liveGains[NB] = {}; float liveC = 0, liveW = 1, liveD = 0; int liveNote = -1, liveView = 0; bool liveSlot = false; uint32_t liveVoices = 0;
  uint32_t liveKeys[4] = {}; float meterL = 0, meterR = 0;
  // Okto MultiWave Synth: the chord sounding (root, notes), the last root, the selector-key edits seen; the pad under the mouse, the
  // string of the strum plate being touched (a note)
  int liveChordRoot = -1, liveChordLast = 60; uint32_t liveChordBits[4] = {}; uint32_t liveChordEdits = 0;
  int padHover = -1, plateTouch = -1;
  // interaction
  int hover = -1, drag = -1; float dragY = 0; double dragNorm = 0; bool dragShift = false, dragMoved = false;   // hover -2 = SAVE PRESET, -3 = PLAY DEMO
  int demoShown = -1;   // version 1.0.13: what the demo plays, as the audio thread said (SharedState::demoScene)
  int mouseNote = -1; int wheelDrag = -1;  // 0 bend, 1 mod

  double effZoom() const { const double z = host->zoom(); return z > 0 ? z : autoZ; }
  double scale() const override { return dpiScale * effZoom(); }
  // beta 0.3.2 (the panel did not fit on a 1080-pixel screen): while the zoom is "fit", the window is scaled down so that the whole panel (with the chord card when
  // CHORD MODE is on) is on the screen: 100 pixels of the screen's height are left for the window's bar and the host's own, never more than 100 % (a larger window is
  // the player's choice), never less than 50 %. MW_WORKAREA=WxH: developer tests (a screen of that size).
  void updateAuto() {
    if (host->zoom() > 0) return;
    int w = 0, h = 0;
    const std::wstring ov = envPath(L"MW_WORKAREA");
    if (!ov.empty()) { if (std::swscanf(ov.c_str(), L"%dx%d", &w, &h) != 2) w = h = 0; }
    else if (!workAreaOf(parentWin, w, h)) w = h = 0;
    if (w < 300 || h < 300) { autoZ = 1; return; }
    const double ds = dpiScale > 0 ? dpiScale : 1;
    double z = std::min({1.0, (h - 100 * ds) / (devH() * ds), (w - 30 * ds) / (kDeviceW * ds)});
    autoZ = std::max(0.5, std::floor(z * 100) / 100);
  }
  int pxW() const { return (int)std::lround((kDeviceW + (host->browserOpen() ? kBrowserW : 0)) * scale()); }   // + the browser
  float devH() const { return kDeviceH + (chordOn && !host->browserOpen() ? kChordH : 0); }   // the panel's logical height: CHORD MODE adds the chord card under the keyboard, unless the browser shows it (beta 0.3.3)
  int pxH() const { return (int)std::lround(devH() * scale()); }
  // beta 0.3.4: the accent of an oscillator's kind (0 subtractive, 1 additive): yellow / blue, or terracotta / turquoise while the TUNING switch is ARAB or TURK (orient)
  const OrientPal& opal() const { return kOrientPals[orientMode == 2 ? 1 : 0]; }
  uint32_t accentOf(int m) const { return orient ? (m == 0 ? opal().a : opal().b) : (m == 0 ? kAccentA : kAccentB); }
  uint32_t accent() const { return accentOf(mode); }

  void requestResize() {
    updateAuto();
    layoutChordItems();
    ViewRect r(0, 0, pxW(), pxH());
    reportedW = r.getWidth(); reportedH = r.getHeight();
    if (frame) frame->resizeView(this, &r);
    if (win) { win->setSize(r.getWidth(), r.getHeight()); win->invalidateAll(); }
  }

  void cleanup() {
    if (win) {
      if (mouseNote >= 0) noteOff(mouseNote);
      if (plateTouch >= 0) { plateOff(plateTouch); plateTouch = -1; }
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
    sig = (sig ^ (uint64_t)tableNeeds(v)) * 1099511628211ull;   // beta 0.3: also when an oscillator starts or stops playing
    if (force || sig != dispSig) { buildTables(v, false, disp); buildScopeSets(v, disp, scopeSets); dispSig = sig; }
    view = std::max(0, std::min(NS - 1, (int)jsRound(v[P_OSC_VIEW]))); mode = kSlots[view].mode;
    chordOn = v[P_CHORD_MODE] >= 0.5;
    orientMode = (int)jsRound(v[P_MT_MODE]); orient = orientMode != 0;
  }

  // a section shows for one oscillator (view) or always, and may need a parameter on / off (the chord card)
  bool sectionShown(const SectionDef& sd) const {
    if (sd.view >= 0 && sd.view != view) return false;
    return sd.vis < 0 || (lastPlain[sd.vis] >= 0.5) == sd.visOn;
  }
  bool visible(const Item& it) const {
    if (!sectionShown(kSections[it.section])) return false;
    // beta 0.6: a knob shown while a SYNC button is on (a note value) or off (seconds / hertz)
    return it.w->vis < 0 || (lastPlain[it.w->vis] >= 0.5) == it.w->visOn;
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
      const int oldView = view, oldOrientMode = orientMode; const bool oldChord = chordOn, oldOrient = orient;
      bool any = false, structural = false, lfoCard = false;
      for (int i = 0; i < kNumParams; i++) {
        double v = host->getPlain(i);
        if (v == lastPlain[i]) continue;
        lastPlain[i] = v; any = true;
        if (kParams[i].structural) structural = true;
        if (i == P_LFO_VIEW) lfoCard = true;   // beta 0.3: the LFO 2 | LFO 3 sub-tab shows another card
        for (size_t k = 0; k < items.size(); k++) if (items[k].w->param == i || items[k].w->vis == i) invalidateItem((int)k);
        // Okto MultiWave Synth: the pads, the chord shown, the strum plate and the keyboard's selector octave follow these
        if (i == P_CHORD_MODE || i == P_CHORD_TYPE || i == P_CHORD_OCT) for (int t : {W_CHORDPADS, W_CHORDNAME, W_STRUMPLATE, W_KEYBOARD}) invalidateType(t);
        if (i == P_MT_MODE || i == P_MT_SCALE || i == P_MT_TONIC) invalidateType(W_KEYBOARD);   // the keys the oriental tuning moves are marked
        for (int s = 0; s < NS; s++) if (i == kSlots[s].lvl) invalidateType(W_OSCTABS);   // beta 0.3: a lit dot = the oscillator is heard
        if (i == P_LFO2_AMT || i == P_LFO3_AMT) invalidateType(W_LFOTABS);   // beta 0.3.4: a lit dot = the LFO's amount is not 0
      }
      if (any) {
        rebuildDisplay(false);
        if (chordOn != oldChord) requestResize();   // CHORD MODE: the panel grows or shrinks
        if (structural || view != oldView || chordOn != oldChord || lfoCard || orient != oldOrient || orientMode != oldOrientMode) invalidateAll();   // (beta 0.3.4: a change of TUNING changes the colours of the whole panel)
        else for (int t : {W_SCOPE, W_SCALOGRAM, W_WINDOW, W_ADSR, W_LEDS, W_WHEELS}) invalidateType(t);
      }
    }
    // version 1.0.7: the preset box and the preset browser are repainted when what they show changed (the sound, its modified dot, the browser open or not,
    // the row and the bank it is in), not at every parameter edit: a knob dragged with the browser open used to repaint its 25 rows up to 30 times a second
    {
      const std::string shown = shownName();
      const bool dirty = host->presetDirty(), open = host->browserOpen();
      if (shown != lastShownName || dirty != lastShownDirty || open != lastShownOpen) { lastShownName = shown; lastShownDirty = dirty; lastShownOpen = open; invalidateType(W_PRESETS); }
      if (open) {
        const std::string key = host->userPresetName() + "|" + host->formerPresetName() + "|" + std::to_string(host->presetIndex());
        const int tab = bTab, cat = bCat, scroll = bScroll;
        bFollow();   // (it returns at once when the sound is the one the browser already follows)
        if (!browserWasOpen || key != lastBrowserKey || tab != bTab || cat != bCat || scroll != bScroll) { lastBrowserKey = key; invalidateLogical(bCard()); }
      }
      browserWasOpen = open;
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
      int n = sh->note.load(), vw = sh->view.load(); const bool sl = sh->slotLive.load(); uint32_t vo = sh->voices.load();
      if (c != liveC || w != liveW || d != liveD || n != liveNote || vw != liveView || sl != liveSlot) changed = true;
      liveC = c; liveW = w; liveD = d; liveNote = n; liveView = vw; liveSlot = sl;
      ScopeLive sNew; sNew.mask = sh->smask.load();
      for (int s = 0; s < NS; s++) { for (int b = 0; b < NB; b++) sNew.sg[s][b] = sh->sg[s][b].load(); for (int q = 0; q < 3; q++) sNew.win[s][q] = sh->swin[s][q].load(); }
      if (sNew.mask != scopeLive.mask || (sNew.mask && std::memcmp(&sNew, &scopeLive, sizeof sNew) != 0)) changed = true;
      scopeLive = sNew;
      if (changed) { invalidateType(W_SCOPE); invalidateType(W_SCALOGRAM); invalidateType(W_WINDOW); }
      if (vo != liveVoices) { liveVoices = vo; invalidateType(W_LEDS); }
      bool kc = false;
      for (int k = 0; k < 4; k++) { uint32_t b = sh->keys[k].load(); if (b != liveKeys[k]) kc = true; liveKeys[k] = b; }
      if (kc) { invalidateType(W_KEYBOARD); invalidateType(W_STRUMPLATE); }
      // Okto MultiWave Synth: the chord sounding, and a chord type chosen by a selector key in the processor (hosts that do not
      // forward the processor's parameter changes to the controller: the editor does it here, once per edit)
      const int cr = sh->chordRoot.load(), cl = sh->chordLast.load();
      bool cc = cr != liveChordRoot || cl != liveChordLast;
      for (int k = 0; k < 4; k++) { uint32_t b = sh->chordBits[k].load(); if (b != liveChordBits[k]) cc = true; liveChordBits[k] = b; }
      liveChordRoot = cr; liveChordLast = cl;
      if (cc) { invalidateType(W_CHORDNAME); invalidateType(W_STRUMPLATE); }
      const uint32_t ce = sh->chordTypeEdits.load();
      if (ce != liveChordEdits) {
        liveChordEdits = ce;
        const int ct = sh->chordType.load();
        if (ct >= 0 && ct < kNumChords && ct != (int)jsRound(host->getPlain(P_CHORD_TYPE))) { host->setPlainGesture(P_CHORD_TYPE, ct); }
      }
      const int ds = sh->demoScene.load();   // version 1.0.13: the demo started, moved to the next preset of the tour, or stopped
      if (ds != demoShown) { demoShown = ds; invalidateLogical(kDemoBtn); invalidateType(W_PRESETS); }
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
  // a dark translucent control (selector, stepper, preset box, button): fill + white 20 % edge; hot: the hovered look
  void inset(Canvas& g, R r, float rad = 9, bool hot = false) {
    g.fillRR(r, rad, Brush(hot ? hotC() : insetC())); g.strokeRR(R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, rad, Pen(edgeC(hot), 1));
  }
  // a glass card: translucent white fading downwards, a 1 px white 20 % edge, a lit top edge
  void glass(Canvas& g, R r, float rad = 14) {
    g.fillRR(r, rad, Brush(Pt{0, r.y}, Pt{0, r.y + r.h}, argb(26, 255, 255, 255), argb(12, 255, 255, 255)));
    g.strokeRR(R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, rad, Pen(edgeC(), 1));
    g.line(Pt{r.x + rad, r.y + 1.5f}, Pt{r.x + r.w - rad, r.y + 1.5f}, Pen(argb(71, 255, 255, 255), 1));
  }
  void screen(Canvas& g, R r) {
    fillRR(g, r, 10, Brush(argb(115, 0, 0, 0))); g.strokeRR(R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, 10, Pen(edgeC(), 1));
  }
  void pill(Canvas& g, const std::wstring& s, float x, float y, bool right, Col c) {
    float w = g.textWidth(s, 9.5f, true) + 6, x0 = right ? x - w + 4 : x - 4;
    g.fillRect(R{x0, y - 11, w, 14.f}, argb(140, 0, 0, 0));
    text(g, s, R{x0 + 1, y - 11, w, 14}, 9.5f, true, c, 0);
  }

  // ---------------------------------------------------------------- the Crépuscule backdrop
  // The panel is a diagonal gradient (CSS 135 degrees: t = (x + y) / (w + h), violet to amber in five stops) under three soft colour blobs, the web app's #device::before (radial
  // gradients, opacity .45, blurred: a smooth fall-off stands for the blur). The preset browser has its own (160 degrees). Each is computed once into an opaque ARGB image at half
  // resolution (it is smooth) and drawn with Canvas::pixels; the glass cards are translucent fills over it.
  struct Stop { float t; uint32_t c; };
  struct Blob { float cx, cy, rx, ry; uint32_t c; };
  struct Backdrop { int w = 0, h = 0, key = 0; std::vector<uint32_t> px; };   // w, h: the image's size (half the logical size); key: what it was made for
  static void makeBackdrop(Backdrop& b, int lw, int lh, float angleDeg, const Stop* st, int ns, const Blob* bl, int nb) {
    b.w = (lw + 1) / 2; b.h = (lh + 1) / 2; b.px.assign((size_t)b.w * b.h, 0);
    const float th = angleDeg * (float)PI / 180, dx = std::sin(th), dy = -std::cos(th), len = std::fabs(lw * dx) + std::fabs(lh * dy);
    for (int y = 0; y < b.h; y++) for (int x = 0; x < b.w; x++) {
      const float X = (x + 0.5f) * 2, Y = (y + 0.5f) * 2;
      const float t = std::min(1.f, std::max(0.f, ((X - lw / 2.f) * dx + (Y - lh / 2.f) * dy) / len + 0.5f));
      int k = 0; while (k + 2 < ns && t > st[k + 1].t) k++;
      const float u = std::min(1.f, std::max(0.f, (t - st[k].t) / (st[k + 1].t - st[k].t)));
      float c[3];
      for (int ch = 0; ch < 3; ch++) { const int sh = 16 - 8 * ch; c[ch] = ((st[k].c >> sh) & 255) * (1 - u) + ((st[k + 1].c >> sh) & 255) * u; }
      // the blobs (the last listed is the bottom one): premultiplied colour and alpha of the layer, then the layer's opacity .45 over the gradient
      float pc[3] = {0, 0, 0}, pa = 0;
      for (int i = nb - 1; i >= 0; i--) {
        const float ex = (X / lw - bl[i].cx) / bl[i].rx, ey = (Y / lh - bl[i].cy) / bl[i].ry, d = std::sqrt(ex * ex + ey * ey);
        float a = std::max(0.f, 1.f - d / 0.6f); a = a * a * (3 - 2 * a);   // transparent at 60 % of the radius, softened like the blur
        for (int ch = 0; ch < 3; ch++) pc[ch] = ((bl[i].c >> (16 - 8 * ch)) & 255) * a + pc[ch] * (1 - a);
        pa = a + pa * (1 - a);
      }
      uint32_t out = 0xff000000u;
      for (int ch = 0; ch < 3; ch++) out |= (uint32_t)std::lround(std::min(255.f, std::max(0.f, c[ch] * (1 - 0.45f * pa) + 0.45f * pc[ch]))) << (16 - 8 * ch);
      b.px[(size_t)y * b.w + x] = out;
    }
  }
  // draws the part of an image (its pixel (0,0) at org, each pixel 2 x 2 logical units) that meets dirty
  static void drawHalf(Canvas& g, const Backdrop& b, R org, R dirty) {
    const int x0 = std::max(0, (int)std::floor((dirty.x - org.x) / 2)), y0 = std::max(0, (int)std::floor((dirty.y - org.y) / 2));
    const int x1 = std::min(b.w, (int)std::ceil((dirty.x + dirty.w - org.x) / 2)), y1 = std::min(b.h, (int)std::ceil((dirty.y + dirty.h - org.y) / 2));
    if (x1 <= x0 || y1 <= y0) return;
    std::vector<uint32_t> sub((size_t)(x1 - x0) * (y1 - y0));
    for (int y = y0; y < y1; y++) std::memcpy(sub.data() + (size_t)(y - y0) * (x1 - x0), b.px.data() + (size_t)y * b.w + x0, (size_t)(x1 - x0) * 4);
    g.pixels(sub.data(), x1 - x0, y1 - y0, R{org.x + x0 * 2.f, org.y + y0 * 2.f, (x1 - x0) * 2.f, (y1 - y0) * 2.f});
  }
  Backdrop bgPanel, bgBrowser;
  void drawBackdrop(Canvas& g, R dirty) {
    g.fillRect(dirty, Brush(rgb(kPage)));
    const int H = (int)devH(), key = H * 4 + (orient ? 1 + (orientMode == 2 ? 1 : 0) : 0);   // (version 1.0.9: the image is made again when the tuning changes)
    if (bgPanel.key != key) {
      static const Stop st[5] = {{0, 0x2b0f2e}, {0.25f, 0x5a1f4a}, {0.55f, 0x8a3a3a}, {0.85f, 0xc25a2a}, {1, 0xe08a2a}};
      static const Blob bl[3] = {{0.08f, 0.15f, 0.56f, 0.42f, 0xff7a3d}, {0.85f, 0.08f, 0.49f, 0.42f, 0x7a3dff}, {0.57f, 1.06f, 0.63f, 0.49f, 0xff3d8a}};
      if (orient) {   // version 1.0.9: ARAB / TURK: the panel in the colours of the pattern (ORIENT.g and ORIENT.glow in tools/spec.js; the web app's #device.orient)
        const OrientPal& P = opal();
        const Stop os[5] = {{0, P.g[0]}, {0.25f, P.g[1]}, {0.55f, P.g[2]}, {0.85f, P.g[3]}, {1, P.g[4]}};
        const Blob ob[3] = {{0.08f, 0.15f, 0.56f, 0.42f, P.glow[0]}, {0.85f, 0.08f, 0.49f, 0.42f, P.glow[1]}, {0.57f, 1.06f, 0.63f, 0.49f, P.glow[2]}};
        makeBackdrop(bgPanel, (int)kDeviceW, H, 135, os, 5, ob, 3);
      } else makeBackdrop(bgPanel, (int)kDeviceW, H, 135, st, 5, bl, 3);
      bgPanel.key = key;
    }
    const R panel{0, 0, kDeviceW, (float)H};
    if (!panel.hits(dirty)) return;
    g.pushClipRR(panel, 18);   // rounded corners, as the web app's panel
    drawHalf(g, bgPanel, R{0, 0, 0, 0}, dirty);
    g.popClip();
  }

  // ---------------------------------------------------------------- paint
  // the window has set its scale, clip and smoothing; dirty is the logical area to draw again
  void paint(Canvas& g, R dirty) override {
    drawBackdrop(g, dirty);   // the page colour, then the panel's gradient and blobs
    for (int si = 0; si < kNumSections; si++) {
      const SectionDef& sd = kSections[si];
      if (!sectionShown(sd)) continue;
      if (si == chordSec && chordInBrowser()) continue;   // drawn with the browser (drawChordInBrowser)
      R r{sd.x, sd.y, sd.w, sd.h};
      if (!r.hits(dirty)) continue;
      if (sd.title[0] == 0) { if (std::strcmp(sd.id, "oscframe") == 0) drawOscFrame(g, r); continue; }   // beta 0.3: the frame round the oscillator cards
      glass(g, r);
      if (sd.tabbed) continue;   // beta 0.3.4: the LFO 2/3 card has a tab bar instead of a title (its lfotabs item draws it)
      if (sd.vtitle) {   // beta 0.3.3: the title is a vertical strip at the left of the card
        g.line(Pt{r.x + 23.5f, r.y + 6}, Pt{r.x + 23.5f, r.y + r.h - 6}, Pen(edgeC(), 1));
        g.textVertical(toW(sd.title), R{r.x + 1, r.y + 1, 22, r.h - 2}, 9.5f, true, std::strcmp(sd.id, "play") == 0 ? rgb(accent()) : rgb(kTitle));
        continue;
      }
      std::string t = sd.title; size_t dot = t.find(" \xC2\xB7 ");
      if (dot != std::string::npos) {
        std::wstring a = toW(t.substr(0, dot)), b = toW(t.substr(dot));
        const float aw = g.textWidth(a, 10.5f, true);
        text(g, a, R{r.x + 12, r.y + 4, 300, 16}, 10.5f, true, rgb(accent()), 0);
        text(g, b, R{r.x + 12 + aw - 3, r.y + 4, 400, 16}, 10.5f, true, rgb(kTitle), 0);
      } else text(g, toW(t), R{r.x + 12, r.y + 4, 300, 16}, 10.5f, true, rgb(kTitle), 0);
    }
    const bool chordSide = chordInBrowser();
    for (size_t k = 0; k < items.size(); k++) {
      const Item& it = items[k];
      if (chordSide && it.section == chordSec) continue;   // drawn with the browser
      if (!visible(it) || !it.r.hits(dirty)) continue;
      drawItem(g, (int)k);
    }
    // value bubble for small knobs and drawbars
    int b = drag >= 0 ? drag : hover;
    if (b >= 0 && visible(items[b]) && (items[b].w->type == W_KNOBS || items[b].w->type == W_DRAWBAR)) drawBubble(g, items[b]);
    drawSaveBtn(g);
    drawDemoBtn(g);
    if (host->browserOpen() && bCard().hits(dirty)) { drawBrowser(g); if (chordSide) drawChordInBrowser(g, dirty); }   // the browser (a copy of the library, hundreds of reads) only when its part is drawn again
  }

  void drawBubble(Canvas& g, const Item& it) {
    const ParamDef& p = kParams[it.w->param];
    std::wstring s = toW(std::string(it.w->type == W_DRAWBAR ? "Band " : "") + (it.w->type == W_DRAWBAR ? std::string(p.shortName) + " level" : p.name) + ": " + formatValue(p, plainOf(it.w->param)));
    float w = g.textWidth(s, 11, false) + 12, x = it.r.x + it.r.w / 2 - w / 2;
    x = std::max(4.0f, std::min(kDeviceW - w - 4, x));
    R r{x, it.r.y - 26, w, 20};
    fillRR(g, r, 7, rgb(0x1c0a20, 240)); strokeRR(g, r, 7, argb(71, 255, 255, 255));
    text(g, s, r, 11, false, rgb(kText));
  }

  void drawItem(Canvas& g, int idx) {
    const Item& it = items[idx];
    switch (it.w->type) {
      case W_KNOBL: case W_KNOBM: case W_KNOBS: case W_KNOBT: drawKnob(g, idx); break;
      case W_SEG: drawSeg(g, it); break;
      case W_OSCTABS: drawOscTabs(g, it); break;
      case W_LFOTABS: drawLfoTabs(g, it); break;
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
      case W_MANUAL: drawManualBtn(g, it); break;
      case W_METER: drawMeter(g, it.r); break;
      case W_ZOOM: drawZoom(g, it.r); break;
      case W_MENU: drawMenu(g, idx); break;
      case W_CREDIT: drawCredit(g, it.r); break;
      case W_TOGGLE: drawToggle(g, idx); break;
      case W_LABEL: {   // beta 0.6: SCALOGRAM
        const std::wstring s = toW(it.w->text ? it.w->text : "");
        text(g, s, it.r, 10.5f, true, rgb(kDim), 0);
        break;
      }
      case W_CHORDPADS: drawChordPads(g, idx); break;
      case W_CHORDNAME: drawChordName(g, it.r); break;
      case W_STRUMPLATE: drawStrumPlate(g, it.r); break;
      default: break;
    }
  }

  // angle 0 = 12 o'clock, clockwise, radians -> canvas degrees (0 = 3 o'clock, clockwise)
  static float gdiDeg(double a) { return (float)(a * 180 / PI - 90); }

  // the source width only means something for PULSE and TRIANGLE, the seed for RANDOM (every oscillator)
  bool disabledParam(int id) {
    for (int s = 0; s < NS; s++) {
      if (id == kSlots[s].width) { int w = (int)jsRound(plainOf(kSlots[s].wave)); return !(w == 2 || w == 3); }
      if (id == kSlots[s].seed) return (int)jsRound(plainOf(kSlots[s].pattern)) != 5;
    }
    return false;
  }

  void drawKnob(Canvas& g, int idx) {
    const Item& it = items[idx];
    const ParamDef& p = kParams[it.w->param];
    bool big = it.w->type == W_KNOBL, small = it.w->type == W_KNOBS, tiny = it.w->type == W_KNOBT;
    float d = big ? 42.f : small ? 30.f : tiny ? 26.f : 38.f, cx = it.r.x + it.r.w / 2, cy = it.r.y + (big ? 22.f : small ? 18.f : tiny ? 15.f : 20.f), r = d / 2;   // beta 0.3.4: the big knobs are 42 px discs (were 56)
    float ar = r + (small || tiny ? 2.f : 4.f), sw = small || tiny ? 2.5f : 3.f;
    int alpha = disabledParam(it.w->param) ? 90 : 255;
    double v = plainOf(it.w->param), n = toNorm(p, v);
    const double A0 = -0.75 * PI, A1 = 0.75 * PI, a = A0 + (A1 - A0) * n;
    const R ring{cx - ar, cy - ar, 2 * ar, 2 * ar};
    g.arc(ring, gdiDeg(A0), 270, Pen(argb(46 * alpha / 255, 255, 255, 255), sw).caps());
    bool bip = p.min < 0 && p.max > 0;
    double from = bip ? A0 + (A1 - A0) * toNorm(p, 0) : A0;
    double lo = std::min(from, a), hi = std::max(from, a);
    if (hi - lo > 1e-3) g.arc(ring, gdiDeg(lo), (float)((hi - lo) * 180 / PI), Pen(rgb(accent(), alpha), sw).caps());
    const R body{cx - r + 1, cy - r + 1, 2 * r - 2, 2 * r - 2};
    g.fillEllipse(body, Brush(Pt{cx - r, cy - r}, Pt{cx + r, cy + r}, argb(140 * alpha / 255, 255, 255, 255), argb(31 * alpha / 255, 255, 255, 255)));
    g.strokeEllipse(body, Pen(argb(89 * alpha / 255, 255, 255, 255), 1.5f));
    g.strokeEllipse(R{cx - r + 4, cy - r + 4, 2 * r - 8, 2 * r - 8}, Pen(argb(alpha / 20, 255, 255, 255), 1));
    float r0 = r * 0.25f, r1 = r - 4;
    g.line(Pt{cx + r0 * (float)std::sin(a), cy - r0 * (float)std::cos(a)}, Pt{cx + r1 * (float)std::sin(a), cy - r1 * (float)std::cos(a)},
           Pen(rgb(0xffffff, alpha), big ? 2.6f : tiny ? 2.f : 2.2f).caps());
    if (!small) {
      bool showVal = (hover == idx || drag == idx);
      // beta 0.3.4, style 4 (the LFO SHAPE): a knob with a few positions, its choice (SINE TRI SAW SQR S&H) written under it in the accent colour, hovered or not
      const bool named = it.w->style == 4 && p.choiceShort;
      // beta 0.6: a note value (tempo sync) is its own label: "1/8D"
      std::wstring s = named ? toW(p.choiceShort[(int)jsRound(v - p.min)]) : showVal ? toW(formatValue(p, v)) : it.w->style == 2 && p.choiceShort ? toW(p.choiceShort[(int)jsRound(v - p.min)]) : toW(p.shortName);
      R lr{it.r.x - 8, it.r.y + (big ? 47.f : tiny ? 31.f : 42.f), it.r.w + 16, 14};
      text(g, s, lr, tiny ? 8.5f : 9.5f, true, showVal || named ? rgb(accent(), alpha) : rgb(kDim, alpha));
    }
  }

  void drawSeg(Canvas& g, const Item& it) {
    const ParamDef& p = kParams[it.w->param];
    bool engine = it.w->style == 1;
    int n = p.numChoices, cur = (int)jsRound(plainOf(it.w->param));
    if (it.w->style == 3) {   // beta 0.3.4: underlined (the LFO 1 wave selector): no frame, a hairline under all, the wave shown in the accent colour with a 2 px line under it
      const float bw = it.r.w / n, by = it.r.y + it.r.h;
      g.line(Pt{it.r.x, by - 0.5f}, Pt{it.r.x + it.r.w, by - 0.5f}, Pen(edgeC(), 1));
      for (int k = 0; k < n; k++) {
        const R b{it.r.x + k * bw, it.r.y, bw, it.r.h - 2};
        if (k == cur) g.fillRect(R{b.x, by - 2, bw, 2}, rgb(accent()));
        text(g, toW(p.choiceShort[k]), b, 10.f, true, k == cur ? rgb(accent()) : rgb(kDim));
      }
      return;
    }
    inset(g, it.r, 9.f);
    float pad = engine ? 3.f : 2.f, gap = 2, bw = (it.r.w - 2 * pad - gap * (n - 1)) / n;
    for (int k = 0; k < n; k++) {
      R b{it.r.x + pad + k * (bw + gap), it.r.y + pad, bw, it.r.h - 2 * pad};
      bool on = k == cur;
      if (on) {
        uint32_t c = engine ? (k < 2 ? kAccentA : kAccentB) : accent();   // the old oscillator tabs (beta 0.3: ENGINE A / B and the folder tabs replaced them): teal then orange
        fillRR(g, b, 7, rgb(c));
      }
      text(g, toW(p.choiceShort[k]), b, engine ? 11.f : 10.f, true, on ? rgb(kOnAccent) : rgb(kDim));
    }
  }

  // beta 0.3: the plate behind the cards of the oscillator shown, in its colour: an L (OSC MIX and the SCOPE, common to every oscillator, sit outside it, at the top
  // right). The corners are rounded (a quarter circle is drawn as a short polyline), the top-left one is square: the first folder tab joins it.
  const SectionDef* secById(const char* id) const { for (int i = 0; i < kNumSections; i++) if (std::strcmp(kSections[i].id, id) == 0) return &kSections[i]; return nullptr; }
  static void roundedPoly(const std::vector<Pt>& p, const std::vector<float>& rad, std::vector<Pt>& out) {
    const int n = (int)p.size();
    for (int i = 0; i < n; i++) {
      const Pt p0 = p[(i + n - 1) % n], p1 = p[i], p2 = p[(i + 1) % n];
      const float l1 = std::hypot(p0.x - p1.x, p0.y - p1.y), l2 = std::hypot(p2.x - p1.x, p2.y - p1.y), r = std::min(rad[i], std::min(l1, l2) / 2);
      const Pt a{p1.x + (p0.x - p1.x) / l1 * r, p1.y + (p0.y - p1.y) / l1 * r}, b{p1.x + (p2.x - p1.x) / l2 * r, p1.y + (p2.y - p1.y) / l2 * r};
      if (r <= 0) { out.push_back(p1); continue; }
      for (int k = 0; k <= 8; k++) {
        const float t = k / 8.f, u = 1 - t;
        out.push_back(Pt{u * u * a.x + 2 * u * t * p1.x + t * t * b.x, u * u * a.y + 2 * u * t * p1.y + t * t * b.y});
      }
    }
  }
  void drawOscFrame(Canvas& g, R s) {
    const SectionDef *tone = secById("tone_a1"), *mix = secById("mix"), *flt = secById("filter_a1");
    if (!tone || !mix || !flt) return;
    // the notch: half way between the tone card and OSC MIX, half way between the bottom of OSC MIX / SCOPE and the second row
    const float xl = s.x + 0.5f, xr = s.x + s.w - 0.5f, yt = s.y + 38.5f, yb = s.y + s.h - 0.5f;
    const float xn = (tone->x + tone->w + mix->x) / 2, yn = (mix->y + mix->h + flt->y) / 2;
    // Crépuscule: one outline for the folder tab of the oscillator shown and the plate: the accent colour, solid, 2.5 px, no glow, and a flat tint of 10 % inside (the 1.0.5 "trail of light" is gone)
    const float tabL = std::max(s.x + view * 182.f, xl), tabR = s.x + view * 182.f + 176.f, tt = s.y + 0.5f;
    std::vector<Pt> corners; std::vector<float> rad;
    auto add = [&](float x, float y, float r) { corners.push_back(Pt{x, y}); rad.push_back(r); };
    if (tabL > xl + 0.5f) { add(xl, yt, 0); add(tabL, yt, 0); } else add(xl, tt, 9);
    if (tabL > xl + 0.5f) add(tabL, tt, 9);
    add(tabR, tt, 9); add(tabR, yt, 0); add(xn, yt, 12); add(xn, yn, 12); add(xr, yn, 12); add(xr, yb, 12); add(xl, yb, 12);
    std::vector<Pt> poly; roundedPoly(corners, rad, poly);
    const uint32_t ac = accentOf(kSlots[view].mode);
    g.fillPolygon(poly.data(), (int)poly.size(), Brush(rgb(ac, 26)));
    poly.push_back(poly.front());
    g.lines(poly.data(), (int)poly.size(), Pen(rgb(ac), 2.5f).join());
  }

  // beta 0.3: the three folder tabs OSC1 · SUBTRACTIVE | OSC2 · SUBTRACTIVE | OSC3 · ADDITIVE (176 x 40 px every 182): the colour of the engine (A1 A2 yellow,
  // B1 blue); the tab of the oscillator shown is filled and joins the plate. A lit dot says the oscillator is heard (its level is above 0).
  void drawOscTabs(Canvas& g, const Item& it) {
    for (int s = 0; s < NS; s++) {
      const R t{it.r.x + s * 182.f, it.r.y, 176.f, 40.f};
      const int mode_s = kSlots[s].mode;
      const bool on = s == view, heard = plainOf(kSlots[s].lvl) > 0;
      const float rad = 14;
      const Col ac = rgb(accentOf(mode_s)), dark = rgb(kOnAccent);   // (beta 0.3.4: terracotta / turquoise while the TUNING switch is ARAB or TURK)
      const float th = on ? 40.f : 38.f;
      const Brush fill = on ? Brush(ac) : Brush(argb(31, 0, 0, 0));
      fillRR(g, R{t.x, t.y, t.w, 2 * rad + 2}, rad, fill);   // rounded on top, square below
      g.fillRect(R{t.x, t.y + rad, t.w, th - rad}, fill);
      if (!on) {
        Pen pen(edgeC(), 2.f);
        const float x0 = t.x + 1, y0 = t.y + 1, x1 = t.x + t.w - 1, y1 = t.y + th;
        g.arc(R{x0, y0, 2 * rad, 2 * rad}, 180, 90, pen);
        g.line(Pt{x0 + rad, y0}, Pt{x1 - rad, y0}, pen);
        g.arc(R{x1 - 2 * rad, y0, 2 * rad, 2 * rad}, 270, 90, pen);
        g.line(Pt{x0, y0 + rad}, Pt{x0, y1}, pen);
        g.line(Pt{x1, y0 + rad}, Pt{x1, y1}, pen);
      }
      g.fillEllipse(R{t.x + 14, t.y + 15, 8.f, 8.f}, heard ? (on ? dark : ac) : (on ? rgb(kOnAccent, 90) : argb(77, 255, 255, 255)));
      const Col c1 = on ? dark : rgb(kDim), c2 = on ? rgb(kOnAccent, 190) : rgb(kFaint);
      // version 1.0.12: "OSC1" (it read "OSC1 A1"), and SUBTRACTIVE / ADDITIVE 20 % bigger (8.5 -> 10.2 px)
      text(g, std::wstring(L"OSC") + std::to_wstring(s + 1), R{t.x + 32, t.y + 4, t.w - 38, 16}, 12.f, true, c1, 0);
      text(g, mode_s == 0 ? L"SUBTRACTIVE" : L"ADDITIVE", R{t.x + 32, t.y + 20, t.w - 38, 16}, 10.2f, true, c2, 0);
    }
  }

  // beta 0.3.4: the LFO 2 | LFO 3 tabs along the top of the LFO 2/3 card (the owner's mock-up Q1): a darker bar with the two tabs, 58 x 22 px at x 6 and 66, folder tabs like the
  // oscillators'; the tab of the LFO shown is filled with the accent colour. A lit dot says the LFO is heard (its amount is not 0).
  void drawLfoTabs(Canvas& g, const Item& it) {
    const R bar{it.r.x + 1, it.r.y + 1, it.r.w - 2, 25.f};
    fillRR(g, R{bar.x, bar.y, bar.w, 20.f}, 13, argb(46, 0, 0, 0));   // rounded on top, square below (the bar's lower edge is a hairline)
    g.fillRect(R{bar.x, bar.y + 13, bar.w, 12.f}, argb(46, 0, 0, 0));
    g.line(Pt{bar.x, bar.y + 24.5f}, Pt{bar.x + bar.w, bar.y + 24.5f}, Pen(edgeC(), 1));
    const int cur = (int)jsRound(plainOf(P_LFO_VIEW));
    for (int k = 0; k < 2; k++) {
      const R t{it.r.x + 6.f + k * 60.f, it.r.y + 3.f, 58.f, 22.f};
      const bool on = k == cur, heard = std::fabs(plainOf(k == 0 ? P_LFO2_AMT : P_LFO3_AMT)) > 0.001;
      const Col ac = rgb(accent()), dark = rgb(kOnAccent);
      const float rad = 10;
      const Brush fill = on ? Brush(ac) : Brush(argb(56, 0, 0, 0));
      fillRR(g, R{t.x, t.y, t.w, 2 * rad + 2}, rad, fill);   // rounded on top, square below
      g.fillRect(R{t.x, t.y + rad, t.w, t.h - rad}, fill);
      if (!on) {
        Pen pen(edgeC(), 2.f);
        const float x0 = t.x + 1, y0 = t.y + 1, x1 = t.x + t.w - 1, y1 = t.y + t.h;
        g.arc(R{x0, y0, 2 * rad, 2 * rad}, 180, 90, pen);
        g.line(Pt{x0 + rad, y0}, Pt{x1 - rad, y0}, pen);
        g.arc(R{x1 - 2 * rad, y0, 2 * rad, 2 * rad}, 270, 90, pen);
        g.line(Pt{x0, y0 + rad}, Pt{x0, y1}, pen);
        g.line(Pt{x1, y0 + rad}, Pt{x1, y1}, pen);
      }
      g.fillEllipse(R{t.x + 7, t.y + 8, 8.f, 8.f}, heard ? (on ? dark : ac) : (on ? rgb(kOnAccent, 77) : argb(77, 255, 255, 255)));
      text(g, std::wstring(L"LFO ") + std::to_wstring(k + 2), R{t.x + 19, t.y + 2, t.w - 19, 20.f}, 10.f, true, on ? dark : rgb(kDim), 0);
    }
  }

  // (version 1.0.11: the PLAY card has no oriental dress any more, a card like the others in ARAB and TURK: the pattern and its drawing are gone; the colours of the tuning stay on the panel)

  void drawStep(Canvas& g, const Item& it) {
    const ParamDef& p = kParams[it.w->param];
    inset(g, it.r, 9);
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
    fillRR(g, tr, 5, Brush(insetC()));
    float fh = (float)(v * tr.h);
    if (fh > 0.5f)
      g.fillRect(R{tr.x + 1, tr.y + tr.h - fh, tr.w - 2, fh}, Brush(Pt{0, tr.y + tr.h - fh - 1}, Pt{0, tr.y + tr.h + 1}, rgb(accent(), 220), rgb(accent(), 90)));
    strokeRR(g, tr, 5, edgeC());
    float cy = it.r.y + (float)((1 - v) * (it.r.h - 10));
    fillRR(g, R{it.r.x, cy, it.r.w, 10}, 3, Brush(Pt{0, cy}, Pt{0, cy + 10}, rgb(0xf1f4f8), rgb(0xb9c1cc)));
    bool hot = hover == idx || drag == idx;
    text(g, toW(kParams[it.w->param].shortName), R{it.r.x - 4, it.r.y + it.r.h + 2, it.r.w + 8, 14}, 9.5f, true, hot ? rgb(accent()) : rgb(kDim));
  }

  void gainsForDisplay(double* g, double& c, double& w, double& d, int& note) {
    if (liveNote >= 0 && liveSlot && liveView == view && host->sharedState()) {
      for (int b = 0; b < NB; b++) g[b] = liveGains[b];
      c = liveC; w = liveW; d = liveD; note = liveNote; return;
    }
    double v[kNumParams]; currentParams(v);
    const SlotDef& k = kSlots[view];
    staticGains(v, g); c = v[k.pcen]; w = v[k.pwid]; d = v[k.pdep]; note = -1;
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

  // beta 0.3: the whole sound: one cycle of the mix of every oscillator that plays (and the sub oscillator) at the reference note C4
  void drawScope(Canvas& g, R r) {
    const Pen grid(argb(13, 255, 255, 255), 1);
    for (int k = 1; k < 4; k++) g.line(Pt{r.x + r.w * k / 4, r.y + 4}, Pt{r.x + r.w * k / 4, r.y + r.h - 4}, grid);
    g.line(Pt{r.x, r.y + r.h / 2}, Pt{r.x + r.w, r.y + r.h / 2}, Pen(argb(23, 255, 255, 255), 1));
    double v[kNumParams]; currentParams(v);
    std::vector<double> y(N);
    globalCycle(v, scopeSets, y.data(), &scopeLive);
    double peak = 0.25;
    for (int i = 0; i < N; i++) peak = std::max(peak, std::fabs(y[i]));
    const double sy = (r.h / 2 - 8) / peak;
    polyline(g, y.data(), r, sy, rgb(accent()), 2, true);
    std::wstring names; int nA = 0, nB = 0;
    for (int s = 0; s < NS; s++) {
      const int ord = kSlots[s].mode == 0 ? ++nA : ++nB;
      if (scopeSets.mask & (1 << s)) names += (names.empty() ? L"" : L" + ") + std::wstring(kSlots[s].mode == 0 ? L"A" : L"B") + std::to_wstring(ord);
    }
    if (v[P_SUB_LEVEL] > 0) names += (names.empty() ? L"" : L" + ") + std::wstring(L"SUB");
    if (names.empty()) names = L"NO OSCILLATOR";
    pill(g, names + L" · ONE CYCLE OF THE MIX", r.x + 8, r.y + 14, false, rgb(0xc8d2e1, 160));
    if (scopeLive.mask && liveNote >= 0) pill(g, noteName(liveNote) + L" · LIVE", r.x + r.w - 8, r.y + 14, true, rgb(accent()));
  }

  // beta 0.3: the whole sound: the atoms of every oscillator that plays (root of the sum of the squares of what each one shows)
  void drawScalogram(Canvas& g, R r) {
    const float lm = 26, pw = r.w - lm - 4, rh = (r.h - 6) / NB, top = r.y + 3;
    for (int b = 1; b <= NB; b++)
      text(g, L"B" + std::to_wstring(b), R{r.x, top + (NB - b) * rh, lm - 4, rh}, 8.5f, true, argb(102, 200, 210, 225), 2);
    double v[kNumParams]; currentParams(v);
    ScopeBand bands[NS]; const int nb = scopeBands(v, scopeSets, bands, &scopeLive);
    int PW = (int)pw;
    std::vector<uint32_t> img((size_t)PW * NB);
    uint32_t ac = accent(); int ar = (ac >> 16) & 255, ag = (ac >> 8) & 255, ab = ac & 255;
    for (int b = 1; b <= NB; b++) {
      int n = 1 << (b - 1);
      uint32_t* row = img.data() + (size_t)(NB - b) * PW;
      for (int x = 0; x < PW; x++) {
        int k0 = (int)((double)x / PW * n), k1 = std::max(k0 + 1, (int)((double)(x + 1) / PW * n));
        double t = 0;
        for (int k = k0; k < k1 && k < n; k++) {
          double e2 = 0;
          for (int o = 0; o < nb; o++) { const double c = std::fabs(bands[o].coeffs[n + k]) * bands[o].sc[b - 1]; e2 += c * c; }
          const double a = std::sqrt(e2);
          if (a > 0) t = std::max(t, std::min(1.0, std::max(0.0, (20 * std::log10(a) + 60) / 60)));
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
  }

  void drawAtom(Canvas& g, R r) {
    int wi = (int)jsRound(plainOf(kSlots[view].wavelet));
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
    const SlotDef& k = kSlots[view];
    sourceCycle((int)jsRound(plainOf(k.wave)), plainOf(k.width), raw.data(), plainOf(k.phase));   // shifted by SOURCE PHASE
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
    int base = it.w->env == 0 ? P_AMP_A : it.w->env == 1 ? P_MOD_A : it.w->param;   // the oscillator's own envelope: its four parameters in a row
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
      g.fillEllipse(R{x - 4, y - 4, 8.f, 8.f}, on ? rgb(accent()) : avail ? argb(120, 0, 0, 0) : argb(60, 0, 0, 0));
    }
  }

  // beta 0.6: the effects in the order of the sound; the delay's title leaves room for its SYNC button
  // version 1.0.13 (the owner could not read them: grey at 42 %, 9 px): in the accent colour of the card titles, 10 px
  void drawFxHeads(Canvas& g, R r) {
    struct H { const wchar_t* t; float x, w, lw; } hs[] = {
        {L"SATURATION", 8, 60, 60}, {L"CHORUS", 64, 156, 156}, {L"PING-PONG DELAY", 214, 118, 162}, {L"REVERB", 376, 104, 104}, {L"PUNCH", 480, 60, 60}};   // (version 1.0.16: PUNCH)
    const Pen ln(argb(20, 255, 255, 255), 1);
    for (auto& h : hs) {
      text(g, h.t, R{r.x + h.x, r.y, h.w, 16}, 10, true, rgb(accent()));
      g.line(Pt{r.x + h.x + 4, r.y + 17.5f}, Pt{r.x + h.x + h.lw - 4, r.y + 17.5f}, ln);
    }
  }
  // beta 0.6: an on / off button (the SYNC of the delay and the LFOs), lit when on
  void drawToggle(Canvas& g, int idx) {
    const Item& it = items[idx];
    const bool on = plainOf(it.w->param) >= 0.5, hot = hover == idx;
    const float tr = std::min(9.f, it.r.h / 2);
    fillRR(g, it.r, tr, Brush(on ? rgb(accent()) : hot ? hotC() : insetC()));
    strokeRR(g, R{it.r.x + 0.5f, it.r.y + 0.5f, it.r.w - 1, it.r.h - 1}, tr, on ? rgb(accent()) : edgeC(hot));
    text(g, toW(it.w->text ? it.w->text : ""), it.r, 9, true, on ? rgb(kOnAccent) : rgb(hot ? kText : kDim));
  }
  // beta 0.7: "By OktoPierre · version · licence" at the bottom left, small and discreet as before beta 0.6 (owner's choice)
  void drawCredit(Canvas& g, R r) {
    text(g, toW(std::string(kAppPanelCredit) + " \xC2\xB7 " + kAppVersion + " \xC2\xB7 " + kAppLicense), r, 9.5f, false, rgb(kFaint), 0);
  }

  bool keyDown(int n) const { return ((liveKeys[n >> 5] >> (n & 31)) & 1) || n == mouseNote; }

  void drawKeyboard(Canvas& g, R r) {
    std::vector<int> whites; for (int n = KB_LO; n <= KB_HI; n++) if (!isBlack(n)) whites.push_back(n);
    float ww = r.w / whites.size();
    // Okto MultiWave Synth: with CHORD on, the selector octave is tinted (its keys choose the chord type and make no sound)
    const bool chordOn = plainOf(P_CHORD_MODE) >= 0.5; const int selBase = 24 + 12 * (int)jsRound(plainOf(P_CHORD_OCT));
    auto sel = [&](int n) { return chordOn && n >= selBase && n < selBase + 12; };
    for (size_t k = 0; k < whites.size(); k++) {
      int n = whites[k]; float x = r.x + k * ww; bool on = keyDown(n);
      g.fillRect(R{x + 0.5f, r.y, ww - 1, r.h}, Brush(Pt{0, r.y}, Pt{0, r.y + r.h}, on ? rgb(accent()) : sel(n) ? rgb(0x9d93e0) : rgb(0xd9dee5),
                                                   on ? rgb(0xe9fbf9) : sel(n) ? rgb(0xcfc9f2) : rgb(0xf6f8fa)));
      g.fillRect(R{x + 0.5f, r.y + r.h - 3, ww - 1, 3.f}, argb(64, 0, 0, 0));
      if (n % 12 == 0) text(g, noteName(n), R{x, r.y + r.h - 22, ww, 14}, 9, true, on ? rgb(0x0d1014) : rgb(0x7a8594));
    }
    for (int n = KB_LO; n <= KB_HI; n++) {
      if (!isBlack(n)) continue;
      int k = (int)(std::find(whites.begin(), whites.end(), n - 1) - whites.begin());
      float x = r.x + (k + 1) * ww - ww * 0.31f, bw = ww * 0.62f, bh = r.h * 0.6f; bool on = keyDown(n);
      g.fillRect(R{x, r.y, bw, bh}, Brush(Pt{0, r.y}, Pt{0, r.y + bh}, on ? rgb(accent()) : sel(n) ? rgb(0x4a4280) : rgb(0x262b33),
                                        on ? rgb(0x0f5a54) : sel(n) ? rgb(0x1e1a3a) : rgb(0x0d0f12)));
      g.fillRect(R{x + 2, r.y + bh - 5, bw - 4, 3.f}, argb(20, 255, 255, 255));
    }
    // beta 0.2, the oriental tuning: a small amber arrow on every key the tuning moves (down = lower than the equal-tempered key)
    const int mode = (int)jsRound(plainOf(P_MT_MODE));
    if (mode > 0) {
      const double* t = kMicro[mode - 1][(int)jsRound(plainOf(P_MT_SCALE))]; const int tonic = (int)jsRound(plainOf(P_MT_TONIC));
      for (int n = KB_LO; n <= KB_HI; n++) {
        const double off = t[(((n - tonic) % 12) + 12) % 12];
        if (std::fabs(off) < 8) continue;
        const int k = (int)(std::find(whites.begin(), whites.end(), isBlack(n) ? n - 1 : n) - whites.begin());
        const float cx = r.x + (isBlack(n) ? (k + 1) * ww : k * ww + ww / 2), cy = r.y + (isBlack(n) ? r.h * 0.5f : r.h * 0.72f);
        Pt tri[3];
        if (off < 0) { tri[0] = Pt{cx - 3.5f, cy - 3}; tri[1] = Pt{cx + 3.5f, cy - 3}; tri[2] = Pt{cx, cy + 3}; }
        else { tri[0] = Pt{cx - 3.5f, cy + 3}; tri[1] = Pt{cx + 3.5f, cy + 3}; tri[2] = Pt{cx, cy - 3}; }
        g.fillPolygon(tri, 3, Brush(rgb(0xffae42)));
      }
    }
  }

  // ---------------------------------------------------------------- Okto MultiWave Synth: the chord card
  // The twelve chord pads, laid out like the selector octave: the white-key family (Maj, 7, Maj7, Sus2, Sus4, Add9, Note)
  // above, the black-key family (Min, m7, Dim, Aug, 5) below, between them (the same geometry as web/js/ui.js padRects).
  struct PadR { R r; int key; };
  std::vector<PadR> padRects(R box) const {
    std::vector<PadR> v; const float cw = box.w / 7, pw = cw - 4, ph = 32; int wi = 0;
    for (int k = 0; k < 12; k++) {
      const bool black = isBlack(k);
      v.push_back(black ? PadR{R{box.x + (wi - 0.5f) * cw + 2, box.y + 36, pw, ph}, k} : PadR{R{box.x + wi * cw + 2, box.y, pw, ph}, k});
      if (!black) wi++;
    }
    return v;
  }
  int padAt(R box, float x, float y) const { for (const PadR& p : padRects(box)) if (p.r.has(x, y)) return p.key; return -1; }
  void drawChordPads(Canvas& g, int idx) {
    const Item& it = items[idx];
    const bool on = plainOf(P_CHORD_MODE) >= 0.5;
    const int cur = (int)jsRound(plainOf(P_CHORD_TYPE)), base = 24 + 12 * (int)jsRound(plainOf(P_CHORD_OCT));
    const int alpha = on ? 255 : 115;
    for (const PadR& p : padRects(it.r)) {
      const int type = kChordKeys[p.key];
      const bool active = type == cur, black = isBlack(p.key), hot = hover == idx && padHover == p.key;
      if (active) fillRR(g, R{p.r.x - 1, p.r.y - 1, p.r.w + 2, p.r.h + 2}, 9, rgb(accent(), alpha / 4));
      fillRR(g, p.r, 8, active ? Brush(rgb(accent(), alpha)) : black ? Brush(argb(alpha * (hot ? 140 : 100) / 255, 0, 0, 0)) : Brush(argb(alpha * (hot ? 64 : 38) / 255, 255, 255, 255)));
      if (!active) strokeRR(g, R{p.r.x + 0.5f, p.r.y + 0.5f, p.r.w - 1, p.r.h - 1}, 8, argb(alpha * (black ? 51 : 77) / 255, 255, 255, 255));
      text(g, toW(kChords[type].label), R{p.r.x, p.r.y + 3, p.r.w, 14}, 11, true, active ? rgb(kOnAccent, alpha) : black ? rgb(kDim, alpha) : rgb(kText, alpha));
      text(g, noteName(base + p.key), R{p.r.x, p.r.y + 18, p.r.w, 11}, 8, true, active ? rgb(kOnAccent, alpha * 3 / 4) : rgb(kFaint, alpha));
    }
  }
  // the chord sounding: its name (root and type) and its notes; the type chosen while no root is held
  void drawChordName(Canvas& g, R r) {
    screen(g, r);
    pill(g, L"CHORD", r.x + 8, r.y + 14, false, argb(153, 200, 210, 225));
    const bool on = plainOf(P_CHORD_MODE) >= 0.5;
    const int type = std::max(0, std::min(kNumChords - 1, (int)jsRound(plainOf(P_CHORD_TYPE))));
    if (!on) { text(g, L"OFF · THE KEYS PLAY AS USUAL", R{r.x, r.y + r.h / 2 - 2, r.w, 16}, 9.5f, true, rgb(kFaint)); return; }
    const bool held = liveChordRoot >= 0;
    const int root = held ? liveChordRoot : liveChordLast;
    const std::string name = chordName(root, type);
    const size_t ll = name.size() > 1 && name[1] == '#' ? 2 : 1;
    const std::wstring letter = toW(name.substr(0, ll)), suffix = toW(name.substr(ll));
    // textWidth counts the layout margins (1/6 em on each side): the suffix starts where the letter's ink ends
    const float gap = 26.f / 6 + 15.f / 6 - 1.5f;
    const float lw = g.textWidth(letter, 26, true), sw = suffix.empty() ? 0.f : g.textWidth(suffix, 15, true) - gap, x0 = r.x + (r.w - lw - sw) / 2;
    const Col c = held ? rgb(accent()) : rgb(kDim);
    text(g, letter, R{x0, r.y + 12, lw + 6, 34}, 26, true, c, 0);
    if (!suffix.empty()) text(g, suffix, R{x0 + lw - gap, r.y + 22, sw + gap + 6, 22}, 15, true, c, 0);
    std::wstring line;
    if (held) {
      for (int w = 0; w < 4; w++) for (int k = 0; k < 32; k++) if ((liveChordBits[w] >> k) & 1) { if (!line.empty()) line += L" \u00b7 "; line += noteName(w * 32 + k); }
    } else line = toW(kParams[P_CHORD_TYPE].choices[type]) + L" \u00b7 play a key above " + noteName(24 + 12 * (int)jsRound(plainOf(P_CHORD_OCT)) + 11);
    text(g, line, R{r.x + 4, r.y + 50, r.w - 8, 14}, 9.5f, true, held ? rgb(kText) : rgb(kFaint));
  }
  // the strum plate: the chord's notes over three octaves as strings; drag across them (as on the touch plate of an electronic chord harp)
  int plateList(int* notes) const {
    const int type = std::max(0, std::min(kNumChords - 1, (int)jsRound(host->getPlain(P_CHORD_TYPE))));
    return plateNotes(liveChordRoot >= 0 ? liveChordRoot : liveChordLast, type, notes);
  }
  void drawStrumPlate(Canvas& g, R r) {
    int notes[12]; const int n = plateList(notes); const float sw = r.w / n;
    screen(g, r);
    for (int k = 0; k < n; k++) {
      const float x = r.x + std::round((k + 0.5f) * sw) + 0.5f;
      const bool lit = keyDown(notes[k]) || plateTouch == notes[k];
      if (lit) g.line(Pt{x, r.y + 8}, Pt{x, r.y + r.h - 16}, Pen(rgb(accent(), 60), 6));
      g.line(Pt{x, r.y + 8}, Pt{x, r.y + r.h - 16}, Pen(lit ? rgb(accent()) : argb(82, 200, 210, 225), lit ? 2.5f : 1.2f));
      text(g, noteName(notes[k]), R{x - 12, r.y + r.h - 14, 24, 12}, 7.5f, true, lit ? rgb(accent()) : rgb(kFaint));
    }
    pill(g, L"STRUM PLATE", r.x + 8, r.y + 14, false, argb(128, 200, 210, 225));
  }
  int plateAt(R r, float px, float py, double& vel) {
    int notes[12]; const int n = plateList(notes);
    if (n <= 0) return -1;
    const int k = std::max(0, std::min(n - 1, (int)((px - r.x) / (r.w / n))));
    vel = std::min(1.0, std::max(0.2, 0.4 + 0.6 * (py - r.y) / r.h));
    return notes[k];
  }
  void plateOn(int n, double vel) { auto sh = host->sharedState(); if (sh) sh->push(SharedState::Ev{(int16_t)n, (int16_t)std::max(1, (int)std::lround(vel * 127)), 1}); }
  void plateOff(int n) { auto sh = host->sharedState(); if (sh) sh->push(SharedState::Ev{(int16_t)n, 0, 1}); }

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
    inset(g, m, 9);
    const Pt pts[] = {{m.x + 3, m.y + 15}, {m.x + 8, m.y + 15}, {m.x + 11, m.y + 7}, {m.x + 15, m.y + 23}, {m.x + 19, m.y + 11}, {m.x + 22, m.y + 17}, {m.x + 27, m.y + 17}};
    g.lines(pts, 7, Pen(rgb(accent()), 2.2f).join().caps());
    text(g, L"OKTOWAVE", R{r.x + 40, r.y + 1, 180, 18}, 13.5f, true, rgb(kText), 0);   // version 1.0 (the product's name in the header)
    text(g, L"FRACTAL WAVELET SYNTHESIZER", R{r.x + 40, r.y + 17, 196, 14}, 9, true, rgb(accent()), 0);
  }

  void drawPresets(Canvas& g, R r) {
    inset(g, r, 9);
    text(g, L"◀", R{r.x, r.y, 30, r.h}, 11, false, rgb(kDim));
    text(g, L"▶", R{r.x + r.w - 30, r.y, 30, r.h}, 11, false, rgb(kDim));
    std::wstring name = toW(shownName());
    if (host->presetDirty()) name += L"  •";
    if (!host->browserOpen()) name += L"  ▸";   // a click opens the preset browser
    // version 1.0.13: while the demo plays, the box says which preset of the tour plays (the player's own sound comes back when it stops)
    if (demoShown == -2) name = L"DEMO · starting…";
    else if (demoShown >= 0 && demoShown < kNumDemoScenes) name = L"DEMO " + std::to_wstring(demoShown + 1) + L"/" + std::to_wstring(kNumDemoScenes) + L" · " + toW(kDemoScenes[demoShown].name);
    // a long name gets a smaller font rather than overflowing the arrows
    float px = 12.5f;
    for (; px > 9.5f; px -= 0.5f) if (g.textWidth(name, px, true) <= r.w - 64) break;
    text(g, name, R{r.x + 30, r.y, r.w - 60, r.h}, px, true, rgb(kText));
  }

  // beta 0.6: one button; version 1.0.6: the manual is one page (Resources/manual/manual.html)
  void drawManualBtn(Canvas& g, const Item& it) {
    inset(g, it.r, 9);
    text(g, L"USER", R{it.r.x, it.r.y + 3, it.r.w, 12}, 9.5f, true, rgb(kDim));
    text(g, L"MANUAL", R{it.r.x, it.r.y + 14, it.r.w, 14}, 12, true, rgb(kText));
  }

  void drawMeter(Canvas& g, R r) {
    float bw = (r.w - 2) / 2;
    float lv[2] = {meterL, meterR};
    for (int k = 0; k < 2; k++) {
      float x = r.x + k * (bw + 2);
      g.fillRect(R{x, r.y, bw, r.h}, argb(115, 0, 0, 0));
      double db = 20 * std::log10(lv[k] + 1e-9), t = std::min(1.0, std::max(0.0, (db + 48) / 48));
      float h = (float)(t * r.h);
      if (h > 0.5f) g.fillRect(R{x, r.y + r.h - h, bw, h}, Brush(Pt{0, r.y + r.h}, Pt{0, r.y}, rgb(0x2fd4c6), rgb(0xff5d5d)));
    }
  }

  void drawZoom(Canvas& g, R r) {
    inset(g, r, 5);
    text(g, (host->zoom() > 0 ? L"" : L"FIT ") + std::to_wstring((int)std::lround(effZoom() * 100)) + L"%", r, 9.5f, true, rgb(kDim));
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
    if (host->browserOpen() && (bList().has(x, y) || bScrollR().has(x, y))) { browserWheel(dir); return; }
    int idx = hit(x, y);
    if (idx >= 0) wheelOn(idx, dir);
  }

  void mouseDown(float x, float y, bool dbl) override {
    if (kSaveBtn.has(x, y)) { if (!dbl) savePreset(); onTimer(); invalidateAll(); return; }
    if (kDemoBtn.has(x, y)) { if (!dbl) toggleDemo(); invalidateLogical(kDemoBtn); return; }   // version 1.0.13 (a double click is one click)
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
        float pad = w.style == 1 ? 3.f : w.style == 3 ? 0.f : 2.f, bw = (it.r.w - 2 * pad) / p.numChoices;
        int k = std::max(0, std::min(p.numChoices - 1, (int)((x - it.r.x - pad) / bw)));
        gesture(w.param, p.min + k);
        return;
      }
      case W_OSCTABS: {   // beta 0.3: a folder tab shows its oscillator
        for (int s = 0; s < NS; s++) {
          const float tx = it.r.x + s * 182.f;
          if (x >= tx && x < tx + 176.f) { gesture(P_OSC_VIEW, s); return; }
        }
        return;
      }
      case W_LFOTABS: {   // beta 0.3.4: a tab of the LFO 2/3 card shows its LFO (58 px at x 6 and 66)
        for (int k = 0; k < 2; k++) {
          const float tx = it.r.x + 6.f + k * 60.f;
          if (x >= tx && x < tx + 58.f && y >= it.r.y + 3.f) { gesture(P_LFO_VIEW, k); return; }
        }
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
      case W_MANUAL: openManual(L"manual.html"); return;   // version 1.0.6: one page
      case W_TOGGLE: gesture(w.param, plainOf(w.param) >= 0.5 ? 0 : 1); return;   // beta 0.6: SYNC on / off
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
      case W_CHORDPADS: {   // Okto MultiWave Synth: a pad chooses the chord type (and switches CHORD on)
        const int k = padAt(it.r, x, y);
        if (k < 0) return;
        gesture(P_CHORD_TYPE, kChordKeys[k]);
        if (plainOf(P_CHORD_MODE) < 0.5) gesture(P_CHORD_MODE, 1);
        invalidateItem(idx);
        return;
      }
      case W_STRUMPLATE: {   // Okto MultiWave Synth: a string of the strum plate; dragging across the others strums
        double vel; const int n = plateAt(it.r, x, y, vel);
        if (n >= 0) { plateTouch = n; plateOn(n, vel); }
        drag = idx; if (win) win->capture(true);
        invalidateItem(idx);
        return;
      }
      default: return;
    }
  }
  // right-click (or Control-click on a Mac) on the preset name: the classic menu; on a sound of the browser: its menu
  void rightDown(float x, float y) override {
    if (host->browserOpen() && x >= kDeviceW) { browserRightClick(x, y); return; }
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
    if (bDrag) { bScrollTo(y - bDragOff, (int)bRows().size()); return false; }
    if (rowDrag >= 0) {   // beta 0.5: a sound of the browser dragged towards a category
      if (!rowMoving && std::hypot(x - rowX0, y - rowY0) > 6) rowMoving = true;
      if (rowMoving) {
        int c = -1;
        for (int i = 0; i < bNumCats(); i++) if (bCatR(i).has(x, y)) c = i;
        dropCat = c; rowX = x; rowY = y;
        invalidateLogical(bCard());
      }
      return false;
    }
    if (drag >= 0) {
      const Item& it = items[drag];
      if (it.w->type == W_KEYBOARD) {
        double vel; int n = keyAt(it.r, std::max(it.r.x, std::min(it.r.x + it.r.w - 1, x)), std::max(it.r.y, std::min(it.r.y + it.r.h - 1, y)), vel);
        if (n != mouseNote) { if (mouseNote >= 0) noteOff(mouseNote); mouseNote = n; noteOn(n, vel); invalidateItem(drag); }
        return false;
      }
      if (it.w->type == W_WHEELS) { wheelMove(it, y); return false; }
      if (it.w->type == W_STRUMPLATE) {   // Okto MultiWave Synth: the string under the pointer
        double vel; const int n = plateAt(it.r, std::max(it.r.x, std::min(it.r.x + it.r.w - 1, x)), std::max(it.r.y, std::min(it.r.y + it.r.h - 1, y)), vel);
        if (n >= 0 && n != plateTouch) { if (plateTouch >= 0) plateOff(plateTouch); plateTouch = n; plateOn(n, vel); invalidateItem(drag); }
        return false;
      }
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
    int h = kSaveBtn.has(x, y) ? -2 : kDemoBtn.has(x, y) ? -3 : hit(x, y);
    if (h != hover) {
      int old = hover; hover = h;
      padHover = -1;
      invalidateItem(old); invalidateItem(hover);
      if (old == -2 || h == -2) invalidateLogical(kSaveBtn);
      if (old == -3 || h == -3) invalidateLogical(kDemoBtn);
    }
    if (hover >= 0 && items[hover].w->type == W_CHORDPADS) {   // Okto MultiWave Synth: the pad under the pointer
      const int pk = padAt(items[hover].r, x, y);
      if (pk != padHover) { padHover = pk; invalidateItem(hover); }
    }
    const int bh = host->browserOpen() && x >= kDeviceW ? bHit(x, y) : -1;
    if (bh != bHover) { bHover = bh; invalidateLogical(bCard()); }
    return true;
  }

  void mouseUp() override {
    if (bDrag) { bDrag = false; if (win) win->capture(false); invalidateLogical(bCard()); return; }
    if (rowDrag >= 0) {   // beta 0.5: dropped on a category: the sound moves there
      const int row = rowDrag, c = dropCat, tab = bTab;
      const bool moved = rowMoving;
      rowDrag = -1; rowMoving = false; dropCat = -1;
      if (win) win->capture(false);
      if (moved && c >= 0) { if (tab == 0) moveFactory(row, c); else moveBank(row, c); }
      onTimer(); invalidateAll();
      return;
    }
    if (drag < 0) return;
    const Item& it = items[drag];
    if (it.w->type == W_KEYBOARD) { if (mouseNote >= 0) noteOff(mouseNote); mouseNote = -1; }
    else if (it.w->type == W_STRUMPLATE) { if (plateTouch >= 0) plateOff(plateTouch); plateTouch = -1; }   // Okto MultiWave Synth
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
    if (hover == -3) { hover = -1; invalidateLogical(kDemoBtn); }
    if (bHover >= 0) { bHover = -1; invalidateLogical(bCard()); }
  }

  // developer test (vst/devtest/bank_session.cpp, tests/machost): a preset-menu command, the bank read again; the sound
  // menu's commands (move, TOP Sounds) act on the sound playing
  void testCommand(int cmd) override {
    menuBank = Library::get().bank();
    ctxRow = -1; ctxTab = host->userPresetName().empty() ? 0 : 1;
    menuCommand(cmd);
  }

  // beta 0.5: the arrow keys. Browser open: ↑ ↓ play the sound above / below in the list shown, ← → show the category
  // above / below; browser hidden: the previous / next preset, as ◀ ▶. A key the host also passed on by another way
  // (its window procedure and IPlugView::onKeyDown) within a few milliseconds counts once.
  bool key(int k) override {
    if (k < kKeyLeft || k > kKeyDown) return false;
    const auto now = std::chrono::steady_clock::now();
    if (k == lastKey && now - lastKeyAt < std::chrono::milliseconds(12)) return true;
    lastKey = k; lastKeyAt = now;
    if (!host->browserOpen()) {
      const int to = stepPreset(host->presetIndex(), k == kKeyLeft || k == kKeyUp ? -1 : 1);
      if (to >= 0) host->loadPreset(to);
      onTimer(); invalidateAll();
      return true;
    }
    buildCategories();
    menuBank = Library::get().bank();
    if (k == kKeyLeft || k == kKeyRight) {
      const int c = std::max(0, std::min(bNumCats() - 1, bCat + (k == kKeyLeft ? -1 : 1)));
      if (c != bCat) {
        bCat = c; bScroll = 0;
        const std::vector<int> rows = bRows();
        for (int j = 0; j < (int)rows.size(); j++)
          if (bRowIsCurrent(rows[j])) bScroll = std::max(0, std::min(j - bVisibleRows() / 2, (int)rows.size() - bVisibleRows()));
      }
      invalidateAll();
      return true;
    }
    const std::vector<int> rows = bRows();
    if (rows.empty()) return true;
    int at = -1;
    for (int j = 0; j < (int)rows.size(); j++) if (bRowIsCurrent(rows[j])) at = j;
    const int n = (int)rows.size();
    const int to = at < 0 ? (k == kKeyDown ? 0 : n - 1) : std::max(0, std::min(n - 1, at + (k == kKeyDown ? 1 : -1)));
    if (to != at) {
      if (bTab == 0) host->loadPreset(rows[to]);
      else host->loadUserSound(menuBank[rows[to]].v, kUserPrefix + menuBank[rows[to]].name);
      bStatus.clear();
      const int vis = bVisibleRows();
      if (to < bScroll) bScroll = to; else if (to >= bScroll + vis) bScroll = to - vis + 1;
    }
    onTimer(); invalidateAll();
    return true;
  }

  // ================================================================ presets: menu, library, browser (beta 0.3)
  // The preset name opens the PRESET BROWSER (a panel at the right of the synth, which can be hidden); a right-click on it
  // opens the classic menu. SAVE PRESET overwrites the preset shown: a factory preset is ADJUSTED in the library (it
  // keeps its place, optionally under a new name; RESTORE brings the original back), a sound of the user bank is
  // replaced. Everything lives in the library file (bank.h), which another instance may change at any time: every action
  // reads it again first. DELETE hides a factory preset from the lists (the file keeps it, "Deleted: yes"; the menu's
  // "Deleted presets" brings it back).
  static constexpr int kCmdBankSave = 900, kCmdBankExport = 901, kCmdBankShow = 902, kCmdSavePreset = 910, kCmdRestore = 911,
                       kCmdBrowser = 912, kCmdDelete = 913, kCmdBankLoad = 1000, kCmdBankDelete = 3000, kCmdUndelete = 5000,
                       kCmdBankImport = 903,   // beta 0.4
                       kCmdMoveTo = 7000, kCmdTopAdd = 7100, kCmdTopRemove = 7101;   // beta 0.5: the sound menu (ctxRow)
  static constexpr float kBrowserW = 420;                  // logical width added at the right while the browser is open
  static constexpr R kSaveBtn{862, 9, 68, 30};             // SAVE PRESET, before MANUAL
  static constexpr R kDemoBtn{788, 9, 68, 30};             // version 1.0.13: PLAY DEMO, before SAVE PRESET (where the web app has DOWNLOAD VST)
  std::vector<BankPreset> menuBank;                        // the bank as listed by the last menu / browser (commands index it)
  struct BCat { std::wstring label; std::vector<int> presets; };   // a factory category of the browser
  std::vector<BCat> fCats;                                 // TOP Sounds, then the categories in factory order
  int bTab = 0, bCat = 0, bScroll = 0, bHover = -1;        // tab (0 factory, 1 user bank), category row, first row, hover
  std::string bFollowKey;                                  // the sound the browser last followed (bFollow)
  bool bDrag = false; float bDragOff = 0;                  // dragging the scroll bar's thumb (grabbed bDragOff below its top)
  // beta 0.5: a sound of the list pressed (a factory preset, or an index into menuBank), dragged onto a category
  int rowDrag = -1, dropCat = -1; bool rowMoving = false; float rowX0 = 0, rowY0 = 0, rowX = 0, rowY = 0;
  int ctxRow = -1, ctxTab = 0;                             // the sound a sound-menu command acts on (-1: the one playing)
  int lastKey = 0; std::chrono::steady_clock::time_point lastKeyAt{};
  uint32_t libVer = 0; int libTick = 0;
  std::string lastShownName, lastBrowserKey; bool lastShownDirty = false, lastShownOpen = false, browserWasOpen = false;   // what the preset box / the browser showed at the last timer tick
  uint32_t bCacheVer = ~0u;                                // the library version the browser's lists (fCats, menuBank) were taken at
  std::wstring bStatus;                                    // last browser message

  // the browser's factory lists, as the library keeps them (TOP Sounds, then the categories, in the player's order)
  void buildCategories() {
    fCats.clear();
    for (const auto& l : Library::get().lists()) fCats.push_back(BCat{toW(l.first), l.second});
  }
  // the preset box's text: the bank sound, a preset of an older version (beta 0.5), else the factory preset as named now
  std::string shownName() {
    const std::string user = host->userPresetName();
    if (!user.empty()) return user;
    const std::string former = host->formerPresetName();
    if (!former.empty()) return former;
    const int pi = host->presetIndex();
    return pi >= 0 && pi < kNumPresets ? Library::get().name(pi) : "User sound";
  }
  bool factoryShown() { return host->userPresetName().empty() && host->formerPresetName().empty(); }   // presetIndex() plays

  // ---------------------------------------------------------------- classic menu (right-click on the preset name)
  void presetMenu(const Item& it) {
    Library& lib = Library::get();
    std::vector<MenuItem> m;
    const int cur = host->presetIndex();
    const std::string user = host->userPresetName();
    const bool fac = factoryShown();
    // beta 0.5: the browser's lists as the library keeps them (TOP Sounds, then the categories, presets moved included)
    const auto lists = lib.lists();
    m.push_back(MenuItem::item(L"TOP Sounds", 0, false, true));
    for (int k : lists[0].second)
      if (!lib.deleted(k)) m.push_back(MenuItem::item(toW(lib.name(k)), 100 + k, k == cur && fac));
    m.push_back(MenuItem::sep());
    for (size_t i = 1; i < lists.size(); i++) {
      std::vector<MenuItem> sub;
      bool here = false;
      int n = 0;
      for (int k : lists[i].second) {
        if (lib.deleted(k)) continue;
        sub.push_back(MenuItem::item(toW(lib.name(k)), 100 + k, k == cur && fac));
        here = here || (k == cur && fac);
        n++;
      }
      m.push_back(MenuItem::popup(toW(lists[i].first) + L"\t" + std::to_wstring(n), std::move(sub), here));
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
    if (fac && lib.adjusted(cur)) m.push_back(MenuItem::item(L"Restore the original preset", kCmdRestore));
    if (fac && !lib.deleted(cur)) m.push_back(MenuItem::item(L"Delete this preset from the list…", kCmdDelete));
    if (lib.deletedCount() > 0) {   // bring a deleted factory preset back
      std::vector<MenuItem> dm;
      for (int k = 0; k < kNumPresets; k++) if (lib.deleted(k)) dm.push_back(MenuItem::item(toW(lib.name(k)), kCmdUndelete + k));
      m.push_back(MenuItem::popup(L"Deleted presets (click to bring back)\t" + std::to_wstring(lib.deletedCount()), std::move(dm)));
    }
    m.push_back(MenuItem::item(L"Export all presets (.txt)…", kCmdBankExport));
    m.push_back(MenuItem::item(L"Import presets (.txt), replacing yours…", kCmdBankImport));
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
    else if (cmd == kCmdBankImport) bankImport();
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
    else if (cmd >= kCmdMoveTo && cmd < kCmdMoveTo + 100) {   // beta 0.5: the sound menu (ctxRow, else the sound playing)
      if (ctxTab == 0) moveFactory(ctxRow >= 0 ? ctxRow : factoryShown() ? host->presetIndex() : -1, cmd - kCmdMoveTo);
      else moveBank(ctxRow >= 0 ? ctxRow : currentBankIndex(), cmd - kCmdMoveTo);
    } else if (cmd == kCmdTopAdd || cmd == kCmdTopRemove) {
      const int k = ctxRow >= 0 ? ctxRow : factoryShown() ? host->presetIndex() : -1;
      if (cmd == kCmdTopAdd) moveFactory(k, 0);
      else if (k >= 0 && !libError(Library::get().setTop(k, false), L"Could not save the presets file:")) {
        bStatus = L"“" + toW(Library::get().name(k)) + L"” taken out of TOP Sounds.";
        bClamp();
      }
    } else return;
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
    if (!host->formerPresetName().empty()) { bankSave(); return; }   // beta 0.5: no longer a factory preset: to the user bank
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
    if (factoryShown() && host->presetIndex() == k) host->loadPreset(k);   // the original sound again
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
  // The arrows step through the presets in the order of the lists (TOP Sounds, then each category's presets, every preset once; beta 0.2: the
  // numbering is not the order of the lists any more: the 300 new presets come before the 200 of beta 0.1 in the factory order, but each
  // category lists its presets together), skipping the deleted ones.
  int stepPreset(int from, int dir) {
    Library& lib = Library::get();
    std::vector<int> order; std::vector<char> seen(kNumPresets, 0);
    for (const auto& l : lib.lists()) for (int k : l.second) if (k >= 0 && k < kNumPresets && !seen[k]) { seen[k] = 1; order.push_back(k); }
    const int n = (int)order.size();
    if (!n) return -1;
    int at = 0; for (int i = 0; i < n; i++) if (order[i] == from) at = i;
    for (int i = 1; i <= n; i++) {
      const int k = order[((at + dir * i) % n + n) % n];
      if (!lib.deleted(k)) return k;
    }
    return -1;
  }
  void bankSave() {   // the current sound into the user bank: name and section
    Library& lib = Library::get();
    lib.refresh();
    SaveDlg d;
    const std::string user = host->userPresetName(), former = host->formerPresetName();
    const int pi = host->presetIndex();
    if (!user.empty()) {
      d.name = toW(user.substr(std::strlen(kUserPrefix)));
      for (const BankPreset& p : lib.bank()) if (kUserPrefix + p.name == user) { d.section = p.section; break; }
    } else if (!former.empty()) {
      d.name = toW(former);   // beta 0.5: a preset of an older version
    } else if (pi >= 0 && pi < kNumPresets) {
      d.name = toW(lib.name(pi));
      const int c = lib.categoryOf(pi);   // beta 0.5: its category now
      const auto lists = lib.lists();
      d.section = std::max(0, bankSectionOf(c > 0 && c < (int)lists.size() ? lists[c].first : kPresets[pi].cat));
    }
    if (!win || !win->saveDialog(d, L"Save to user bank", true, nullptr)) return;
    BankPreset np;
    np.section = d.section; np.name = fromW(d.name);
    currentSound(np.v);
    np.from = !user.empty() ? user.substr(std::strlen(kUserPrefix)) : !former.empty() ? former : pi >= 0 && pi < kNumPresets ? lib.name(pi) : "";
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
      path = win->saveFileDialog(L"Export all presets (factory presets, user bank and your stars)", L"OKTOMULTIWAVE presets.txt");
      if (path.empty()) return;
    }
    Library::get().refresh();
    const std::wstring e = Library::get().exportTo(path);
    if (!e.empty()) { if (win) win->message(L"Could not export the presets:\n" + path + L"\n\n" + e + L".", true); }
    else bStatus = L"Exported to " + path.substr(path.find_last_of(L"\\/") + 1) + L".";
  }
  // IMPORT (beta 0.4): the presets of another file replace yours (adjusted and deleted presets, list order, user bank); the
  // current file is kept as a dated backup copy next to it
  void bankImport() {
    std::wstring path = envPath(L"WS_PRESETS_IMPORT");   // developer tests: no file window
    if (path.empty()) {
      if (!win) return;
      path = win->openFileDialog(L"Import presets (they replace yours; your file is kept as a backup copy)");
      if (path.empty()) return;
    }
    const std::wstring name = path.substr(path.find_last_of(L"\\/") + 1);
    if (!ask(L"Replace your presets — adjusted and deleted factory presets, list order and user bank — with those of “" + name +
             L"”?\n\nYour current presets file is kept as a backup copy next to it.")) return;
    std::wstring backup;
    Library::get().refresh();
    const std::wstring e = Library::get().importFrom(path, backup);
    if (!e.empty()) { if (win) win->message(L"Could not import the presets:\n" + path + L"\n\n" + e + L".", true); return; }
    buildCategories();
    menuBank = Library::get().bank();
    bReveal();
    bStatus = L"Imported " + name + (backup.empty() ? L"." : L" (backup: " + backup.substr(backup.find_last_of(L"\\/") + 1) + L").");
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
  R bCard() const { return R{kDeviceW + 4, 8, kBrowserW - 12, kDeviceH - 16}; }
  R bHide() const { const R c = bCard(); return R{c.x + c.w - 70, c.y + 6, 58, 20}; }
  R bTabR(int t) const { const R c = bCard(); const float w = (c.w - 24) / 2; return R{c.x + 12 + t * w, c.y + 34, w, 26}; }
  R bCatR(int i) const { const R c = bCard(); return R{c.x + 12, c.y + 72 + i * 26.0f, 118, 24}; }
  // beta 0.3.3: while CHORD MODE is on the chord card is under the list (the list is that much shorter)
  static constexpr float kChordSideH = 248;
  R bList() const { const R c = bCard(); return R{c.x + 136, c.y + 98, c.w - 162, c.h - 156 - (chordInBrowser() ? kChordSideH + 6 : 0)}; }
  R bChordCard() const { const R c = bCard(), l = bList(); return R{c.x + 8, l.y + l.h + 10, c.w - 16, kChordSideH}; }
  // the chord items in the browser: pads, name, KEYS OCT, the octave stepper, the voicing, STRUM and the strum plate, re-laid out for the width of the browser (the card's own order)
  void layoutChordItems() {
    if (chordSec < 0) return;
    static const float side[7][4] = {{12, 26, 364, 70}, {12, 104, 170, 70}, {196, 104, 110, 14}, {196, 120, 110, 26}, {196, 150, 110, 24}, {324, 108, 52, 60}, {12, 182, 368, 56}};
    const bool inB = chordInBrowser();
    const R cc = bChordCard();
    const SectionDef& sd = kSections[chordSec];
    for (size_t j = 0; j < chordItems.size() && j < 7; j++) {
      Item& it = items[chordItems[j]];
      it.r = inB ? R{cc.x + side[j][0], cc.y + side[j][1], side[j][2], side[j][3]} : R{sd.x + it.w->x, sd.y + it.w->y, it.w->w, it.w->h};
    }
  }
  void drawChordInBrowser(Canvas& g, R dirty) {
    const R r = bChordCard();
    if (!r.hits(dirty)) return;
    glass(g, r);
    text(g, toW(kSections[chordSec].title), R{r.x + 12, r.y + 4, 300, 16}, 10.5f, true, rgb(kTitle), 0);
    for (int k : chordItems) if (visible(items[k]) && items[k].r.hits(dirty)) drawItem(g, k);
  }
  R bScrollR() const { const R l = bList(); return R{l.x + l.w + 2, l.y, 12, l.h}; }   // the list's scroll bar (beta 0.4)
  // its thumb for n rows, at least 28 px high so that it is easy to grab
  R bThumb(int n) const {
    const R s = bScrollR(); const int vis = bVisibleRows();
    const float th = std::max(28.0f, s.h * vis / std::max(1, n)), ty = s.y + (s.h - th) * bScroll / std::max(1, n - vis);
    return R{s.x, ty, s.w, th};
  }
  // scrolls so that the thumb's top is at `top`
  void bScrollTo(float top, int n) {
    const R s = bScrollR(), t = bThumb(n); const int vis = bVisibleRows();
    const float range = s.h - t.h;
    const int v = range > 0 ? (int)std::lround((top - s.y) / range * (n - vis)) : 0;
    const int ns = std::max(0, std::min(std::max(0, n - vis), v));
    if (ns != bScroll) { bScroll = ns; invalidateLogical(bList()); invalidateLogical(bScrollR()); }
  }
  R bListHead() const { const R c = bCard(); return R{c.x + 136, c.y + 72, c.w - 148, 20}; }   // its name, ▲ ▼
  R bMoveR(int dir) const { const R h = bListHead(); return R{h.x + h.w - (dir < 0 ? 118.f : 58.f), h.y, dir < 0 ? 56.f : 58.f, 20}; }   // version 1.0.14 (the owner: a button to move the preset up or down in the list): labelled ▲ UP and ▼ DOWN (they were a bare ▲ ▼, 24 wide)
  static constexpr float kRowH = 22;
  int bVisibleRows() const { return (int)(bList().h / kRowH); }
  R bRowR(int j) const { const R l = bList(); return R{l.x, l.y + j * kRowH, l.w, kRowH - 1}; }
  static constexpr int kBtns = 5;   // TO BANK, RESTORE, DELETE, EXPORT, IMPORT (beta 0.4; FILE is in the right-click menu)
  R bBtnR(int b) const { const R c = bCard(); const float w = (c.w - 24 - 4 * 5) / kBtns; return R{c.x + 12 + b * (w + 5), c.y + c.h - 50, w, 26}; }
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
    if (bTab == 0) { if (!factoryShown()) return; e = lib.moveInList(bCat, host->presetIndex(), dir); }
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
  // beta 0.2: a new sound is playing (the preset box, its arrows, its menu, the host's program change): the browser shows its bank and its
  // row, so that the sound selected is always seen at the right. The same sound (a knob moved) leaves the bank the player is looking at,
  // and a row clicked in the list stays where it is.
  void bFollow() {
    const std::string user = host->userPresetName();
    const std::string key = user.empty() ? "f" + std::to_string(host->presetIndex()) : user;
    if (key == bFollowKey) return;
    bFollowKey = key;
    const int oldTab = bTab, oldCat = bCat, oldScroll = bScroll;
    bReveal();
    if (oldTab == bTab && oldCat == bCat) {   // the bank is already shown: keep its scroll when the row is in view
      const std::vector<int> rows = bRows();
      const int vis = bVisibleRows();
      for (int j = 0; j < (int)rows.size(); j++) if (bRowIsCurrent(rows[j]) && j >= oldScroll && j < oldScroll + vis) bScroll = oldScroll;
    }
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
    if (bTab == 0) return factoryShown() && row == host->presetIndex();
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
    if (bScrollR().has(x, y) && (int)bRows().size() > bVisibleRows()) return 30;   // the scroll bar
    for (int b = 0; b < kBtns; b++) if (bBtnR(b).has(x, y)) return 500 + b;
    return -1;
  }
  bool bBtnEnabled(int b) {
    const bool factory = factoryShown(), bank = !host->userPresetName().empty();
    if (b == 1) return bTab == 0 && factory && Library::get().adjusted(host->presetIndex());   // RESTORE
    if (b == 2) return bTab == 0 ? factory && !Library::get().deleted(host->presetIndex()) : bank;   // DELETE
    return true;
  }
  void browserClick(float x, float y) {
    buildCategories();
    menuBank = Library::get().bank();
    if (win) win->takeFocus();   // beta 0.5: the arrow keys choose sounds from now on
    const int h = bHit(x, y);
    if (h == 1) { setBrowser(false); return; }
    if (h == 20 || h == 21) { if (bMoveEnabled()) bMove(h == 20 ? -1 : 1); invalidateAll(); return; }
    if (h == 30) {   // the scroll bar: drag its thumb, or a click on the bar puts the thumb there
      const int n = (int)bRows().size(); const R t = bThumb(n);
      bDragOff = t.has(x, y) ? y - t.y : t.h / 2;
      bDrag = true;
      if (win) win->capture(true);
      bScrollTo(y - bDragOff, n);
      invalidateLogical(bCard());
      return;
    }
    if (h == 10 || h == 11) {   // a tab; it shows the sound playing only when that sound belongs to it
      bTab = h - 10; bCat = 0; bScroll = 0;
      if ((bTab == 0) == host->userPresetName().empty()) bReveal();
    }
    else if (h >= 100 && h < 500) { bCat = h - 100; bScroll = 0; }
    else if (h >= 1000) {
      const std::vector<int> rows = bRows();
      const int j = h - 1000 + bScroll;
      if (j < (int)rows.size() && bStarsR(h - 1000).has(x, y)) { bRate(rows[j], x - bStarsR(h - 1000).x); return; }   // beta 0.3.1: a click on the stars rates the sound (it does not load it)
      if (j < (int)rows.size()) {
        if (bTab == 0) host->loadPreset(rows[j]);
        else host->loadUserSound(menuBank[rows[j]].v, kUserPrefix + menuBank[rows[j]].name);
        bStatus.clear();
        onTimer();
        // beta 0.5: it may be dragged onto a category (mouseMove / mouseUp)
        rowDrag = rows[j]; rowMoving = false; dropCat = -1; rowX0 = rowX = x; rowY0 = rowY = y;
        if (win) win->capture(true);
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
      else bankImport();
      menuBank = Library::get().bank();
      onTimer();
    }
    invalidateAll();
  }
  // beta 0.5: the sound menu (right-click on a sound of the list): move it to another category / section, TOP Sounds
  void browserRightClick(float x, float y) {
    buildCategories();
    menuBank = Library::get().bank();
    const int h = bHit(x, y);
    if (h < 1000) return;
    const std::vector<int> rows = bRows();
    const int j = h - 1000 + bScroll;
    if (j >= (int)rows.size()) return;
    Library& lib = Library::get();
    const int row = rows[j];
    std::vector<MenuItem> m, sub;
    if (bTab == 0) {
      const int cur = lib.categoryOf(row), def = Library::defaultCategory(row);
      m.push_back(MenuItem::item(toW(lib.name(row)), 0, false, true));
      for (size_t i = 1; i < fCats.size(); i++) sub.push_back(MenuItem::item(fCats[i].label, kCmdMoveTo + (int)i, (int)i == cur, (int)i == cur));
      m.push_back(MenuItem::popup(L"Move to", std::move(sub)));
      if (def > 0 && def != cur && def < (int)fCats.size()) m.push_back(MenuItem::item(L"Back to " + fCats[def].label, kCmdMoveTo + def));
      m.push_back(lib.inTop(row) ? MenuItem::item(L"Remove from TOP Sounds", kCmdTopRemove) : MenuItem::item(L"Add to TOP Sounds", kCmdTopAdd));
    } else {
      const BankPreset& p = menuBank[row];
      m.push_back(MenuItem::item(toW(p.name), 0, false, true));
      for (int s = 0; s < kNumBankSections; s++) sub.push_back(MenuItem::item(toW(kBankSections[s]), kCmdMoveTo + s, s == p.section, s == p.section));
      m.push_back(MenuItem::popup(L"Move to", std::move(sub)));
    }
    ctxRow = row; ctxTab = bTab;
    const int cmd = win ? win->popupMenu(m, x, y) : 0;
    menuCommand(cmd);
    ctxRow = -1;
    onTimer(); invalidateAll();
  }
  // beta 0.5: factory preset k into category list `list` of the browser (0 = TOP Sounds: added there)
  void moveFactory(int k, int list) {
    Library& lib = Library::get();
    buildCategories();
    if (k < 0 || k >= kNumPresets || list < 0 || list >= (int)fCats.size()) return;
    const std::wstring nm = L"“" + toW(lib.name(k)) + L"”";
    if (list == 0) {
      if (lib.inTop(k)) { bStatus = nm + L" is already in TOP Sounds."; return; }
      if (libError(lib.setTop(k, true), L"Could not save the presets file:")) return;
      bStatus = nm + L" added to TOP Sounds.";
    } else {
      if (lib.categoryOf(k) == list) { bStatus = nm + L" is already in " + fCats[list].label + L"."; return; }
      if (libError(lib.moveToCategory(k, list), L"Could not save the presets file:")) return;
      bStatus = nm + L" moved to " + fCats[list].label + L".";
    }
    bClamp();
  }
  // beta 0.5: a sound of the user bank (menuBank index) into another section
  void moveBank(int idx, int sec) {
    Library& lib = Library::get();
    menuBank = lib.bank();
    if (idx < 0 || idx >= (int)menuBank.size() || sec < 0 || sec >= kNumBankSections) return;
    const BankPreset p = menuBank[idx];
    const std::wstring nm = L"“" + toW(p.name) + L"”", to = toW(kBankSections[sec]);
    if (p.section == sec) { bStatus = nm + L" is already in " + to + L"."; return; }
    for (const BankPreset& q : menuBank)
      if (q.section == sec && q.name == p.name) {
        if (win) win->message(L"A sound called " + nm + L" is already in " + to + L": rename one of them first.", false);
        return;
      }
    if (libError(lib.moveUserTo(p.section, p.name, sec), L"Could not save the user bank:")) return;
    menuBank = lib.bank();
    bStatus = nm + L" moved to " + to + L".";
    bClamp();
  }
  int currentBankIndex() {
    const std::string user = host->userPresetName();
    for (size_t i = 0; i < menuBank.size(); i++) if (!user.empty() && kUserPrefix + menuBank[i].name == user) return (int)i;
    return -1;
  }
  void bClamp() {   // the list shown may be shorter now
    buildCategories();
    const int n = (int)bRows().size();
    bScroll = std::max(0, std::min(bScroll, n - bVisibleRows()));
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
    std::string pre = dot != std::string::npos && dot >= 1 && dot <= 3 ? name.substr(0, dot) : "";   // A, AA, AB, AAB, B (version 1.0: the types, no numbers)
    if (pre.find_first_not_of("AB") != std::string::npos) pre.clear();
    float x = r.x;
    auto part = [&](const std::wstring& s, Col c) {
      const float bw = g.textWidth(s, px, bold);
      text(g, s, R{x, r.y, bw + 2, r.h}, px, bold, c, 0);
      x += bw - px * 0.28f;
    };
    if (!pre.empty()) {
      for (char ch : pre) part(std::wstring(1, (wchar_t)ch), rgb(accentOf(ch == 'A' ? 0 : 1), alpha));
      part(toW(name.substr(pre.size())), rest);
    } else g.textEllipsis(toW(name), r, px, bold, rest, true);
  }
  void drawBrowser(Canvas& g) {
    Library& lib = Library::get();
    if (lib.version() != bCacheVer) { buildCategories(); menuBank = lib.bank(); bCacheVer = lib.version(); }   // (version 1.0.7: when the library changed, not at every paint)
    const R c = bCard();
    const int bkey = 1 + (orient ? 1 + (orientMode == 2 ? 1 : 0) : 0);   // (version 1.0.9: again when the tuning changes)
    if (bgBrowser.key != bkey) {   // the same colours as the panel, at another angle
      static const Stop st[4] = {{0, 0x2b0f2e}, {0.30f, 0x5a1f4a}, {0.62f, 0x8a3a3a}, {1, 0xc25a2a}};
      static const Blob bl[3] = {{0.08f, 0.15f, 0.56f, 0.42f, 0xff7a3d}, {0.85f, 0.08f, 0.49f, 0.42f, 0x7a3dff}, {0.57f, 1.06f, 0.63f, 0.49f, 0xff3d8a}};
      if (orient) {   // version 1.0.9: the pattern's colours here too
        const OrientPal& P = opal();
        const Stop os[4] = {{0, P.g[0]}, {0.30f, P.g[1]}, {0.62f, P.g[2]}, {1, P.g[3]}};
        const Blob ob[3] = {{0.08f, 0.15f, 0.56f, 0.42f, P.glow[0]}, {0.85f, 0.08f, 0.49f, 0.42f, P.glow[1]}, {0.57f, 1.06f, 0.63f, 0.49f, P.glow[2]}};
        makeBackdrop(bgBrowser, (int)c.w, (int)c.h, 160, os, 4, ob, 3);
      } else makeBackdrop(bgBrowser, (int)c.w, (int)c.h, 160, st, 4, bl, 3);
      bgBrowser.key = bkey;
    }
    g.pushClipRR(c, 18);
    drawHalf(g, bgBrowser, R{c.x, c.y, 0, 0}, c);
    g.popClip();
    strokeRR(g, R{c.x + 0.5f, c.y + 0.5f, c.w - 1, c.h - 1}, 18, edgeC());
    g.line(Pt{c.x + 18, c.y + 1.5f}, Pt{c.x + c.w - 18, c.y + 1.5f}, Pen(argb(71, 255, 255, 255), 1));
    text(g, L"PRESET BROWSER", R{c.x + 12, c.y + 6, 200, 18}, 10.5f, true, rgb(accent()), 0);
    {   // HIDE
      const R h = bHide(); const bool hot = bHover == 1;
      inset(g, h, 7, hot);
      text(g, L"HIDE \u25B8", h, 9, true, rgb(hot ? kText : kDim));
    }
    // tabs
    const std::wstring tabs[2] = {L"FACTORY  " + std::to_wstring(kNumPresets), L"USER BANK  " + std::to_wstring(menuBank.size())};
    {
      const R all{bTabR(0).x, bTabR(0).y, bTabR(0).w * 2, bTabR(0).h};
      inset(g, all, 9);
      for (int t = 0; t < 2; t++) {
        const R r = bTabR(t);
        if (t == bTab) fillRR(g, R{r.x + 2, r.y + 2, r.w - 4, r.h - 4}, 7, rgb(accent()));
        text(g, tabs[t], r, 10, true, t == bTab ? rgb(kOnAccent) : rgb(bHover == 10 + t ? kText : kDim));
      }
    }
    // categories
    inset(g, R{c.x + 8, c.y + 68, 126, bList().h + 34}, 10);
    for (int i = 0; i < bNumCats(); i++) {
      const R r = bCatR(i);
      const bool sel = i == bCat, hot = bHover == 100 + i;
      int n = 0;
      std::wstring label;
      if (bTab == 0) { for (int k : fCats[i].presets) n += !lib.deleted(k); label = fCats[i].label; }
      else { for (const BankPreset& p : menuBank) n += p.section == i; label = toW(kBankSections[i]); }
      if (sel || hot) fillRR(g, R{r.x, r.y, r.w, r.h}, 7, sel ? rgb(accent(), 46) : argb(23, 255, 255, 255));
      if (sel) g.fillRect(R{r.x, r.y + 4, 2.5f, r.h - 8}, rgb(accent()));
      if (rowMoving && i == dropCat) {   // beta 0.5: where the sound being dragged would go
        fillRR(g, r, 5, rgb(accent(), 70));
        strokeRR(g, R{r.x + 0.5f, r.y + 0.5f, r.w - 1, r.h - 1}, 5, rgb(accent()));
      }
      const Col col = sel ? rgb(kText) : n ? rgb(hot ? kText : kDim) : rgb(kFaint);
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
      text(g, up + L"  \u00B7  " + std::to_wstring(rows.size()), R{hd.x + 2, hd.y, hd.w - 124, hd.h}, 9.5f, true, rgb(kDim), 0);
      const bool en = bMoveEnabled();
      for (int d : {-1, 1}) {
        const R b = bMoveR(d);
        const bool hot = en && bHover == (d < 0 ? 20 : 21);
        inset(g, b, 7, hot);
        text(g, d < 0 ? L"\u25B2  UP" : L"\u25BC  DOWN", b, 9, true, en ? rgb(hot ? kText : kDim) : rgb(kFaint));
      }
    }
    inset(g, R{l.x - 4, l.y - 4, l.w + 22, l.h + 8}, 10);   // the list and its scroll bar
    const int vis = bVisibleRows();
    if (rows.empty())
      text(g, bTab == 1 ? L"Empty — SAVE TO BANK keeps the sound you hear here." : L"No preset.", R{l.x + 8, l.y + 8, l.w - 16, 18}, 10, false, rgb(kFaint), 0);
    for (int j = 0; j < vis && j + bScroll < (int)rows.size(); j++) {
      const int row = rows[j + bScroll];
      const R r = bRowR(j);
      const bool cur = bRowIsCurrent(row), hot = bHover == 1000 + j;
      if (cur || hot) fillRR(g, r, 6, cur ? rgb(accent(), 52) : argb(23, 255, 255, 255));
      if (cur) g.fillRect(R{r.x, r.y + 3, 2.5f, r.h - 6}, rgb(accent()));
      std::string name;
      bool fav = false, adj = false;
      int vote = 0;
      if (bTab == 0) { name = lib.name(row); fav = lib.inTop(row); adj = lib.adjusted(row); vote = lib.stars(row); }   // ★ = in TOP Sounds
      else { name = menuBank[row].name; vote = menuBank[row].stars; }
      drawRowStars(g, bStarsR(j), vote);   // beta 0.3.1: the rating, at the right of the row
      float right = bStarsR(j).x - 6;
      if (adj) {   // adjusted by the player
        const R p{right - 26, r.y + 5, 26, r.h - 10};
        fillRR(g, p, 3, rgb(accent(), 40));
        text(g, L"ADJ", p, 8, true, rgb(accent()));
        right -= 30;
      }
      if (fav) { starShape(g, right - 7, r.y + r.h / 2, 5, rgb(kAccentA)); right -= 16; }   // a favourite (in TOP Sounds)
      nameText(g, name, R{r.x + 8, r.y, right - r.x - 10, r.h}, 11.5f, cur, cur ? rgb(0xffffff) : rgb(kText), 255);
    }
    if ((int)rows.size() > vis) {   // scroll bar (beta 0.4: wide enough for a trackpad; drag the thumb or click the bar)
      const R s = bScrollR(), t = bThumb((int)rows.size());
      fillRR(g, s, 4, rgb(0xffffff, 16));
      fillRR(g, R{t.x + 1, t.y + 1, t.w - 2, t.h - 2}, 4, rgb(0xffffff, bHover == 30 || bDrag ? 110 : 70));
    }
    // buttons
    const wchar_t* labels[kBtns] = {L"TO BANK\u2026", L"RESTORE", L"DELETE", L"EXPORT\u2026", L"IMPORT\u2026"};
    for (int b = 0; b < kBtns; b++) {
      const R r = bBtnR(b);
      const bool en = bBtnEnabled(b), hot = en && bHover == 500 + b;
      inset(g, r, 8, hot);
      text(g, labels[b], r, 9, true, en ? (b == 2 && hot ? rgb(0xff6b6b) : rgb(hot ? kText : kDim)) : rgb(kFaint));
    }
    // status: the last message, else the library in one line
    std::wstring st = bStatus;
    if (rowMoving) st = bTab == 0 ? L"Drop it on a category: it moves there (on TOP Sounds: added to it)." : L"Drop it on a section: it moves there.";
    if (st.empty())
      st = std::to_wstring(lib.adjustedCount()) + L" adjusted \u00B7 " + std::to_wstring(lib.deletedCount()) + L" deleted \u00B7 " +
           std::to_wstring(menuBank.size()) + L" in the user bank \u00B7 OKTOMULTIWAVE presets.txt";
    g.textEllipsis(st, R{c.x + 12, c.y + c.h - 21, c.w - 24, 14}, 9, false, rgb(kDim), false);   // (version 1.0.6: under the buttons; at y 684 it was drawn over the rows of the list since the panel was compacted)
    if (rowMoving && rowDrag >= 0) {   // beta 0.5: the sound being dragged, under the pointer (inside the browser)
      const std::string nm = bTab == 0 ? lib.name(rowDrag) : rowDrag < (int)menuBank.size() ? menuBank[rowDrag].name : "";
      const float w = std::min(c.w - 8, g.textWidth(toW(nm), 11, true) + 20);
      const R gr{std::max(c.x + 4, std::min(rowX + 14, c.x + c.w - w - 4)), std::max(c.y + 4, std::min(rowY - 10, c.y + c.h - 24)), w, 20};
      fillRR(g, gr, 5, rgb(accent(), 225));
      g.textEllipsis(toW(nm), R{gr.x + 10, gr.y, gr.w - 14, gr.h}, 11, true, rgb(kOnAccent), true);
    }
  }
  void starShape(Canvas& g, float cx, float cy, float r, Col c) {
    Pt p[10];
    for (int k = 0; k < 10; k++) {
      const double a = PI * k / 5, rr = k % 2 ? r * 0.45 : r;
      p[k] = Pt{cx + (float)(rr * std::sin(a)), cy - (float)(rr * std::cos(a))};
    }
    g.fillPolygon(p, 10, c);
  }
  // beta 0.3.1: the left half of a star (the star clipped at x = cx)
  void starHalf(Canvas& g, float cx, float cy, float r, Col c) {
    Pt p[10], q[24]; int n = 0;
    for (int k = 0; k < 10; k++) {
      const double a = PI * k / 5, rr = k % 2 ? r * 0.45 : r;
      p[k] = Pt{cx + (float)(rr * std::sin(a)), cy - (float)(rr * std::cos(a))};
    }
    for (int k = 0; k < 10; k++) {
      const Pt a = p[k], b = p[(k + 1) % 10];
      const bool ain = a.x <= cx, bin = b.x <= cx;
      if (ain) q[n++] = a;
      if (ain != bin) { const float t = (cx - a.x) / (b.x - a.x); q[n++] = Pt{cx, a.y + t * (b.y - a.y)}; }
    }
    if (n >= 3) g.fillPolygon(q, n, c);
  }
  // beta 0.3.1: the rating of a sound at the right of its row in the preset browser: five stars with half stars (n = 0..10)
  static constexpr float kStarW = 12;
  R bStarsR(int j) const { const R r = bRowR(j); return R{r.x + r.w - 6 - 5 * kStarW, r.y, 5 * kStarW, r.h}; }
  void drawRowStars(Canvas& g, const R& s, int n) {
    for (int i = 0; i < 5; i++) {
      const float cx = s.x + i * kStarW + kStarW / 2, cy = s.y + s.h / 2;
      starShape(g, cx, cy, 5, rgb(0xffffff, n > 0 ? 34 : 22));   // the empty star
      if (n >= 2 * i + 2) starShape(g, cx, cy, 5, rgb(kAccentA));
      else if (n == 2 * i + 1) starHalf(g, cx, cy, 5, rgb(kAccentA));
    }
  }
  // a click on the stars of a row (dx: where, from the left of the stars): the left half of a star gives a half star, the right half the whole star, 1..10;
  // a click on the rating the sound already has clears it. The rating is kept in the presets file (EXPORT carries it).
  void bRate(int row, float dx) {
    Library& lib = Library::get();
    const int idx = std::max(0, std::min(4, (int)(dx / kStarW)));
    int n = idx * 2 + (dx - idx * kStarW < kStarW / 2 ? 1 : 2);
    const bool fac = bTab == 0;
    if (!fac && (row < 0 || row >= (int)menuBank.size())) return;
    const int cur = fac ? lib.stars(row) : menuBank[row].stars;
    if (n == cur) n = 0;
    const std::string nm = fac ? lib.name(row) : menuBank[row].name;
    const std::wstring e = fac ? lib.setStars(row, n) : lib.setUserStars(menuBank[row].section, menuBank[row].name, n);
    if (libError(e, L"Could not save the presets file:")) return;
    menuBank = lib.bank();
    bStatus = L"“" + toW(nm) + L"”: " + (n ? std::to_wstring(n) + L" / 10 stars" : std::wstring(L"rating cleared")) + L" (EXPORT… keeps your stars).";
    invalidateLogical(bCard());
  }
  void drawSaveBtn(Canvas& g) {
    const R r = kSaveBtn;
    const bool hot = hover == -2;
    inset(g, r, 9, hot);
    text(g, L"SAVE", R{r.x, r.y + 3, r.w, 12}, 9.5f, true, rgb(kDim));
    text(g, L"PRESET", R{r.x, r.y + 14, r.w, 14}, 10.5f, true, rgb(accent()));
  }
  // version 1.0.13: PLAY DEMO, left of SAVE PRESET: the web app's demo (the piece as a tour of the presets); while it plays, STOP DEMO
  void drawDemoBtn(Canvas& g) {
    const R r = kDemoBtn;
    const bool hot = hover == -3, on = demoShown != -1;
    inset(g, r, 9, hot || on);
    text(g, on ? L"■ STOP" : L"▶ PLAY", R{r.x, r.y + 3, r.w, 12}, 9.5f, true, rgb(on ? accent() : kDim));
    text(g, L"DEMO", R{r.x, r.y + 14, r.w, 14}, 10.5f, true, rgb(accent()));
  }
  void toggleDemo() {
    auto sh = host->sharedState();
    if (sh) sh->demoCmd.store(sh->demoScene.load() != -1 ? 2 : 1);
  }
  void drawMenu(Canvas& g, int idx) {   // a choice parameter as a drop-down (LFO 2 TARGET)
    const Item& it = items[idx];
    const ParamDef& p = kParams[it.w->param];
    const int v = (int)jsRound(plainOf(it.w->param));
    const bool hot = hover == idx;
    fillRR(g, it.r, 9, Brush(insetC()));
    strokeRR(g, R{it.r.x + 0.5f, it.r.y + 0.5f, it.r.w - 1, it.r.h - 1}, 9, edgeC(hot));
    g.textEllipsis(toW(p.choiceShort[v]), R{it.r.x + (kSections[it.section].tabbed ? 5.f : 6.f), it.r.y, it.r.w - 19, it.r.h}, 9.5f, true, rgb(accent()), true);   // (beta 0.3.4: the TARGET menu is 80 px wide: a long name ends with \u2026)
    text(g, L"\u25BE", R{it.r.x + it.r.w - 14, it.r.y, 12, it.r.h}, 9, false, rgb(kDim));
    if (it.w->text) {   // beta 0.6: its caption
      const std::wstring cap = toW(it.w->text);
      text(g, cap, R{it.r.x, it.r.y - 17, it.r.w, 14}, 9.5f, true, rgb(kDim));
    }
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
    const int z[] = {50, 60, 70, 80, 90, 100, 115, 130, 150};
    std::vector<MenuItem> m;
    const bool fit = host->zoom() <= 0;
    const int cur = fit ? 0 : (int)std::lround(host->zoom() * 100);
    m.push_back(MenuItem::item(L"Fit the window to the screen (" + std::to_wstring((int)std::lround(autoZ * 100)) + L"%)", 1, fit));
    m.push_back(MenuItem::sep());
    for (int k : z) m.push_back(MenuItem::item(L"Window size " + std::to_wstring(k) + L"%", k, k == cur));
    const int cmd = win ? win->popupMenu(m, it.r.x, it.r.y + it.r.h) : 0;
    if (cmd == 1 && !fit) { host->setZoom(0); requestResize(); }
    else if (cmd > 1 && cmd != cur) { host->setZoom(cmd / 100.0); requestResize(); }
  }

  void openManual(const wchar_t* file) {
    // <bundle>.vst3/Contents/<binary folder>/<binary>  ->  <bundle>.vst3/Contents/Resources/manual/<file>
    const std::wstring man = contentsFolder() + kPathSep + L"Resources" + kPathSep + L"manual" + kPathSep + file;
    if (!fileExists(man)) {
      if (win) win->message(L"The manual was not found:\n" + man + L"\n\nInstall the complete OktoMultiWaveSynth.vst3 bundle folder.", false);
      return;
    }
    if (win) win->openDocument(man);
  }
};

IPlugView* createEditor(EditorHost* host, FUnknown* keepAlive) { return new Editor(host, keepAlive); }

}  // namespace ws
