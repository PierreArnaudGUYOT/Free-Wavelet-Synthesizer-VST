// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// machost.mm - a small DAW-like VST3 host for macOS (Mac port of beta 0.3), run by the GitHub workflow on Apple's machines:
// loads WaveletSynthesizer.vst3 as Live does (bundleEntry, factory, processor + controller connected), plays notes, checks
// the sound, the states and a few presets, then opens the editor in a window, takes screenshots (PNG) and drives it with
// mouse events: the preset browser, the engine tab, a knob, HIDE and back, and the presets library with its save and
// delete windows (answered by a timer, as a player would). Every result is a PASS / FAIL line; the exit code is the
// number of failures.
//   machost <WaveletSynthesizer.vst3> <output folder>
// Environment: WS_PRESETS_FILE is set to a file in the output folder, so the player's presets are never touched.
#define __ASSERT_MACROS_DEFINE_VERSIONS_WITHOUT_UNDERSCORES 0
#import <Cocoa/Cocoa.h>
#include <objc/message.h>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <map>
#include <sstream>
#include <string>
#include <vector>
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "dsp.h"   // the panel layout (generated spec): where the widgets are

using namespace Steinberg;
using namespace Steinberg::Vst;

static int gPass = 0, gFail = 0;
static void check(bool ok, const std::string& what, const std::string& detail = "") {
  std::printf("  [%s] %s%s%s\n", ok ? "PASS" : "FAIL", what.c_str(), detail.empty() ? "" : "  -- ", detail.c_str());
  std::fflush(stdout);
  (ok ? gPass : gFail)++;
}
static std::string fmt(const char* f, ...) {
  char b[512]; va_list a; va_start(a, f); std::vsnprintf(b, sizeof b, f, a); va_end(a); return b;
}

// ------------------------------------------------------------------ host objects
#define REFCOUNT                                                        \
  std::atomic<uint32> refs{1};                                          \
  uint32 PLUGIN_API addRef() override { return ++refs; }                \
  uint32 PLUGIN_API release() override { uint32 r = --refs; if (!r) delete this; return r; }

class Stream : public IBStream {
 public:
  REFCOUNT
  std::vector<char> data; int64 pos = 0;
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(iid, IBStream::iid) || FUnknownPrivate::iidEqual(iid, FUnknown::iid)) { addRef(); *obj = this; return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
  tresult PLUGIN_API read(void* buffer, int32 n, int32* got) override {
    int32 k = (int32)std::max<int64>(0, std::min<int64>(n, (int64)data.size() - pos));
    if (k > 0) std::memcpy(buffer, data.data() + pos, k);
    pos += k; if (got) *got = k; return kResultOk;
  }
  tresult PLUGIN_API write(void* buffer, int32 n, int32* put) override {
    if (pos + n > (int64)data.size()) data.resize(pos + n);
    std::memcpy(data.data() + pos, buffer, n); pos += n; if (put) *put = n; return kResultOk;
  }
  tresult PLUGIN_API seek(int64 p, int32 mode, int64* result) override {
    int64 np = mode == kIBSeekSet ? p : mode == kIBSeekCur ? pos + p : (int64)data.size() + p;
    if (np < 0) return kResultFalse;
    pos = np; if (result) *result = pos; return kResultOk;
  }
  tresult PLUGIN_API tell(int64* p) override { if (p) *p = pos; return kResultOk; }
  virtual ~Stream() = default;
};

class Queue : public IParamValueQueue {
 public:
  REFCOUNT
  ParamID id; std::vector<std::pair<int32, ParamValue>> pts;
  explicit Queue(ParamID i) : id(i) {}
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(iid, IParamValueQueue::iid) || FUnknownPrivate::iidEqual(iid, FUnknown::iid)) { addRef(); *obj = this; return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
  ParamID PLUGIN_API getParameterId() override { return id; }
  int32 PLUGIN_API getPointCount() override { return (int32)pts.size(); }
  tresult PLUGIN_API getPoint(int32 i, int32& off, ParamValue& v) override {
    if (i < 0 || i >= (int32)pts.size()) return kResultFalse;
    off = pts[i].first; v = pts[i].second; return kResultOk;
  }
  tresult PLUGIN_API addPoint(int32 off, ParamValue v, int32& index) override { pts.push_back({off, v}); index = (int32)pts.size() - 1; return kResultOk; }
  virtual ~Queue() = default;
};
class Changes : public IParameterChanges {
 public:
  REFCOUNT
  std::vector<Queue*> qs;
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(iid, IParameterChanges::iid) || FUnknownPrivate::iidEqual(iid, FUnknown::iid)) { addRef(); *obj = this; return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
  int32 PLUGIN_API getParameterCount() override { return (int32)qs.size(); }
  IParamValueQueue* PLUGIN_API getParameterData(int32 i) override { return i >= 0 && i < (int32)qs.size() ? qs[i] : nullptr; }
  IParamValueQueue* PLUGIN_API addParameterData(const ParamID& id, int32& index) override {
    for (size_t i = 0; i < qs.size(); i++) if (qs[i]->id == id) { index = (int32)i; return qs[i]; }
    qs.push_back(new Queue(id)); index = (int32)qs.size() - 1; return qs.back();
  }
  void clear() { for (auto* q : qs) q->release(); qs.clear(); }
  virtual ~Changes() { clear(); }
};
class Events : public IEventList {
 public:
  REFCOUNT
  std::vector<Event> ev;
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(iid, IEventList::iid) || FUnknownPrivate::iidEqual(iid, FUnknown::iid)) { addRef(); *obj = this; return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
  int32 PLUGIN_API getEventCount() override { return (int32)ev.size(); }
  tresult PLUGIN_API getEvent(int32 i, Event& e) override { if (i < 0 || i >= (int32)ev.size()) return kResultFalse; e = ev[i]; return kResultOk; }
  tresult PLUGIN_API addEvent(Event& e) override { ev.push_back(e); return kResultOk; }
  virtual ~Events() = default;
};
// edits made in the editor arrive here, as in a DAW
class Handler : public IComponentHandler {
 public:
  REFCOUNT
  std::map<ParamID, ParamValue> edits; int restarts = 0;
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(iid, IComponentHandler::iid) || FUnknownPrivate::iidEqual(iid, FUnknown::iid)) { addRef(); *obj = this; return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
  tresult PLUGIN_API beginEdit(ParamID) override { return kResultOk; }
  tresult PLUGIN_API performEdit(ParamID id, ParamValue v) override { edits[id] = v; return kResultOk; }
  tresult PLUGIN_API endEdit(ParamID) override { return kResultOk; }
  tresult PLUGIN_API restartComponent(int32) override { restarts++; return kResultOk; }
  virtual ~Handler() = default;
};
// the editor's container: resizeView resizes the window, as Live does
class Frame : public IPlugFrame {
 public:
  REFCOUNT
  NSWindow* win = nil; NSView* box = nil; int resizes = 0;
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(iid, IPlugFrame::iid) || FUnknownPrivate::iidEqual(iid, FUnknown::iid)) { addRef(); *obj = this; return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
  tresult PLUGIN_API resizeView(IPlugView* view, ViewRect* r) override {
    if (!view || !r) return kInvalidArgument;
    resizes++;
    [win setContentSize:NSMakeSize(r->getWidth(), r->getHeight())];
    box.frame = NSMakeRect(0, 0, r->getWidth(), r->getHeight());
    view->onSize(r);
    return kResultOk;
  }
  virtual ~Frame() = default;
};

// ------------------------------------------------------------------ helpers
static void pump(double seconds) {   // lets the editor's timer and drawing run
  NSDate* until = [NSDate dateWithTimeIntervalSinceNow:seconds];
  while ([until timeIntervalSinceNow] > 0) {
    NSEvent* e = [NSApp nextEventMatchingMask:NSEventMaskAny untilDate:[NSDate dateWithTimeIntervalSinceNow:0.01] inMode:NSDefaultRunLoopMode dequeue:YES];
    if (e) [NSApp sendEvent:e];
  }
}
static std::string readFile(const std::string& p) { std::ifstream f(p, std::ios::binary); std::stringstream s; s << f.rdbuf(); return s.str(); }

struct Plug {
  IComponent* comp = nullptr; IAudioProcessor* proc = nullptr; IEditController* ctl = nullptr;
  IConnectionPoint *cpA = nullptr, *cpB = nullptr;
  Handler* handler = new Handler();
};

static float renderNote(Plug& p, int note, double seconds, double sr, int block, bool& finite) {
  std::vector<float> L(block), Rr(block);
  float* outs[2] = {L.data(), Rr.data()};
  AudioBusBuffers out{}; out.numChannels = 2; out.channelBuffers32 = outs;
  Events* ev = new Events(); Changes* in = new Changes(); Changes* outc = new Changes();
  ProcessData d{};
  d.processMode = kRealtime; d.symbolicSampleSize = kSample32; d.numSamples = block;
  d.numOutputs = 1; d.outputs = &out; d.inputEvents = ev; d.inputParameterChanges = in; d.outputParameterChanges = outc;
  double sum = 0; long n = 0; finite = true;
  const int blocks = (int)(seconds * sr / block);
  for (int b = 0; b < blocks; b++) {
    ev->ev.clear();
    if (b == 0) { Event e{}; e.type = Event::kNoteOnEvent; e.noteOn.pitch = (int16)note; e.noteOn.velocity = 0.8f; e.noteOn.noteId = -1; ev->ev.push_back(e); }
    if (b == blocks * 2 / 3) { Event e{}; e.type = Event::kNoteOffEvent; e.noteOff.pitch = (int16)note; e.noteOff.velocity = 0; e.noteOff.noteId = -1; ev->ev.push_back(e); }
    p.proc->process(d);
    outc->clear();
    if (b < blocks * 2 / 3)
      for (int i = 0; i < block; i++) { if (!std::isfinite(L[i]) || !std::isfinite(Rr[i])) finite = false; sum += L[i] * (double)L[i] + Rr[i] * (double)Rr[i]; n += 2; }
  }
  ev->release(); in->release(); outc->release();
  return (float)std::sqrt(sum / std::max(1L, n));
}

// the widgets' places, as the editor lays them out (logical units; the browser is to the right of the panel)
struct Spot { int type, param; float x, y, w, h; };
static std::vector<Spot> spots() {
  std::vector<Spot> v;
  for (int s = 0; s < ws::kNumSections; s++) {
    const ws::SectionDef& sd = ws::kSections[s];
    for (int k = 0; k < sd.numWidgets; k++) {
      const ws::WidgetDef& w = ws::kWidgets[sd.firstWidget + k];
      v.push_back(Spot{w.type, w.param, sd.x + w.x, sd.y + w.y, w.w, w.h});
    }
  }
  return v;
}
static Spot find(int type, int param = -2) {
  for (const Spot& s : spots()) if (s.type == type && (param == -2 || s.param == param)) return s;
  return Spot{-1, -1, 0, 0, 0, 0};
}

// mouse events on the plug-in's view, at logical coordinates (zoom 100 %: logical = points)
static void mouse(NSView* v, NSEventType t, float x, float y, int clicks = 1, NSEventModifierFlags mods = 0) {
  const NSPoint p = [v convertPoint:NSMakePoint(x, y) toView:nil];   // the view is flipped: y down
  NSEvent* e = [NSEvent mouseEventWithType:t location:p modifierFlags:mods timestamp:[NSProcessInfo processInfo].systemUptime
                              windowNumber:v.window.windowNumber context:nil eventNumber:0 clickCount:clicks pressure:1];
  switch (t) {
    case NSEventTypeLeftMouseDown: [v mouseDown:e]; break;
    case NSEventTypeLeftMouseUp: [v mouseUp:e]; break;
    case NSEventTypeLeftMouseDragged: [v mouseDragged:e]; break;
    case NSEventTypeMouseMoved: [v mouseMoved:e]; break;
    default: break;
  }
}
static void click(NSView* v, float x, float y) { mouse(v, NSEventTypeLeftMouseDown, x, y); mouse(v, NSEventTypeLeftMouseUp, x, y); pump(0.15); }

static bool shot(NSView* v, const std::string& path) {
  [v display];
  NSBitmapImageRep* rep = [v bitmapImageRepForCachingDisplayInRect:v.bounds];
  if (!rep) return false;
  [v cacheDisplayInRect:v.bounds toBitmapImageRep:rep];
  NSData* png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
  return [png writeToFile:[NSString stringWithUTF8String:path.c_str()] atomically:YES];
}
// distinct colours in a sample of the view's pixels (a blank or broken drawing has very few)
static int colours(NSView* v, NSRect r) {
  NSBitmapImageRep* rep = [v bitmapImageRepForCachingDisplayInRect:v.bounds];
  [v cacheDisplayInRect:v.bounds toBitmapImageRep:rep];
  std::map<uint32_t, int> seen;
  const double sx = rep.pixelsWide / v.bounds.size.width, sy = rep.pixelsHigh / v.bounds.size.height;
  for (int y = (int)r.origin.y; y < (int)(r.origin.y + r.size.height); y += 3)
    for (int x = (int)r.origin.x; x < (int)(r.origin.x + r.size.width); x += 3) {
      NSUInteger px[4] = {};
      [rep getPixel:px atX:(NSInteger)(x * sx) y:(NSInteger)(y * sy)];
      seen[(uint32_t)((px[0] << 16) | (px[1] << 8) | px[2])]++;
    }
  return (int)seen.size();
}

// the save / question windows of the editor, answered as a player would: the name typed, then the first button
static std::string gTypeName;
static int gAnswered = 0;
static void answerModal(CFRunLoopTimerRef, void*) {
  NSWindow* w = [NSApp modalWindow];
  if (!w) return;
  if (!gTypeName.empty()) {
    NSMutableArray* todo = [NSMutableArray arrayWithObject:w.contentView];
    while (todo.count) {
      NSView* v = todo.lastObject; [todo removeLastObject];
      if ([v isKindOfClass:[NSTextField class]] && [((NSTextField*)v).identifier isEqualToString:@"ws.name"])
        ((NSTextField*)v).stringValue = [NSString stringWithUTF8String:gTypeName.c_str()];
      [todo addObjectsFromArray:v.subviews];
    }
  }
  gAnswered++;
  [NSApp stopModalWithCode:NSAlertFirstButtonReturn];
}

int main(int argc, char** argv) {
  @autoreleasepool {
    if (argc < 3) { std::fprintf(stderr, "usage: machost <WaveletSynthesizer.vst3> <outdir>\n"); return 2; }
    const std::string bundlePath = argv[1], out = argv[2];
    const std::string presets = out + "/OKTOWAVE presets (test).txt", exported = out + "/exported presets.txt";
    std::remove(presets.c_str());
    setenv("WS_PRESETS_FILE", presets.c_str(), 1);
    setenv("WS_PRESETS_EXPORT", exported.c_str(), 1);
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    [NSApp finishLaunching];
    std::printf("Wavelet Synthesizer - macOS host test (%s, %s)\n", bundlePath.c_str(),
#if defined(__aarch64__)
                "arm64"
#else
                "x86_64"
#endif
    );

    // ---------------------------------------------------------------- the bundle
    std::printf("[Bundle]\n");
    NSString* bp = [NSString stringWithUTF8String:bundlePath.c_str()];
    NSDictionary* info = [NSDictionary dictionaryWithContentsOfFile:[bp stringByAppendingPathComponent:@"Contents/Info.plist"]];
    check(info && [info[@"CFBundlePackageType"] isEqualToString:@"BNDL"] && [info[@"CFBundleExecutable"] isEqualToString:@"WaveletSynthesizer"],
          "Info.plist: a BNDL bundle, executable WaveletSynthesizer", info ? std::string([[info description] UTF8String]).substr(0, 0) : "missing");
    check([[NSFileManager defaultManager] fileExistsAtPath:[bp stringByAppendingPathComponent:@"Contents/Resources/manual/manual-a.html"]],
          "the manuals are in Contents/Resources/manual");
    CFURLRef url = CFURLCreateWithFileSystemPath(nullptr, (__bridge CFStringRef)bp, kCFURLPOSIXPathStyle, true);
    CFBundleRef bundle = CFBundleCreate(nullptr, url);
    CFRelease(url);
    check(bundle && CFBundleLoadExecutable(bundle), "the binary loads");
    if (!bundle) return 1;
    typedef bool (*EntryFn)(CFBundleRef);
    typedef IPluginFactory* (*FactoryFn)();
    auto entry = (EntryFn)CFBundleGetFunctionPointerForName(bundle, CFSTR("bundleEntry"));
    auto exitf = (bool (*)())CFBundleGetFunctionPointerForName(bundle, CFSTR("bundleExit"));
    auto getf = (FactoryFn)CFBundleGetFunctionPointerForName(bundle, CFSTR("GetPluginFactory"));
    check(entry && exitf && getf, "exports bundleEntry, bundleExit, GetPluginFactory");
    if (!entry || !getf) return 1;
    check(entry(bundle), "bundleEntry");
    IPluginFactory* f = getf();
    PFactoryInfo fi; f->getFactoryInfo(&fi);
    check(std::strcmp(fi.vendor, "OktoPierre") == 0, "factory vendor OktoPierre", fi.vendor);
    TUID procCid{}, ctlCid{}; bool haveP = false, haveC = false;
    for (int i = 0; i < f->countClasses(); i++) {
      PClassInfo ci; f->getClassInfo(i, &ci);
      if (std::strcmp(ci.category, kVstAudioEffectClass) == 0) { std::memcpy(procCid, ci.cid, sizeof(TUID)); haveP = true; std::printf("  class: %s\n", ci.name); }
      if (std::strcmp(ci.category, kVstComponentControllerClass) == 0) { std::memcpy(ctlCid, ci.cid, sizeof(TUID)); haveC = true; }
    }
    check(haveP && haveC, "an audio processor class and a controller class");

    // ---------------------------------------------------------------- processor + controller, connected
    std::printf("[Audio]\n");
    Plug p;
    f->createInstance(procCid, IComponent::iid, (void**)&p.comp);
    f->createInstance(ctlCid, IEditController::iid, (void**)&p.ctl);
    check(p.comp && p.ctl, "processor and controller created");
    if (!p.comp || !p.ctl) return 1;
    check(p.comp->initialize(nullptr) == kResultOk && p.ctl->initialize(nullptr) == kResultOk, "initialize");
    p.comp->queryInterface(IAudioProcessor::iid, (void**)&p.proc);
    p.comp->queryInterface(IConnectionPoint::iid, (void**)&p.cpA);
    p.ctl->queryInterface(IConnectionPoint::iid, (void**)&p.cpB);
    if (p.cpA && p.cpB) { p.cpA->connect(p.cpB); p.cpB->connect(p.cpA); }
    p.ctl->setComponentHandler(p.handler);
    const double sr = 48000; const int block = 512;
    ProcessSetup ps{kRealtime, kSample32, block, sr};
    check(p.proc && p.proc->setupProcessing(ps) == kResultOk, "setupProcessing 48 kHz / 512");
    SpeakerArrangement st = SpeakerArr::kStereo;
    p.proc->setBusArrangements(nullptr, 0, &st, 1);
    p.comp->activateBus(kAudio, kOutput, 0, true);
    p.comp->setActive(true);
    p.proc->setProcessing(true);
    bool finite = true;
    const float rms = renderNote(p, 60, 1.5, sr, block, finite);
    check(finite && rms > 1e-3f && rms < 2.0f, "a note on C4 sounds (default preset)", fmt("RMS %.4f", rms));
    // the state, read back
    Stream* s1 = new Stream(); p.comp->getState(s1); s1->pos = 0;
    Stream* c1 = new Stream(); p.ctl->getState(c1); c1->pos = 0;
    check(s1->data.size() > 16 && c1->data.size() > 4, "processor and controller states", fmt("%zu + %zu bytes", s1->data.size(), c1->data.size()));
    check(p.comp->setState(s1) == kResultOk && (s1->pos = 0, p.ctl->setComponentState(s1) == kResultOk) && p.ctl->setState(c1) == kResultOk, "states read back");
    s1->release(); c1->release();
    // a few presets of each engine (through the controller's program list: the editor's preset load)
    const int nParams = p.ctl->getParameterCount();
    check(nParams >= ws::kNumParams, "parameters", fmt("%d", nParams));
    p.proc->setProcessing(false); p.comp->setActive(false);
    p.proc->setupProcessing(ps); p.comp->setActive(true); p.proc->setProcessing(true);

    // ---------------------------------------------------------------- the editor
    std::printf("[Editor]\n");
    IPlugView* view = p.ctl->createView(ViewType::kEditor);
    check(view != nullptr, "createView(editor)");
    if (!view) return 1;
    check(view->isPlatformTypeSupported(kPlatformTypeNSView) == kResultTrue, "NSView supported");
    ViewRect vr; view->getSize(&vr);
    check(vr.getHeight() == 720 && (vr.getWidth() == 1100 || vr.getWidth() == 1460), "size: the panel (+ the preset browser)", fmt("%d x %d", vr.getWidth(), vr.getHeight()));
    Frame* frame = new Frame();
    frame->win = [[NSWindow alloc] initWithContentRect:NSMakeRect(80, 80, vr.getWidth(), vr.getHeight())
                                             styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    frame->box = frame->win.contentView;
    [frame->win orderFront:nil];
    view->setFrame(frame);
    check(view->attached((__bridge void*)frame->box, kPlatformTypeNSView) == kResultOk, "attached to an NSView");
    NSView* pv = frame->box.subviews.firstObject;
    check(pv != nil, "the editor's view is in the window");
    if (!pv) return 1;
    pump(0.6);
    check(shot(pv, out + "/mac_editor_open.png"), "screenshot mac_editor_open.png");
    const int cols = colours(pv, NSMakeRect(0, 0, 1100, 720));
    check(cols > 40, "the panel is drawn (many colours)", fmt("%d colours", cols));
    const int bcols = colours(pv, NSMakeRect(1104, 8, 348, 700));
    check(vr.getWidth() == 1100 || bcols > 10, "the preset browser is drawn", fmt("%d colours", bcols));
    const std::string font = [[NSFont systemFontOfSize:10].fontName UTF8String];
    std::printf("  system font: %s\n", font.c_str());
    {   // text widths against Windows' Segoe UI (GDI+ widths without the 1/6 em margins, measured on Windows 11)
      struct T { const char* s; float px; bool bold; double win; } ts[] = {
          {"WAVELET SYNTHESIZER", 9, true, 104.97}, {"A \xC2\xB7 Warm Pad", 12.5f, true, 82.79}, {"CUTOFF", 9.5f, true, 36.51},
          {"Daubechies 4", 12, true, 77.11}, {"Bells & Mallets", 11, false, 73.99}, {"ONE CYCLE \xC2\xB7 DRY (GREY) vs FILTERED", 9.5f, true, 171.38},
          {"OKTOWAVE", 13.5f, true, 78.69}, {"Screaming Lead", 11.5f, false, 82.86}};
      double sum = 0;
      for (const T& t : ts) {
        NSFont* fn = t.bold ? [NSFont boldSystemFontOfSize:t.px] : [NSFont systemFontOfSize:t.px];
        const double w = [[NSString stringWithUTF8String:t.s] sizeWithAttributes:@{NSFontAttributeName: fn}].width;
        std::printf("  font width %-38s %5.1f%s  mac %7.2f  windows %7.2f  ratio %.3f\n", t.s, t.px, t.bold ? " bold" : "     ", w, t.win, t.win / w);
        sum += t.win / w;
      }
      std::printf("  font width: mean Windows / Mac ratio %.3f\n", sum / (sizeof ts / sizeof *ts));
    }

    // a sound of the browser: the TOP Sounds list, its 5th row (the browser starts on the sound playing)
    std::map<ParamID, ParamValue> before;
    for (int i = 0; i < nParams; i++) { ParameterInfo pi; p.ctl->getParameterInfo(i, pi); before[pi.id] = p.ctl->getParamNormalized(pi.id); }
    auto changedParams = [&]() { int n = 0; for (auto& kv : before) if (std::fabs(p.ctl->getParamNormalized(kv.first) - kv.second) > 1e-9) n++; return n; };
    if (vr.getWidth() == 1460) {
      const float cx = 1100 + 4 + 12 + 30, catY0 = 8 + 72 + 12;   // the category column: TOP Sounds, Bass, ...
      click(pv, cx, catY0 + 26);                                    // Bass
      const float rowX = 1100 + 4 + 136 + 60, rowY0 = 8 + 98 + 11;
      click(pv, rowX, rowY0 + 22 * 4);                              // its 5th sound
      pump(0.3);
      const int ch = changedParams();
      check(ch > 0, "browser: Bass, 5th sound -> the sound changes", fmt("%d parameters changed", ch));
      shot(pv, out + "/mac_browser_bass.png");
    }
    // the engine tab B
    const Spot eng = find(ws::W_SEG, ws::P_ENGINE);
    ParamValue e0 = p.ctl->getParamNormalized(ws::P_ENGINE);
    click(pv, eng.x + eng.w * 0.75f, eng.y + eng.h / 2);
    pump(0.3);
    ParamValue e1 = p.ctl->getParamNormalized(ws::P_ENGINE);
    check(e1 > 0.5 && p.handler->edits.count(ws::P_ENGINE), "engine tab B: the parameter changes and the host hears it", fmt("%.2f -> %.2f", e0, e1));
    shot(pv, out + "/mac_engine_b.png");
    click(pv, eng.x + eng.w * 0.25f, eng.y + eng.h / 2);
    pump(0.2);
    check(p.ctl->getParamNormalized(ws::P_ENGINE) < 0.5, "engine tab A again");
    // a large knob dragged upwards
    Spot knob{-1, -1, 0, 0, 0, 0};
    for (const Spot& s : spots()) if (s.type == ws::W_KNOBL && s.param >= 0 && ws::kSections[0].mode != 1) { knob = s; break; }
    if (knob.type >= 0) {
      const float kx = knob.x + knob.w / 2, ky = knob.y + 32;
      const ParamValue k0 = p.ctl->getParamNormalized(knob.param);
      mouse(pv, NSEventTypeLeftMouseDown, kx, ky);
      for (int i = 1; i <= 10; i++) { mouse(pv, NSEventTypeLeftMouseDragged, kx, ky + (k0 > 0.5 ? 6.f : -6.f) * i); pump(0.02); }
      mouse(pv, NSEventTypeLeftMouseUp, kx, ky + (k0 > 0.5 ? 60.f : -60.f));
      pump(0.2);
      const ParamValue k1 = p.ctl->getParamNormalized(knob.param);
      check(std::fabs(k1 - k0) > 0.1, "a knob dragged with the mouse", fmt("%s: %.3f -> %.3f", ws::kParams[knob.param].name, k0, k1));
      // Cmd-click: back to its default
      mouse(pv, NSEventTypeLeftMouseDown, kx, ky, 1, NSEventModifierFlagCommand); mouse(pv, NSEventTypeLeftMouseUp, kx, ky); pump(0.2);
      check(std::fabs(p.ctl->getParamNormalized(knob.param) - k1) > 1e-6, "Cmd-click resets the knob");
    }
    // HIDE the browser, then the preset name brings it back
    if (vr.getWidth() == 1460) {
      const int r0 = frame->resizes;
      click(pv, 1100 + 4 + 336 - 70 + 29, 8 + 6 + 10);   // HIDE
      pump(0.3);
      ViewRect v2; view->getSize(&v2);
      check(v2.getWidth() == 1100 && frame->resizes > r0 && (int)frame->box.frame.size.width == 1100, "HIDE: the window becomes the panel alone", fmt("%d x %d", v2.getWidth(), v2.getHeight()));
      shot(pv, out + "/mac_browser_hidden.png");
      const Spot pr = find(ws::W_PRESETS);
      click(pv, pr.x + 120, pr.y + pr.h / 2);
      pump(0.3);
      view->getSize(&v2);
      check(v2.getWidth() == 1460, "a click on the preset name brings the browser back", fmt("%d", v2.getWidth()));
    }

    // ---------------------------------------------------------------- the presets library (save / delete windows answered)
    std::printf("[Library]\n");
    CFRunLoopTimerRef answer = CFRunLoopTimerCreate(nullptr, CFAbsoluteTimeGetCurrent() + 0.3, 0.3, 0, 0, answerModal, nullptr);
    CFRunLoopAddTimer(CFRunLoopGetMain(), answer, kCFRunLoopCommonModes);
    SEL testCmd = sel_registerName("wsTestCommand:");
    check([pv respondsToSelector:testCmd], "the view takes the developer test commands");
    // SAVE PRESET: the factory preset playing is adjusted under a new name
    gTypeName = "CI Mac Preset"; gAnswered = 0;
    ((void (*)(id, SEL, NSInteger))objc_msgSend)(pv, testCmd, 910);
    pump(0.3);
    std::string lib = readFile(presets);
    check(gAnswered >= 1 && lib.find("Preset: CI Mac Preset") != std::string::npos && lib.find("Adjusted: yes") != std::string::npos,
          "SAVE PRESET: the save window, then the presets file holds the adjusted preset", fmt("%zu bytes, %d windows", lib.size(), gAnswered));
    shot(pv, out + "/mac_saved.png");
    // to the user bank (Chords is chosen by default only for chords: the section proposed is kept)
    gTypeName = "CI Bank Sound"; gAnswered = 0;
    ((void (*)(id, SEL, NSInteger))objc_msgSend)(pv, testCmd, 900);
    pump(0.3);
    lib = readFile(presets);
    check(lib.find("Preset: CI Bank Sound") != std::string::npos, "TO BANK: the sound is in the user bank of the file");
    // DELETE a factory preset: the question is answered Yes
    gTypeName.clear(); gAnswered = 0;
    ((void (*)(id, SEL, NSInteger))objc_msgSend)(pv, testCmd, 1000);   // the bank sound first: DELETE then acts on the factory list
    pump(0.2);
    ((void (*)(id, SEL, NSInteger))objc_msgSend)(pv, testCmd, 100 + 3);   // the 4th factory preset
    pump(0.2);
    ((void (*)(id, SEL, NSInteger))objc_msgSend)(pv, testCmd, 913);
    pump(0.3);
    lib = readFile(presets);
    check(gAnswered >= 1 && lib.find("Deleted: yes") != std::string::npos, "DELETE: the question, then \"Deleted: yes\" in the file");
    ((void (*)(id, SEL, NSInteger))objc_msgSend)(pv, testCmd, 5000 + 3);   // back in the list
    pump(0.2);
    check(readFile(presets).find("Deleted: yes") == std::string::npos, "the deleted preset comes back");
    ((void (*)(id, SEL, NSInteger))objc_msgSend)(pv, testCmd, 901);   // EXPORT (to WS_PRESETS_EXPORT)
    pump(0.2);
    check(readFile(exported).find("CI Bank Sound") != std::string::npos, "EXPORT writes every preset and the user bank");
    shot(pv, out + "/mac_library.png");
    CFRunLoopTimerInvalidate(answer); CFRelease(answer);

    // ---------------------------------------------------------------- zoom, close, reopen
    std::printf("[Close]\n");
    check(view->removed() == kResultOk, "removed");
    check(frame->box.subviews.count == 0, "the view left the window");
    view->release();
    IPlugView* v2 = p.ctl->createView(ViewType::kEditor);
    check(v2 && v2->attached((__bridge void*)frame->box, kPlatformTypeNSView) == kResultOk, "a second editor opens");
    pump(0.3);
    if (v2) { shot(frame->box.subviews.firstObject, out + "/mac_editor_reopened.png"); v2->removed(); v2->release(); }
    [frame->win close];

    p.proc->setProcessing(false); p.comp->setActive(false);
    if (p.cpA && p.cpB) { p.cpA->disconnect(p.cpB); p.cpB->disconnect(p.cpA); p.cpA->release(); p.cpB->release(); }
    p.ctl->terminate(); p.comp->terminate();
    p.proc->release(); p.ctl->release(); p.comp->release();
    f->release();
    if (exitf) check(exitf(), "bundleExit");
    std::printf("Checks : %d PASS, %d FAIL\nRESULT: %s\n", gPass, gFail, gFail ? "FAIL" : "PASS");
    return gFail;
  }
}
