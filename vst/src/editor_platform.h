// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.6).
// Mac port (beta 0.3): what the editor (editor.cpp, the same on every system) needs from the system, and what the system
// window gives back. editor_win.cpp implements it with Win32 and GDI+, editor_mac.mm with Cocoa, Core Graphics and Core Text.
// Drawing coordinates are logical (the panel's 1100 x 720 layout); the window applies its scale.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace ws {

struct R { float x, y, w, h; bool has(float px, float py) const { return px >= x && py >= y && px < x + w && py < y + h; }
  bool hits(const R& o) const { return x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h; } };
struct Pt { float x, y; };
struct Col { uint8_t a, r, g, b; };
inline Col rgb(uint32_t c, int a = 255) { return Col{(uint8_t)a, (uint8_t)(c >> 16), (uint8_t)(c >> 8), (uint8_t)c}; }
inline Col argb(int a, int r, int g, int b) { return Col{(uint8_t)a, (uint8_t)r, (uint8_t)g, (uint8_t)b}; }

// a solid colour, or a linear gradient from p0 (colour c0) to p1 (colour c1)
struct Brush {
  Col c0, c1; Pt p0, p1; bool grad;
  Brush(Col c) : c0(c), c1(c), p0{0, 0}, p1{0, 0}, grad(false) {}
  Brush(Pt a, Pt b, Col ca, Col cb) : c0(ca), c1(cb), p0(a), p1(b), grad(true) {}
};
// a line: colour and width; round caps, round joins or a dash on request
struct Pen {
  Col c; float w; bool roundCaps = false, roundJoin = false, dash = false;
  Pen(Col col, float width) : c(col), w(width) {}
  Pen& caps() { roundCaps = true; return *this; }
  Pen& join() { roundJoin = true; return *this; }
  Pen& dashed() { dash = true; return *this; }
};

struct Canvas {
  virtual ~Canvas() = default;
  virtual void fillRect(R r, const Brush& b) = 0;
  virtual void fillRR(R r, float rad, const Brush& b) = 0;   // rounded rectangle (rad <= 0: a rectangle)
  virtual void strokeRR(R r, float rad, const Pen& p) = 0;
  virtual void fillEllipse(R r, const Brush& b) = 0;
  virtual void strokeEllipse(R r, const Pen& p) = 0;
  virtual void arc(R box, float startDeg, float sweepDeg, const Pen& p) = 0;   // degrees: 0 = 3 o'clock, clockwise
  virtual void line(Pt a, Pt b, const Pen& p) = 0;
  virtual void lines(const Pt* p, int n, const Pen& pen) = 0;
  virtual void fillPolygon(const Pt* p, int n, const Brush& b) = 0;
  // one line of text in r: align 0 left, 1 centre, 2 right; vcenter or top; never wrapped
  virtual void text(const std::wstring& s, R r, float px, bool bold, Col c, int align, bool vcenter) = 0;
  // beta 0.3.3: the text turned a quarter turn anticlockwise (it reads from the bottom to the top), centred in r (the vertical title of a card)
  virtual void textVertical(const std::wstring& s, R r, float px, bool bold, Col c) = 0;
  // left-aligned, cut with "…" when longer than r
  virtual void textEllipsis(const std::wstring& s, R r, float px, bool bold, Col c, bool vcenter) = 0;
  virtual float textWidth(const std::wstring& s, float px, bool bold) = 0;   // as the text is laid out (with its margins)
  virtual void pixels(const uint32_t* argb, int w, int h, R dst) = 0;   // an image (0xAARRGGBB rows), nearest-neighbour
  // beta 0.3.4: what is drawn between pushClipRR and the matching popClip is cut to the rounded rectangle (the oriental pattern of the PLAY card); they nest
  virtual void pushClipRR(R, float) {}
  virtual void popClip() {}
};

// a pop-up menu: items with a command (0: none), a check mark, greyed, separators and submenus
struct MenuItem {
  std::wstring text; int cmd = 0; bool checked = false, grayed = false, separator = false, isPopup = false;
  std::vector<MenuItem> sub;   // the items of a submenu (isPopup; it may be empty)
  static MenuItem item(const std::wstring& t, int c, bool chk = false, bool gr = false) { MenuItem m; m.text = t; m.cmd = c; m.checked = chk; m.grayed = gr; return m; }
  static MenuItem sep() { MenuItem m; m.separator = true; return m; }
  static MenuItem popup(const std::wstring& t, std::vector<MenuItem> s, bool chk = false) { MenuItem m; m.text = t; m.sub = std::move(s); m.checked = chk; m.isPopup = true; return m; }
};

// the save window: a name (proposed, editable, 48 characters at most) and, for the user bank, a section
struct SaveDlg { std::wstring name; int section = 0; bool withSection = true; };

// the editor, as the system window sees it (coordinates in logical units)
struct EditorEvents {
  virtual ~EditorEvents() = default;
  virtual double scale() const = 0;   // window pixels (Windows) or points (macOS) per logical unit
  virtual void paint(Canvas& g, R dirty) = 0;
  virtual void timer() = 0;   // about 30 times a second
  virtual void mouseDown(float x, float y, bool dbl) = 0;
  virtual void rightDown(float x, float y) = 0;
  virtual bool mouseMove(float x, float y) = 0;   // false while dragging
  virtual void mouseUp() = 0;
  virtual void mouseLeave() = 0;
  virtual void wheel(float x, float y, int dir) = 0;
  virtual bool key(int k) = 0;   // beta 0.5: an arrow key (kKeyLeft .. kKeyDown); true when the editor used it
  virtual void testCommand(int cmd) = 0;   // developer tests: a preset-menu command
};
enum : int { kKeyLeft = 1, kKeyUp, kKeyRight, kKeyDown };

// the system window, as the editor sees it
struct EditorWindow {
  virtual ~EditorWindow() = default;
  virtual void invalidate(int left, int top, int right, int bottom) = 0;   // window pixels / points
  virtual void invalidateAll() = 0;
  virtual void setSize(int w, int h) = 0;
  virtual void capture(bool on) = 0;   // the mouse while dragging
  virtual void takeFocus() = 0;   // beta 0.5: the keyboard to the editor (a click in the preset browser: the arrow keys)
  virtual bool shiftDown() = 0;
  virtual bool ctrlDown() = 0;   // Ctrl (Windows) or Cmd (macOS): a click resets a knob
  virtual int popupMenu(const std::vector<MenuItem>& items, float x, float y) = 0;   // logical point; the command or 0
  virtual void message(const std::wstring& text, bool warning) = 0;
  virtual bool ask(const std::wstring& text) = 0;   // Yes / No
  virtual bool saveDialog(SaveDlg& d, const wchar_t* title, bool withSection, const wchar_t* note) = 0;
  virtual std::wstring saveFileDialog(const wchar_t* title, const wchar_t* defaultName) = 0;   // "" when cancelled
  virtual std::wstring openFileDialog(const wchar_t* title) = 0;   // a .txt file to read (beta 0.4 IMPORT); "" when cancelled
  virtual void reveal(const std::wstring& path) = 0;   // shows the file in Explorer / the Finder
  virtual void openDocument(const std::wstring& path) = 0;   // opens it with its application (the manual: a browser)
};

// implemented by editor_win.cpp / editor_mac.mm
const char* editorPlatformType();   // kPlatformTypeHWND / kPlatformTypeNSView
double windowScaleOf(void* parent);   // Windows: the window's DPI / 96; macOS: 1 (the system scales points)
double systemScale();
// beta 0.3.2: the usable size in pixels (the taskbar left out) of the screen the host's window is on (parent null: the main screen); false when it is not known
bool workAreaOf(void* parent, int& w, int& h);
EditorWindow* createEditorWindow(EditorEvents* e, void* parent, int w, int h);

}  // namespace ws
