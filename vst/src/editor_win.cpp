// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.6).
// The editor's Windows side (split from editor.cpp for the Mac port of beta 0.3, unchanged): a native Win32 child window
// drawn with GDI+ (part of Windows) into a back buffer, its pop-up menus and dialogs. The panel itself is editor.cpp.
#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>
#include <commdlg.h>
#include <algorithm>
namespace Gdiplus { using std::min; using std::max; }
#include <gdiplus.h>
#include <cmath>
#include <cstring>
#include <cwchar>
#include <map>
#include <memory>
#include <string>
#include <vector>
#include "pluginterfaces/gui/iplugview.h"
#include "common.h"
#include "bank.h"
#include "editor_platform.h"

namespace ws {

namespace G = Gdiplus;

static G::Color gc(Col c) { return G::Color(c.a, c.r, c.g, c.b); }

static ULONG_PTR gGdiToken = 0;
static int gGdiUsers = 0, gClassUsers = 0;
static const wchar_t* kClassName = L"OktoMultiWaveSynthEditorWnd";

static HMODULE thisModule() {
  HMODULE h = nullptr;
  GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCWSTR)&thisModule, &h);
  return h;
}

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

class WinWindow;

// ------------------------------------------------------------------ GDI+ drawing
class GdiCanvas : public Canvas {
 public:
  GdiCanvas(G::Graphics& gr, WinWindow& w) : g(gr), win(w) {}
  void fillRect(R r, const Brush& b) override { auto br = brush(b); g.FillRectangle(br.get(), r.x, r.y, r.w, r.h); }
  void fillRR(R r, float rad, const Brush& b) override { auto br = brush(b); G::GraphicsPath p; rrPath(p, r, rad); g.FillPath(br.get(), &p); }
  void strokeRR(R r, float rad, const Pen& pn) override { G::GraphicsPath p; rrPath(p, r, rad); G::Pen pen(gc(pn.c), pn.w); setup(pen, pn); g.DrawPath(&pen, &p); }
  void fillEllipse(R r, const Brush& b) override { auto br = brush(b); g.FillEllipse(br.get(), r.x, r.y, r.w, r.h); }
  void strokeEllipse(R r, const Pen& pn) override { G::Pen pen(gc(pn.c), pn.w); setup(pen, pn); g.DrawEllipse(&pen, r.x, r.y, r.w, r.h); }
  void arc(R b, float startDeg, float sweepDeg, const Pen& pn) override {
    G::Pen pen(gc(pn.c), pn.w); setup(pen, pn); g.DrawArc(&pen, b.x, b.y, b.w, b.h, startDeg, sweepDeg);
  }
  void line(Pt a, Pt b, const Pen& pn) override { G::Pen pen(gc(pn.c), pn.w); setup(pen, pn); g.DrawLine(&pen, a.x, a.y, b.x, b.y); }
  void lines(const Pt* p, int n, const Pen& pn) override {
    std::vector<G::PointF> pts(n);
    for (int i = 0; i < n; i++) pts[i] = G::PointF(p[i].x, p[i].y);
    G::Pen pen(gc(pn.c), pn.w); setup(pen, pn);
    g.DrawLines(&pen, pts.data(), n);
  }
  void fillPolygon(const Pt* p, int n, const Brush& b) override {
    std::vector<G::PointF> pts(n);
    for (int i = 0; i < n; i++) pts[i] = G::PointF(p[i].x, p[i].y);
    auto br = brush(b); g.FillPolygon(br.get(), pts.data(), n);
  }
  void text(const std::wstring& s, R r, float px, bool bold, Col c, int align, bool vcenter) override;
  void textVertical(const std::wstring& s, R r, float px, bool bold, Col c) override;
  void textEllipsis(const std::wstring& s, R r, float px, bool bold, Col c, bool vcenter) override;
  float textWidth(const std::wstring& s, float px, bool bold) override;
  void pixels(const uint32_t* argb, int w, int h, R dst) override {
    G::Bitmap bmp(w, h, PixelFormat32bppARGB);
    G::BitmapData bd; G::Rect lr(0, 0, w, h);
    bmp.LockBits(&lr, G::ImageLockModeWrite, PixelFormat32bppARGB, &bd);
    for (int y = 0; y < h; y++) std::memcpy((uint8_t*)bd.Scan0 + y * bd.Stride, argb + (size_t)y * w, (size_t)w * 4);
    bmp.UnlockBits(&bd);
    auto im = g.GetInterpolationMode(); auto po = g.GetPixelOffsetMode();
    g.SetInterpolationMode(G::InterpolationModeNearestNeighbor); g.SetPixelOffsetMode(G::PixelOffsetModeHalf);
    g.DrawImage(&bmp, G::RectF(dst.x, dst.y, dst.w, dst.h), 0, 0, (float)w, (float)h, G::UnitPixel);
    g.SetInterpolationMode(im); g.SetPixelOffsetMode(po);
  }
  // beta 0.3.4: the clip of the oriental pattern (the graphics state, with the window's own clip, is saved and restored)
  void pushClipRR(R r, float rad) override { saved.push_back(g.Save()); G::GraphicsPath p; rrPath(p, r, rad); g.SetClip(&p, G::CombineModeIntersect); }
  void popClip() override { if (!saved.empty()) { g.Restore(saved.back()); saved.pop_back(); } }

 private:
  G::Graphics& g;
  WinWindow& win;
  std::vector<G::GraphicsState> saved;
  static std::unique_ptr<G::Brush> brush(const Brush& b) {
    if (b.grad) return std::unique_ptr<G::Brush>(new G::LinearGradientBrush(G::PointF(b.p0.x, b.p0.y), G::PointF(b.p1.x, b.p1.y), gc(b.c0), gc(b.c1)));
    return std::unique_ptr<G::Brush>(new G::SolidBrush(gc(b.c0)));
  }
  static void setup(G::Pen& pen, const Pen& p) {
    if (p.roundJoin) pen.SetLineJoin(G::LineJoinRound);
    if (p.roundCaps) { pen.SetStartCap(G::LineCapRound); pen.SetEndCap(G::LineCapRound); }
    if (p.dash) pen.SetDashStyle(G::DashStyleDash);
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
};

// ------------------------------------------------------------------ the window
class WinWindow : public EditorWindow {
 public:
  WinWindow(EditorEvents* e, HWND parent, int w, int h) : ev(e) {
    if (gGdiUsers++ == 0) { G::GdiplusStartupInput in; G::GdiplusStartup(&gGdiToken, &in, nullptr); }
    if (gClassUsers++ == 0) {
      WNDCLASSEXW wc{}; wc.cbSize = sizeof wc; wc.style = CS_DBLCLKS; wc.lpfnWndProc = &WinWindow::wndProc;
      wc.hInstance = thisModule(); wc.hCursor = LoadCursor(nullptr, IDC_ARROW); wc.lpszClassName = kClassName;
      RegisterClassExW(&wc);
    }
    hwnd = CreateWindowExW(0, kClassName, L"Okto Fractal Wavelet", WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN, 0, 0, w, h, parent, nullptr, thisModule(), this);   // (version 1.0.17: CLIPCHILDREN, the name field typed in place)
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, (LONG_PTR)this);
    SetTimer(hwnd, 1, 33, nullptr);
  }
  ~WinWindow() override {
    if (edit) { SetWindowLongPtrW(edit, GWLP_USERDATA, 0); DestroyWindow(edit); edit = nullptr; }
    if (editFont) { DeleteObject(editFont); editFont = nullptr; }
    KillTimer(hwnd, 1);
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
    DestroyWindow(hwnd); hwnd = nullptr;
    freeBuffer();
    for (auto& f : fonts) delete f.second;
    fonts.clear();
    delete family; family = nullptr;
    if (--gGdiUsers == 0) G::GdiplusShutdown(gGdiToken);
    if (--gClassUsers == 0) UnregisterClassW(kClassName, thisModule());
  }

  G::Font* font(float px, bool bold) {
    int key = (int)std::lround(px * 10) * 2 + (bold ? 1 : 0);
    auto it = fonts.find(key);
    if (it != fonts.end()) return it->second;
    if (!family) family = new G::FontFamily(L"Segoe UI");
    G::Font* f = new G::Font(family, px, bold ? G::FontStyleBold : G::FontStyleRegular, G::UnitPixel);
    fonts[key] = f;
    return f;
  }

  // EditorWindow
  void invalidate(int left, int top, int right, int bottom) override { RECT rc{left, top, right, bottom}; InvalidateRect(hwnd, &rc, FALSE); }
  void invalidateAll() override { InvalidateRect(hwnd, nullptr, FALSE); }
  void setSize(int w, int h) override { SetWindowPos(hwnd, nullptr, 0, 0, w, h, SWP_NOZORDER | SWP_NOMOVE | SWP_NOACTIVATE); }
  void capture(bool on) override { if (on) SetCapture(hwnd); else ReleaseCapture(); }
  void takeFocus() override { if (GetFocus() != hwnd) SetFocus(hwnd); }
  bool shiftDown() override { return (GetKeyState(VK_SHIFT) & 0x8000) != 0; }
  bool ctrlDown() override { return (GetKeyState(VK_CONTROL) & 0x8000) != 0; }
  int popupMenu(const std::vector<MenuItem>& items, float x, float y) override {
    HMENU m = buildMenu(items);
    const double s = ev->scale();
    POINT pt{(LONG)(x * s), (LONG)(y * s)};
    ClientToScreen(hwnd, &pt);
    const int cmd = TrackPopupMenu(m, TPM_RETURNCMD | TPM_LEFTALIGN | TPM_TOPALIGN | TPM_NONOTIFY, pt.x, pt.y, 0, hwnd, nullptr);
    DestroyMenu(m);
    return cmd;
  }
  void message(const std::wstring& text, bool warning) override {
    MessageBoxW(hwnd, text.c_str(), L"Okto Fractal Wavelet", MB_OK | (warning ? MB_ICONWARNING : MB_ICONINFORMATION));
  }
  bool ask(const std::wstring& text) override {
    return MessageBoxW(hwnd, text.c_str(), L"Okto Fractal Wavelet", MB_YESNO | MB_ICONQUESTION) == IDYES;
  }
  bool saveDialog(SaveDlg& d, const wchar_t* title, bool withSection, const wchar_t* note) override;
  // version 1.0.17: the name typed in place (NEW, RENAME): an EDIT control over the row; Enter or a click elsewhere keeps the text, Escape gives up; the end is
  // posted (WM_APP + 2) so that the control is never destroyed inside its own message
  HWND edit = nullptr; HFONT editFont = nullptr; WNDPROC editOld = nullptr; bool editEnding = false, editOk = false; std::wstring editResult;
  bool editText(R r, const std::wstring& text, float px) override {
    if (edit) return false;
    const double s = ev->scale();
    editFont = CreateFontW(-(int)std::lround(px * s), 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS,
                           CLEARTYPE_QUALITY, DEFAULT_PITCH, L"Segoe UI");
    edit = CreateWindowExW(0, L"EDIT", text.c_str(), WS_CHILD | WS_VISIBLE | WS_BORDER | ES_AUTOHSCROLL,
                           (int)std::lround(r.x * s), (int)std::lround(r.y * s), (int)std::lround(r.w * s), (int)std::lround(r.h * s), hwnd, nullptr, thisModule(), nullptr);
    if (!edit) { if (editFont) DeleteObject(editFont); editFont = nullptr; return false; }
    SendMessageW(edit, WM_SETFONT, (WPARAM)editFont, TRUE);
    SendMessageW(edit, EM_LIMITTEXT, (WPARAM)48, 0);
    SetWindowLongPtrW(edit, GWLP_USERDATA, (LONG_PTR)this);
    editOld = (WNDPROC)SetWindowLongPtrW(edit, GWLP_WNDPROC, (LONG_PTR)&WinWindow::editProc);
    editEnding = false;
    SendMessageW(edit, EM_SETSEL, 0, -1);
    SetFocus(edit);
    return true;
  }
  void endEdit(bool ok) {
    if (!edit || editEnding) return;
    editEnding = true;
    wchar_t b[64] = {};
    GetWindowTextW(edit, b, 64);
    editResult = b; editOk = ok;
    PostMessageW(hwnd, WM_APP + 2, 0, 0);
  }
  void finishEdit() {
    if (!edit) return;
    HWND e = edit;
    edit = nullptr;
    SetWindowLongPtrW(e, GWLP_USERDATA, 0);
    DestroyWindow(e);
    if (editFont) { DeleteObject(editFont); editFont = nullptr; }
    editEnding = false;
    std::wstring t = editResult;
    while (!t.empty() && iswspace(t.back())) t.pop_back();
    while (!t.empty() && iswspace(t.front())) t.erase(t.begin());
    ev->textDone(editOk && !t.empty(), t);
  }
  static LRESULT CALLBACK editProc(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    WinWindow* w = (WinWindow*)GetWindowLongPtrW(h, GWLP_USERDATA);
    if (!w) return DefWindowProcW(h, msg, wp, lp);
    const WNDPROC old = w->editOld;
    switch (msg) {
      case WM_GETDLGCODE: return DLGC_WANTALLKEYS | CallWindowProcW(old, h, msg, wp, lp);
      case WM_KEYDOWN:
        if (wp == VK_RETURN) { w->endEdit(true); return 0; }
        if (wp == VK_ESCAPE) { w->endEdit(false); return 0; }
        break;
      case WM_CHAR: if (wp == '\r' || wp == 27) return 0; break;   // (no beep)
      case WM_KILLFOCUS: w->endEdit(true); break;
      default: break;
    }
    return CallWindowProcW(old, h, msg, wp, lp);
  }
  // version 1.0.17: the clipboard (COPY / PASTE of a preset as text)
  bool setClipboard(const std::wstring& text) override {
    if (!OpenClipboard(hwnd)) return false;
    EmptyClipboard();
    const size_t bytes = (text.size() + 1) * sizeof(wchar_t);
    bool ok = false;
    if (HGLOBAL h = GlobalAlloc(GMEM_MOVEABLE, bytes)) {
      if (void* p = GlobalLock(h)) { std::memcpy(p, text.c_str(), bytes); GlobalUnlock(h); ok = SetClipboardData(CF_UNICODETEXT, h) != nullptr; }
      if (!ok) GlobalFree(h);   // (the system owns it once set)
    }
    CloseClipboard();
    return ok;
  }
  std::wstring clipboard() override {
    std::wstring s;
    if (!OpenClipboard(hwnd)) return s;
    if (HANDLE h = GetClipboardData(CF_UNICODETEXT))
      if (const wchar_t* p = (const wchar_t*)GlobalLock(h)) { s.assign(p, wcsnlen(p, 1u << 20)); GlobalUnlock(h); }   // (1 M characters at most: a preset is a few kilobytes)
    CloseClipboard();
    return s;
  }
  std::wstring saveFileDialog(const wchar_t* title, const wchar_t* defaultName) override {
    wchar_t b[MAX_PATH * 2] = {};
    std::wcsncpy(b, defaultName, MAX_PATH * 2 - 1);
    OPENFILENAMEW o{};
    o.lStructSize = sizeof o; o.hwndOwner = GetAncestor(hwnd, GA_ROOT);
    o.lpstrFilter = L"Text file (*.txt)\0*.txt\0"; o.lpstrFile = b; o.nMaxFile = MAX_PATH * 2; o.lpstrDefExt = L"txt";
    o.lpstrTitle = title;
    o.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR | OFN_HIDEREADONLY;
    if (!GetSaveFileNameW(&o)) return L"";
    return b;
  }
  std::wstring openFileDialog(const wchar_t* title) override {
    wchar_t b[MAX_PATH * 2] = {};
    OPENFILENAMEW o{};
    o.lStructSize = sizeof o; o.hwndOwner = GetAncestor(hwnd, GA_ROOT);
    o.lpstrFilter = L"Text file (*.txt)\0*.txt\0All files\0*.*\0"; o.lpstrFile = b; o.nMaxFile = MAX_PATH * 2;
    o.lpstrTitle = title;
    o.Flags = OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR | OFN_HIDEREADONLY;
    if (!GetOpenFileNameW(&o)) return L"";
    return b;
  }
  void reveal(const std::wstring& path) override {
    // beta 0.6 (security review): the full path; a bare "explorer.exe" is looked for in the host's current folder first
    wchar_t win[MAX_PATH] = {};
    const UINT n = GetSystemWindowsDirectoryW(win, MAX_PATH);
    if (n == 0 || n >= MAX_PATH) return;
    ShellExecuteW(nullptr, L"open", (std::wstring(win) + L"\\explorer.exe").c_str(), (L"/select,\"" + path + L"\"").c_str(),
                  nullptr, SW_SHOWNORMAL);
  }
  void openDocument(const std::wstring& path) override { ShellExecuteW(nullptr, L"open", path.c_str(), nullptr, nullptr, SW_SHOWNORMAL); }

 private:
  EditorEvents* ev;
  HWND hwnd = nullptr;
  // back buffer
  HDC memDC = nullptr; HBITMAP memBmp = nullptr, oldBmp = nullptr; int bufW = 0, bufH = 0;
  std::map<int, G::Font*> fonts;
  G::FontFamily* family = nullptr;
  bool tracking = false;

  void freeBuffer() {
    if (memDC) { SelectObject(memDC, oldBmp); DeleteObject(memBmp); DeleteDC(memDC); memDC = nullptr; memBmp = nullptr; }
    bufW = bufH = 0;
  }
  static std::wstring menuText(const std::wstring& s) {   // '&' would be a menu mnemonic
    std::wstring out;
    for (wchar_t c : s) { if (c == L'&') out += L'&'; out += c; }
    return out;
  }
  static HMENU buildMenu(const std::vector<MenuItem>& items) {
    HMENU m = CreatePopupMenu();
    for (const MenuItem& it : items) {
      if (it.separator) AppendMenuW(m, MF_SEPARATOR, 0, nullptr);
      else if (it.isPopup) AppendMenuW(m, MF_POPUP | MF_STRING | (it.checked ? MF_CHECKED : 0), (UINT_PTR)buildMenu(it.sub), menuText(it.text).c_str());
      else AppendMenuW(m, MF_STRING | (it.checked ? MF_CHECKED : 0) | (it.grayed ? MF_GRAYED : 0), (UINT_PTR)it.cmd, menuText(it.text).c_str());
    }
    return m;
  }

  void logical(LPARAM lp, float& x, float& y) { double s = ev->scale(); x = (float)(GET_X_LPARAM(lp) / s); y = (float)(GET_Y_LPARAM(lp) / s); }

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
      float s = (float)ev->scale();
      g.ScaleTransform(s, s);
      R dirty{ps.rcPaint.left / s - 1, ps.rcPaint.top / s - 1, (ps.rcPaint.right - ps.rcPaint.left) / s + 2, (ps.rcPaint.bottom - ps.rcPaint.top) / s + 2};
      GdiCanvas c(g, *this);
      ev->paint(c, dirty);
    }
    BitBlt(hdc, ps.rcPaint.left, ps.rcPaint.top, ps.rcPaint.right - ps.rcPaint.left, ps.rcPaint.bottom - ps.rcPaint.top, memDC, ps.rcPaint.left, ps.rcPaint.top, SRCCOPY);
    EndPaint(hwnd, &ps);
  }

  // The save window: a dialog template built in memory (no resource file in the plug-in).
  static INT_PTR CALLBACK saveDlgProc(HWND d, UINT msg, WPARAM wp, LPARAM lp) {
    SaveDlg* s = (SaveDlg*)GetWindowLongPtrW(d, DWLP_USER);
    if (msg == WM_INITDIALOG) {
      s = (SaveDlg*)lp;
      SetWindowLongPtrW(d, DWLP_USER, (LONG_PTR)s);
      SendDlgItemMessageW(d, 101, EM_LIMITTEXT, (WPARAM)48, 0);
      SetDlgItemTextW(d, 101, s->name.c_str());
      if (s->withSection) {   // (version 1.0.17: the banks the editor gives, the player's own included)
        if (!s->sections.empty()) for (const std::wstring& n : s->sections) SendDlgItemMessageW(d, 102, CB_ADDSTRING, 0, (LPARAM)n.c_str());
        else for (int i = 0; i < kNumBankSections; i++) SendDlgItemMessageW(d, 102, CB_ADDSTRING, 0, (LPARAM)toW(kBankSections[i]).c_str());
        SendDlgItemMessageW(d, 102, CB_SETCURSEL, (WPARAM)s->section, 0);
      }
      SetFocus(GetDlgItem(d, 101));
      SendDlgItemMessageW(d, 101, EM_SETSEL, 0, -1);
      return FALSE;   // the focus is set
    }
    if (msg == WM_COMMAND && LOWORD(wp) == IDOK && s) {
      wchar_t b[64] = {};
      GetDlgItemTextW(d, 101, b, 64);
      std::wstring n = b;
      while (!n.empty() && iswspace(n.back())) n.pop_back();
      while (!n.empty() && iswspace(n.front())) n.erase(n.begin());
      if (n.empty()) { MessageBeep(MB_ICONWARNING); SetFocus(GetDlgItem(d, 101)); return TRUE; }
      s->name = n;
      if (s->withSection) s->section = std::max(0, (int)SendDlgItemMessageW(d, 102, CB_GETCURSEL, 0, 0));
      EndDialog(d, IDOK);
      return TRUE;
    }
    if (msg == WM_COMMAND && LOWORD(wp) == IDCANCEL) { EndDialog(d, IDCANCEL); return TRUE; }
    return FALSE;
  }

  static LRESULT CALLBACK wndProc(HWND h, UINT msg, WPARAM wp, LPARAM lp) {
    WinWindow* w = (WinWindow*)GetWindowLongPtrW(h, GWLP_USERDATA);
    if (!w) return DefWindowProcW(h, msg, wp, lp);
    EditorEvents* e = w->ev;
    float x, y;
    switch (msg) {
      case WM_PAINT: w->paint(); return 0;
      case WM_ERASEBKGND: return 1;
      case WM_SIZE: InvalidateRect(h, nullptr, FALSE); return 0;
      case WM_TIMER: e->timer(); return 0;
      case WM_APP + 1:   // developer test (vst/devtest/bank_session.cpp): a preset-menu command, the bank read again
        e->testCommand((int)wp);
        return 0;
      case WM_APP + 2: w->finishEdit(); return 0;   // version 1.0.17: the name typed in place is done
      case WM_RBUTTONDOWN: w->logical(lp, x, y); e->rightDown(x, y); return 0;   // right-click on the preset name: the menu
      case WM_LBUTTONDOWN: w->logical(lp, x, y); e->mouseDown(x, y, false); return 0;
      case WM_LBUTTONDBLCLK: w->logical(lp, x, y); e->mouseDown(x, y, true); return 0;
      case WM_MOUSEMOVE:
        w->logical(lp, x, y);
        if (e->mouseMove(x, y) && !w->tracking) { TRACKMOUSEEVENT t{sizeof t, TME_LEAVE, h, 0}; TrackMouseEvent(&t); w->tracking = true; }
        return 0;
      case WM_LBUTTONUP: e->mouseUp(); return 0;
      case WM_CAPTURECHANGED: if ((HWND)lp != h) e->mouseUp(); return 0;
      case WM_MOUSELEAVE: w->tracking = false; e->mouseLeave(); return 0;
      case WM_MOUSEWHEEL: {
        POINT pt{GET_X_LPARAM(lp), GET_Y_LPARAM(lp)}; ScreenToClient(h, &pt);
        double s = e->scale(); const float lx = (float)(pt.x / s), ly = (float)(pt.y / s);
        e->wheel(lx, ly, GET_WHEEL_DELTA_WPARAM(wp) > 0 ? 1 : -1);
        return 0;
      }
      // beta 0.5: the arrow keys choose presets while the editor has the keyboard (after a click in the preset browser);
      // every other key goes on to the host's window (its computer keyboard, its shortcuts)
      case WM_GETDLGCODE: return DLGC_WANTARROWS;
      case WM_KEYDOWN: case WM_KEYUP: case WM_CHAR: case WM_SYSKEYDOWN: case WM_SYSKEYUP: case WM_SYSCHAR: {
        // version 1.0.17: Ctrl + C / Ctrl + V copy and paste the preset while the editor has the keyboard
        if (msg == WM_KEYDOWN && (wp == 'C' || wp == 'V') && (GetKeyState(VK_CONTROL) & 0x8000) && !(GetKeyState(VK_MENU) & 0x8000) &&
            e->key(wp == 'C' ? kKeyCopy : kKeyPaste)) return 0;
        const int k = wp == VK_LEFT ? kKeyLeft : wp == VK_UP ? kKeyUp : wp == VK_RIGHT ? kKeyRight : wp == VK_DOWN ? kKeyDown : 0;
        if (k && (msg == WM_KEYDOWN || msg == WM_KEYUP) && !(GetKeyState(VK_CONTROL) & 0x8000) && !(GetKeyState(VK_MENU) & 0x8000)) {
          if (msg == WM_KEYUP || e->key(k)) return 0;
        }
        if (HWND p = GetParent(h)) return SendMessageW(p, msg, wp, lp);
        break;
      }
      default: break;
    }
    return DefWindowProcW(h, msg, wp, lp);
  }
  friend class GdiCanvas;
};

void GdiCanvas::text(const std::wstring& s, R r, float px, bool bold, Col c, int align, bool vcenter) {
  G::StringFormat f;
  f.SetAlignment(align == 0 ? G::StringAlignmentNear : align == 1 ? G::StringAlignmentCenter : G::StringAlignmentFar);
  f.SetLineAlignment(vcenter ? G::StringAlignmentCenter : G::StringAlignmentNear);
  f.SetFormatFlags(G::StringFormatFlagsNoWrap | G::StringFormatFlagsNoClip);
  f.SetTrimming(G::StringTrimmingNone);
  G::SolidBrush b(gc(c));
  g.DrawString(s.c_str(), -1, win.font(px, bold), G::RectF(r.x, r.y, r.w, r.h), &f, &b);
}
void GdiCanvas::textVertical(const std::wstring& s, R r, float px, bool bold, Col c) {
  const G::GraphicsState st = g.Save();
  g.TranslateTransform(r.x + r.w / 2, r.y + r.h / 2);
  g.RotateTransform(-90);
  text(s, R{-r.h / 2, -r.w / 2, r.h, r.w}, px, bold, c, 1, true);
  g.Restore(st);
}
void GdiCanvas::textEllipsis(const std::wstring& s, R r, float px, bool bold, Col c, bool vcenter) {
  G::StringFormat ff; ff.SetFormatFlags(G::StringFormatFlagsNoWrap); ff.SetTrimming(G::StringTrimmingEllipsisCharacter);
  if (vcenter) ff.SetLineAlignment(G::StringAlignmentCenter);
  G::SolidBrush b(gc(c));
  g.DrawString(s.c_str(), -1, win.font(px, bold), G::RectF(r.x, r.y, r.w, r.h), &ff, &b);
}
float GdiCanvas::textWidth(const std::wstring& s, float px, bool bold) {
  G::RectF bound;
  G::StringFormat f; f.SetFormatFlags(G::StringFormatFlagsNoWrap);
  g.MeasureString(s.c_str(), -1, win.font(px, bold), G::PointF(0, 0), &f, &bound);
  return bound.Width;
}

bool WinWindow::saveDialog(SaveDlg& d, const wchar_t* title, bool withSection, const wchar_t* note) {
  d.withSection = withSection;
  std::vector<WORD> t;
  auto words = [&t](const void* p, size_t bytes) { const WORD* w = (const WORD*)p; t.insert(t.end(), w, w + bytes / 2); };
  auto str = [&t](const wchar_t* s) { do t.push_back((WORD)*s); while (*s++); };
  int items = 0;
  auto item = [&](DWORD style, short x, short y, short cx, short cy, WORD id, WORD cls, const wchar_t* txt) {
    if (t.size() % 2) t.push_back(0);   // each item starts on a DWORD boundary
    DLGITEMTEMPLATE it{};
    it.style = style | WS_CHILD | WS_VISIBLE; it.x = x; it.y = y; it.cx = cx; it.cy = cy; it.id = id;
    words(&it, sizeof it);
    t.push_back(0xFFFF); t.push_back(cls);   // predefined class: 0x80 button, 0x81 edit, 0x82 static, 0x85 combo box
    str(txt);
    t.push_back(0);   // no creation data
    items++;
  };
  const short top = note ? 30 : 0, bottom = withSection ? 56 : 34;
  DLGTEMPLATE h{};
  h.style = DS_MODALFRAME | DS_SETFONT | DS_CENTER | WS_POPUP | WS_CAPTION | WS_SYSMENU;
  h.cdit = (WORD)(4 + (withSection ? 2 : 0) + (note ? 1 : 0)); h.cx = 236; h.cy = (short)(top + bottom + 24);
  words(&h, sizeof h);
  t.push_back(0); t.push_back(0);   // no menu, default class
  str(title);
  t.push_back(9); str(L"Segoe UI");
  if (note) item(SS_LEFT, 8, 7, 220, 22, 0xFFFF, 0x82, note);
  item(SS_LEFT, 8, (short)(top + 11), 40, 10, 0xFFFF, 0x82, L"Name:");
  item(ES_AUTOHSCROLL | WS_BORDER | WS_TABSTOP, 50, (short)(top + 9), 178, 13, 101, 0x81, L"");
  if (withSection) {
    item(SS_LEFT, 8, (short)(top + 32), 40, 10, 0xFFFF, 0x82, L"Section:");
    item(CBS_DROPDOWNLIST | WS_VSCROLL | WS_TABSTOP, 50, (short)(top + 30), 178, 160, 102, 0x85, L"");
  }
  item(BS_DEFPUSHBUTTON | WS_TABSTOP, 122, (short)(top + bottom), 50, 16, IDOK, 0x80, L"Save");
  item(BS_PUSHBUTTON | WS_TABSTOP, 178, (short)(top + bottom), 50, 16, IDCANCEL, 0x80, L"Cancel");
  (void)items;
  std::vector<DWORD> mem((t.size() + 1) / 2 + 1);   // DWORD-aligned copy
  std::memcpy(mem.data(), t.data(), t.size() * sizeof(WORD));
  return DialogBoxIndirectParamW(thisModule(), (LPCDLGTEMPLATEW)mem.data(), GetAncestor(hwnd, GA_ROOT), saveDlgProc, (LPARAM)&d) == IDOK;
}

const char* editorPlatformType() { return Steinberg::kPlatformTypeHWND; }
double windowScaleOf(void* parent) { return windowDpi((HWND)parent); }
double systemScale() { return systemDpi(); }
bool workAreaOf(void* parent, int& w, int& h) {
  MONITORINFO mi = {}; mi.cbSize = sizeof mi;
  HMONITOR mon = parent ? MonitorFromWindow((HWND)parent, MONITOR_DEFAULTTONEAREST) : MonitorFromPoint(POINT{0, 0}, MONITOR_DEFAULTTOPRIMARY);
  RECT rc = {};
  if (mon && GetMonitorInfoW(mon, &mi)) rc = mi.rcWork;
  else if (!SystemParametersInfoW(SPI_GETWORKAREA, 0, &rc, 0)) return false;
  w = (int)(rc.right - rc.left); h = (int)(rc.bottom - rc.top);
  return w > 0 && h > 0;
}
EditorWindow* createEditorWindow(EditorEvents* e, void* parent, int w, int h) { return new WinWindow(e, (HWND)parent, w, h); }

}  // namespace ws
