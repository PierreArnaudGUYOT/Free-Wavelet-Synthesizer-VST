// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
// Mac port (beta 0.3): the editor's macOS side — an NSView drawn with Core Graphics and Core Text, its pop-up menus and
// dialogs (Cocoa). The panel itself is editor.cpp, shared with Windows (editor_win.cpp). Compiled with ARC.
// The view's Objective-C class is created at run time under a name unique to this copy of the plug-in binary, so that two
// versions loaded in the same host never share a class.
#define __ASSERT_MACROS_DEFINE_VERSIONS_WITHOUT_UNDERSCORES 0
#import <Cocoa/Cocoa.h>
#include <CoreText/CoreText.h>
#include <objc/message.h>
#include <objc/runtime.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
#include <string>
#include <vector>
#include "pluginterfaces/gui/iplugview.h"
#include "common.h"
#include "bank.h"
#include "editor_platform.h"

namespace ws {

// The macOS system font is about 5 % wider than Windows' Segoe UI at the same size (measured by tests/machost: 0.92 for
// small bold capitals, 1.0 for mixed case): the panel was laid out with Segoe UI
static const double kFontScale = 0.95;

static NSString* ns(const std::wstring& s) {
  NSString* r = [[NSString alloc] initWithBytes:s.data() length:s.size() * sizeof(wchar_t) encoding:NSUTF32LittleEndianStringEncoding];
  return r ? r : @"";
}
static std::wstring wide(NSString* s) {
  if (!s) return L"";
  NSData* d = [s dataUsingEncoding:NSUTF32LittleEndianStringEncoding];
  return std::wstring((const wchar_t*)d.bytes, d.length / sizeof(wchar_t));
}

class MacWindow;

// ------------------------------------------------------------------ Core Graphics drawing (the view is flipped: y down)
class MacCanvas : public Canvas {
 public:
  MacCanvas(CGContextRef c, CGColorSpaceRef sp, std::map<int, CTFontRef>& f) : ctx(c), space(sp), fonts(f) {}
  void fillRect(R r, const Brush& b) override { CGMutablePathRef p = CGPathCreateMutable(); CGPathAddRect(p, nullptr, cg(r)); fill(p, b); CGPathRelease(p); }
  void fillRR(R r, float rad, const Brush& b) override { CGPathRef p = rr(r, rad); fill(p, b); CGPathRelease(p); }
  void strokeRR(R r, float rad, const Pen& pn) override { CGPathRef p = rr(r, rad); stroke(p, pn); CGPathRelease(p); }
  void fillEllipse(R r, const Brush& b) override { CGPathRef p = CGPathCreateWithEllipseInRect(cg(r), nullptr); fill(p, b); CGPathRelease(p); }
  void strokeEllipse(R r, const Pen& pn) override { CGPathRef p = CGPathCreateWithEllipseInRect(cg(r), nullptr); stroke(p, pn); CGPathRelease(p); }
  void arc(R b, float startDeg, float sweepDeg, const Pen& pn) override {
    CGMutablePathRef p = CGPathCreateMutable();
    const double a0 = startDeg * M_PI / 180, a1 = (startDeg + sweepDeg) * M_PI / 180;
    CGPathAddArc(p, nullptr, b.x + b.w / 2, b.y + b.h / 2, b.w / 2, a0, a1, false);   // y down: increasing angles turn clockwise
    stroke(p, pn); CGPathRelease(p);
  }
  void line(Pt a, Pt b, const Pen& pn) override {
    CGMutablePathRef p = CGPathCreateMutable();
    CGPathMoveToPoint(p, nullptr, a.x, a.y); CGPathAddLineToPoint(p, nullptr, b.x, b.y);
    stroke(p, pn); CGPathRelease(p);
  }
  void lines(const Pt* pts, int n, const Pen& pn) override {
    if (n < 2) return;
    CGMutablePathRef p = CGPathCreateMutable();
    CGPathMoveToPoint(p, nullptr, pts[0].x, pts[0].y);
    for (int i = 1; i < n; i++) CGPathAddLineToPoint(p, nullptr, pts[i].x, pts[i].y);
    stroke(p, pn); CGPathRelease(p);
  }
  void fillPolygon(const Pt* pts, int n, const Brush& b) override {
    if (n < 3) return;
    CGMutablePathRef p = CGPathCreateMutable();
    CGPathMoveToPoint(p, nullptr, pts[0].x, pts[0].y);
    for (int i = 1; i < n; i++) CGPathAddLineToPoint(p, nullptr, pts[i].x, pts[i].y);
    CGPathCloseSubpath(p);
    fill(p, b, true);   // even-odd, as GDI+ polygons
    CGPathRelease(p);
  }
  void text(const std::wstring& s, R r, float px, bool bold, Col c, int align, bool vcenter) override {
    if (s.empty()) return;
    CTLineRef ln = makeLine(s, px, bold, c);
    drawLine(ln, r, px, align, vcenter);
    CFRelease(ln);
  }
  void textEllipsis(const std::wstring& s, R r, float px, bool bold, Col c, bool vcenter) override {
    if (s.empty()) return;
    CTLineRef ln = makeLine(s, px, bold, c);
    const double avail = r.w - px / 3;
    if (CTLineGetTypographicBounds(ln, nullptr, nullptr, nullptr) > avail) {
      CTLineRef dots = makeLine(L"…", px, bold, c);
      CTLineRef t = CTLineCreateTruncatedLine(ln, avail, kCTLineTruncationEnd, dots);
      CFRelease(dots);
      if (t) { CFRelease(ln); ln = t; }
    }
    drawLine(ln, r, px, 0, vcenter);
    CFRelease(ln);
  }
  // as GDI+ measures a line: its width plus 1/6 em at each end
  float textWidth(const std::wstring& s, float px, bool bold) override {
    if (s.empty()) return px / 3;
    CTLineRef ln = makeLine(s, px, bold, argb(255, 0, 0, 0));
    const double w = CTLineGetTypographicBounds(ln, nullptr, nullptr, nullptr);
    CFRelease(ln);
    return (float)(w + px / 3);
  }
  void pixels(const uint32_t* argbPx, int w, int h, R dst) override {
    if (w <= 0 || h <= 0) return;
    CFDataRef data = CFDataCreate(nullptr, (const UInt8*)argbPx, (CFIndex)w * h * 4);
    CGDataProviderRef dp = CGDataProviderCreateWithCFData(data);
    CGImageRef img = CGImageCreate(w, h, 8, 32, (size_t)w * 4, space, kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst, dp, nullptr, false, kCGRenderingIntentDefault);
    CGContextSaveGState(ctx);
    CGContextSetInterpolationQuality(ctx, kCGInterpolationNone);
    CGContextTranslateCTM(ctx, dst.x, dst.y + dst.h);   // images are drawn bottom-up
    CGContextScaleCTM(ctx, 1, -1);
    CGContextDrawImage(ctx, CGRectMake(0, 0, dst.w, dst.h), img);
    CGContextRestoreGState(ctx);
    CGImageRelease(img); CGDataProviderRelease(dp); CFRelease(data);
  }

 private:
  CGContextRef ctx;
  CGColorSpaceRef space;
  std::map<int, CTFontRef>& fonts;

  static CGRect cg(R r) { return CGRectMake(r.x, r.y, r.w, r.h); }
  static CGPathRef rr(R r, float rad) {
    if (rad <= 0 || r.w <= 0 || r.h <= 0) return CGPathCreateWithRect(cg(r), nullptr);
    const CGFloat k = std::min<CGFloat>(rad, std::min(r.w, r.h) / 2 - 0.001);   // Core Graphics refuses a larger radius
    return k > 0 ? CGPathCreateWithRoundedRect(cg(r), k, k, nullptr) : CGPathCreateWithRect(cg(r), nullptr);
  }
  void setFill(Col c) { const CGFloat v[4] = {c.r / 255.0, c.g / 255.0, c.b / 255.0, c.a / 255.0}; CGContextSetFillColor(ctx, v); }
  void fill(CGPathRef p, const Brush& b, bool eo = false) {
    if (!b.grad) {
      setFill(b.c0);
      CGContextAddPath(ctx, p);
      if (eo) CGContextEOFillPath(ctx); else CGContextFillPath(ctx);
      return;
    }
    CGContextSaveGState(ctx);
    CGContextAddPath(ctx, p);
    if (eo) CGContextEOClip(ctx); else CGContextClip(ctx);
    const CGFloat comps[8] = {b.c0.r / 255.0, b.c0.g / 255.0, b.c0.b / 255.0, b.c0.a / 255.0, b.c1.r / 255.0, b.c1.g / 255.0, b.c1.b / 255.0, b.c1.a / 255.0};
    const CGFloat locs[2] = {0, 1};
    CGGradientRef gr = CGGradientCreateWithColorComponents(space, comps, locs, 2);
    CGContextDrawLinearGradient(ctx, gr, CGPointMake(b.p0.x, b.p0.y), CGPointMake(b.p1.x, b.p1.y),
                                kCGGradientDrawsBeforeStartLocation | kCGGradientDrawsAfterEndLocation);
    CGGradientRelease(gr);
    CGContextRestoreGState(ctx);
  }
  void stroke(CGPathRef p, const Pen& pn) {
    const CGFloat v[4] = {pn.c.r / 255.0, pn.c.g / 255.0, pn.c.b / 255.0, pn.c.a / 255.0};
    CGContextSetStrokeColor(ctx, v);
    CGContextSetLineWidth(ctx, pn.w);
    CGContextSetLineCap(ctx, pn.roundCaps ? kCGLineCapRound : kCGLineCapButt);
    CGContextSetLineJoin(ctx, pn.roundJoin ? kCGLineJoinRound : kCGLineJoinMiter);
    if (pn.dash) { const CGFloat d[2] = {3 * pn.w, pn.w}; CGContextSetLineDash(ctx, 0, d, 2); }
    else CGContextSetLineDash(ctx, 0, nullptr, 0);
    CGContextAddPath(ctx, p);
    CGContextStrokePath(ctx);
  }
  CTFontRef font(float px, bool bold) {
    const int key = (int)std::lround(px * 10) * 2 + (bold ? 1 : 0);
    auto it = fonts.find(key);
    if (it != fonts.end()) return it->second;
    NSFont* f = bold ? [NSFont boldSystemFontOfSize:px * kFontScale] : [NSFont systemFontOfSize:px * kFontScale];
    CTFontRef ct = (CTFontRef)CFBridgingRetain(f);
    fonts[key] = ct;
    return ct;
  }
  CTLineRef makeLine(const std::wstring& s, float px, bool bold, Col c) {
    const CGFloat v[4] = {c.r / 255.0, c.g / 255.0, c.b / 255.0, c.a / 255.0};
    CGColorRef col = CGColorCreate(space, v);
    NSDictionary* attrs = @{(__bridge id)kCTFontAttributeName: (__bridge id)font(px, bold), (__bridge id)kCTForegroundColorAttributeName: (__bridge id)col};
    NSAttributedString* as = [[NSAttributedString alloc] initWithString:ns(s) attributes:attrs];
    CTLineRef ln = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)as);
    CGColorRelease(col);
    return ln;
  }
  // GDI+ leaves 1/6 em at each end of a line; a centred line sits in the middle of its height
  void drawLine(CTLineRef ln, R r, float px, int align, bool vcenter) {
    CGFloat asc = 0, desc = 0, lead = 0;
    const double w = CTLineGetTypographicBounds(ln, &asc, &desc, &lead), pad = px / 6;
    const double x = align == 0 ? r.x + pad : align == 1 ? r.x + (r.w - w) / 2 : r.x + r.w - w - pad;
    const double base = vcenter ? r.y + (r.h - (asc + desc)) / 2 + asc : r.y + asc + pad / 2;
    CGContextSaveGState(ctx);
    CGContextSetTextMatrix(ctx, CGAffineTransformMakeScale(1, -1));
    CGContextSetTextPosition(ctx, x, base);
    CTLineDraw(ln, ctx);
    CGContextRestoreGState(ctx);
  }
};

// ------------------------------------------------------------------ the view's class and the menus' target (run time)
static Ivar gOwnerIvar = nullptr;
static MacWindow* ownerOf(id self) {
  return self && gOwnerIvar ? *(MacWindow**)((char*)(__bridge void*)self + ivar_getOffset(gOwnerIvar)) : nullptr;
}
static void setOwner(id v, MacWindow* w) { *(MacWindow**)((char*)(__bridge void*)v + ivar_getOffset(gOwnerIvar)) = w; }
static int gMenuPick = 0, gMenuHighlight = 0;   // the item chosen in a pop-up menu, the last item highlighted

static Class viewClass();
static id menuTarget();

class MacWindow : public EditorWindow {
 public:
  MacWindow(EditorEvents* e, NSView* parent, int w, int h) : ev(e) {
    space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    view = [[viewClass() alloc] initWithFrame:NSMakeRect(0, 0, w, h)];
    setOwner(view, this);
    NSTrackingArea* ta = [[NSTrackingArea alloc] initWithRect:NSZeroRect
                                                      options:NSTrackingMouseEnteredAndExited | NSTrackingMouseMoved | NSTrackingActiveAlways | NSTrackingInVisibleRect
                                                        owner:view userInfo:nil];
    [view addTrackingArea:ta];
    [parent addSubview:view];
    CFRunLoopTimerContext tc{0, this, nullptr, nullptr, nullptr};
    timer = CFRunLoopTimerCreate(kCFAllocatorDefault, CFAbsoluteTimeGetCurrent() + 1.0 / 30, 1.0 / 30, 0, 0, &MacWindow::tick, &tc);
    CFRunLoopAddTimer(CFRunLoopGetMain(), timer, kCFRunLoopCommonModes);
  }
  ~MacWindow() override {
    if (timer) { CFRunLoopTimerInvalidate(timer); CFRelease(timer); timer = nullptr; }
    setOwner(view, nullptr);
    [view removeFromSuperview];
    view = nil;
    for (auto& f : fonts) CFRelease(f.second);
    fonts.clear();
    CGColorSpaceRelease(space);
  }

  // the view's events
  void draw(NSRect dirty) {
    CGContextRef ctx = [NSGraphicsContext currentContext].CGContext;
    if (!ctx) return;
    const double s = ev->scale();
    CGContextSaveGState(ctx);
    CGContextScaleCTM(ctx, s, s);
    CGContextSetFillColorSpace(ctx, space);
    CGContextSetStrokeColorSpace(ctx, space);
    CGContextSetShouldAntialias(ctx, true);
    const R d{(float)(dirty.origin.x / s - 1), (float)(dirty.origin.y / s - 1), (float)(dirty.size.width / s + 2), (float)(dirty.size.height / s + 2)};
    MacCanvas c(ctx, space, fonts);
    ev->paint(c, d);
    CGContextRestoreGState(ctx);
  }
  NSPoint logical(NSEvent* e) {
    const NSPoint p = [view convertPoint:e.locationInWindow fromView:nil];
    const double s = ev->scale();
    return NSMakePoint(p.x / s, p.y / s);
  }
  void mouseDown(NSEvent* e) {
    mods = e.modifierFlags;
    const NSPoint p = logical(e);
    if (e.modifierFlags & NSEventModifierFlagControl) { ev->rightDown((float)p.x, (float)p.y); return; }   // Control-click
    ev->mouseDown((float)p.x, (float)p.y, e.clickCount == 2);
  }
  void rightDown(NSEvent* e) { mods = e.modifierFlags; const NSPoint p = logical(e); ev->rightDown((float)p.x, (float)p.y); }
  void mouseMove(NSEvent* e) { mods = e.modifierFlags; const NSPoint p = logical(e); ev->mouseMove((float)p.x, (float)p.y); }
  void mouseUp(NSEvent* e) { mods = e.modifierFlags; ev->mouseUp(); }
  void mouseLeave() { ev->mouseLeave(); }
  void scroll(NSEvent* e) {
    mods = e.modifierFlags;
    const NSPoint p = logical(e);
    const double dy = e.scrollingDeltaY;
    if (e.hasPreciseScrollingDeltas) {   // a trackpad: one step per 12 points
      if (e.phase == NSEventPhaseBegan) wheelAcc = 0;
      wheelAcc += dy;
      while (wheelAcc >= 12) { wheelAcc -= 12; ev->wheel((float)p.x, (float)p.y, 1); }
      while (wheelAcc <= -12) { wheelAcc += 12; ev->wheel((float)p.x, (float)p.y, -1); }
    } else if (dy != 0) ev->wheel((float)p.x, (float)p.y, dy > 0 ? 1 : -1);
  }
  void testCommand(int cmd) { ev->testCommand(cmd); }

  // EditorWindow
  void invalidate(int left, int top, int right, int bottom) override { [view setNeedsDisplayInRect:NSMakeRect(left, top, right - left, bottom - top)]; }
  void invalidateAll() override { [view setNeedsDisplay:YES]; }
  void setSize(int w, int h) override { [view setFrameSize:NSMakeSize(w, h)]; [view setNeedsDisplay:YES]; }
  void capture(bool) override {}   // a view receives the drag events of a click that started on it
  // the keys held with the mouse event being handled
  bool shiftDown() override { return (mods & NSEventModifierFlagShift) != 0; }
  bool ctrlDown() override { return (mods & NSEventModifierFlagCommand) != 0; }   // Cmd-click resets
  int popupMenu(const std::vector<MenuItem>& items, float x, float y) override {
    NSMenu* m = buildMenu(items);
    gMenuPick = 0; gMenuHighlight = 0;
    const double s = ev->scale();
    const BOOL chosen = [m popUpMenuPositioningItem:nil atLocation:NSMakePoint(x * s, y * s) inView:view];
    if (gMenuPick) return gMenuPick;   // the item's action was sent
    return chosen ? gMenuHighlight : 0;
  }
  void message(const std::wstring& text, bool warning) override {
    NSAlert* a = [[NSAlert alloc] init];
    a.messageText = @"Wavelet Synthesizer";
    a.informativeText = ns(text);
    a.alertStyle = warning ? NSAlertStyleWarning : NSAlertStyleInformational;
    [a addButtonWithTitle:@"OK"];
    [a runModal];
  }
  bool ask(const std::wstring& text) override {
    NSAlert* a = [[NSAlert alloc] init];
    a.messageText = @"Wavelet Synthesizer";
    a.informativeText = ns(text);
    [a addButtonWithTitle:@"Yes"];
    [a addButtonWithTitle:@"No"];
    return [a runModal] == NSAlertFirstButtonReturn;
  }
  bool saveDialog(SaveDlg& d, const wchar_t* title, bool withSection, const wchar_t* note) override {
    d.withSection = withSection;
    const CGFloat W = 320, rowH = 30, H = withSection ? 2 * rowH : rowH;
    NSView* acc = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, W, H)];
    NSTextField* label = [NSTextField labelWithString:@"Name:"];
    label.frame = NSMakeRect(0, H - rowH + 5, 64, 20);
    NSTextField* name = [[NSTextField alloc] initWithFrame:NSMakeRect(68, H - rowH + 3, W - 68, 24)];
    name.stringValue = ns(d.name);
    name.identifier = @"ws.name";
    [acc addSubview:label];
    [acc addSubview:name];
    NSPopUpButton* sec = nil;
    if (withSection) {
      NSTextField* l2 = [NSTextField labelWithString:@"Section:"];
      l2.frame = NSMakeRect(0, 5, 64, 20);
      sec = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(66, 0, W - 66, 26) pullsDown:NO];
      for (int i = 0; i < kNumBankSections; i++) [sec addItemWithTitle:ns(toW(kBankSections[i]))];
      [sec selectItemAtIndex:std::max(0, std::min(kNumBankSections - 1, d.section))];
      [acc addSubview:l2];
      [acc addSubview:sec];
    }
    for (;;) {
      NSAlert* a = [[NSAlert alloc] init];
      a.messageText = ns(title);
      if (note) a.informativeText = ns(note);
      [a addButtonWithTitle:@"Save"];
      [a addButtonWithTitle:@"Cancel"];
      a.accessoryView = acc;
      [a layout];
      a.window.initialFirstResponder = name;
      if ([a runModal] != NSAlertFirstButtonReturn) return false;
      std::wstring n = wide(name.stringValue);
      while (!n.empty() && iswspace(n.back())) n.pop_back();
      while (!n.empty() && iswspace(n.front())) n.erase(n.begin());
      if (n.size() > 48) n.resize(48);   // as the Windows dialog
      if (n.empty()) { NSBeep(); continue; }
      d.name = n;
      if (sec) d.section = std::max(0, (int)sec.indexOfSelectedItem);
      return true;
    }
  }
  std::wstring saveFileDialog(const wchar_t* title, const wchar_t* defaultName) override {
    NSSavePanel* p = [NSSavePanel savePanel];
    p.title = ns(title);
    p.message = ns(title);
    p.nameFieldStringValue = ns(defaultName);
    p.canCreateDirectories = YES;
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    p.allowedFileTypes = @[@"txt"];
#pragma clang diagnostic pop
    if ([p runModal] != NSModalResponseOK || !p.URL) return L"";
    return wide(p.URL.path);
  }
  std::wstring openFileDialog(const wchar_t* title) override {
    NSOpenPanel* p = [NSOpenPanel openPanel];
    p.title = ns(title);
    p.message = ns(title);
    p.canChooseFiles = YES;
    p.canChooseDirectories = NO;
    p.allowsMultipleSelection = NO;
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    p.allowedFileTypes = @[@"txt"];
#pragma clang diagnostic pop
    if ([p runModal] != NSModalResponseOK || !p.URL) return L"";
    return wide(p.URL.path);
  }
  void reveal(const std::wstring& path) override { [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[[NSURL fileURLWithPath:ns(path)]]]; }
  void openDocument(const std::wstring& path) override { [[NSWorkspace sharedWorkspace] openURL:[NSURL fileURLWithPath:ns(path)]]; }

 private:
  EditorEvents* ev;
  NSView* view = nil;
  CGColorSpaceRef space = nullptr;
  CFRunLoopTimerRef timer = nullptr;
  std::map<int, CTFontRef> fonts;
  double wheelAcc = 0;
  NSEventModifierFlags mods = 0;

  static void tick(CFRunLoopTimerRef, void* info) { static_cast<MacWindow*>(info)->ev->timer(); }
  static NSMenu* buildMenu(const std::vector<MenuItem>& items) {
    NSMenu* m = [[NSMenu alloc] initWithTitle:@""];
    m.autoenablesItems = NO;
    m.delegate = (id<NSMenuDelegate>)menuTarget();
    for (const MenuItem& it : items) {
      if (it.separator) { [m addItem:[NSMenuItem separatorItem]]; continue; }
      std::wstring t = it.text;
      const size_t tab = t.find(L'\t');   // "Bass<TAB>20" -> "Bass   (20)"
      if (tab != std::wstring::npos) t = t.substr(0, tab) + L"   (" + t.substr(tab + 1) + L")";
      NSMenuItem* mi = [[NSMenuItem alloc] initWithTitle:ns(t) action:nil keyEquivalent:@""];
      if (it.isPopup) mi.submenu = buildMenu(it.sub);
      else {
        mi.tag = it.cmd;
        if (it.cmd && !it.grayed) { mi.target = menuTarget(); mi.action = sel_registerName("wsPick:"); }
      }
      mi.enabled = !it.grayed;
      mi.state = it.checked ? NSControlStateValueOn : NSControlStateValueOff;
      [m addItem:mi];
    }
    return m;
  }
};

static BOOL viewIsFlipped(id, SEL) { return YES; }
static BOOL viewAcceptsFirstMouse(id, SEL, NSEvent*) { return YES; }
static void viewDrawRect(id self, SEL, NSRect dirty) { if (MacWindow* w = ownerOf(self)) w->draw(dirty); }
static void viewMouseDown(id self, SEL, NSEvent* e) { if (MacWindow* w = ownerOf(self)) w->mouseDown(e); }
static void viewRightMouseDown(id self, SEL, NSEvent* e) { if (MacWindow* w = ownerOf(self)) w->rightDown(e); }
static void viewMouseMoved(id self, SEL, NSEvent* e) { if (MacWindow* w = ownerOf(self)) w->mouseMove(e); }
static void viewMouseUp(id self, SEL, NSEvent* e) { if (MacWindow* w = ownerOf(self)) w->mouseUp(e); }
static void viewMouseExited(id self, SEL, NSEvent*) { if (MacWindow* w = ownerOf(self)) w->mouseLeave(); }
static void viewScrollWheel(id self, SEL, NSEvent* e) { if (MacWindow* w = ownerOf(self)) w->scroll(e); }
static void viewTestCommand(id self, SEL, NSInteger cmd) { if (MacWindow* w = ownerOf(self)) w->testCommand((int)cmd); }   // developer tests

static Class viewClass() {
  static Class cls = nil;
  if (cls) return cls;
  char name[96];
  std::snprintf(name, sizeof name, "OktoWaveletEditorView_%llx", (unsigned long long)(uintptr_t)&viewClass);
  Class c = objc_getClass(name);
  if (!c) {
    c = objc_allocateClassPair([NSView class], name, 0);
    class_addIvar(c, "wsOwner", sizeof(void*), (uint8_t)std::log2(sizeof(void*)), "^v");
    auto add = [c](SEL sel, IMP imp) { class_addMethod(c, sel, imp, method_getTypeEncoding(class_getInstanceMethod([NSView class], sel))); };
    add(@selector(isFlipped), (IMP)viewIsFlipped);
    add(@selector(acceptsFirstMouse:), (IMP)viewAcceptsFirstMouse);
    add(@selector(drawRect:), (IMP)viewDrawRect);
    add(@selector(mouseDown:), (IMP)viewMouseDown);
    add(@selector(rightMouseDown:), (IMP)viewRightMouseDown);
    add(@selector(mouseDragged:), (IMP)viewMouseMoved);
    add(@selector(mouseMoved:), (IMP)viewMouseMoved);
    add(@selector(mouseUp:), (IMP)viewMouseUp);
    add(@selector(mouseExited:), (IMP)viewMouseExited);
    add(@selector(scrollWheel:), (IMP)viewScrollWheel);
    class_addMethod(c, sel_registerName("wsTestCommand:"), (IMP)viewTestCommand, "v@:q");
    objc_registerClassPair(c);
  }
  gOwnerIvar = class_getInstanceVariable(c, "wsOwner");
  cls = c;
  return cls;
}

static void targetPick(id, SEL, NSMenuItem* item) { gMenuPick = (int)item.tag; }
static void targetHighlight(id, SEL, NSMenu*, NSMenuItem* item) { gMenuHighlight = item ? (int)item.tag : 0; }
static id menuTarget() {
  static id target = nil;
  if (target) return target;
  char name[96];
  std::snprintf(name, sizeof name, "OktoWaveletMenuTarget_%llx", (unsigned long long)(uintptr_t)&menuTarget);
  Class c = objc_getClass(name);
  if (!c) {
    c = objc_allocateClassPair([NSObject class], name, 0);
    class_addMethod(c, sel_registerName("wsPick:"), (IMP)targetPick, "v@:@");
    class_addMethod(c, @selector(menu:willHighlightItem:), (IMP)targetHighlight, "v@:@@");
    class_addProtocol(c, @protocol(NSMenuDelegate));
    objc_registerClassPair(c);
  }
  target = [[c alloc] init];
  return target;
}

const char* editorPlatformType() { return Steinberg::kPlatformTypeNSView; }
double windowScaleOf(void*) { return 1; }
double systemScale() { return 1; }
EditorWindow* createEditorWindow(EditorEvents* e, void* parent, int w, int h) { return new MacWindow(e, (__bridge NSView*)parent, w, h); }

}  // namespace ws
