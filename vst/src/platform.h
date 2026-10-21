// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.6).
// Mac port (beta 0.3): the operating-system calls of the plug-in outside its editor window (the plug-in file and folders,
// the presets file, environment variables, text conversion), for Windows and macOS. Paths are std::wstring on both
// systems (UTF-16 on Windows, UTF-32 on macOS); the Windows code is the one of beta 0.3, moved here.
#pragma once
#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#endif
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cwctype>
#include <string>

namespace ws {

#ifdef _WIN32
inline constexpr wchar_t kPathSep = L'\\';
#else
inline constexpr wchar_t kPathSep = L'/';

// UTF-8 <-> UTF-32 (wchar_t on macOS); an invalid byte becomes U+FFFD
inline std::wstring utf8ToWide(const std::string& s) {
  std::wstring w;
  w.reserve(s.size());
  for (size_t i = 0; i < s.size();) {
    const unsigned char c = (unsigned char)s[i];
    const int n = c < 0x80 ? 0 : (c >> 5) == 6 ? 1 : (c >> 4) == 14 ? 2 : (c >> 3) == 30 ? 3 : -1;
    if (n < 0 || i + n >= s.size() + (n == 0 ? 1 : 0)) {
      if (n == 0) { w.push_back(c); i++; continue; }
      w.push_back(0xFFFD); i++; continue;
    }
    uint32_t cp = n == 0 ? c : n == 1 ? (c & 0x1F) : n == 2 ? (c & 0x0F) : (c & 0x07);
    bool ok = true;
    for (int k = 1; k <= n; k++) {
      const unsigned char d = (unsigned char)s[i + k];
      if ((d & 0xC0) != 0x80) { ok = false; break; }
      cp = (cp << 6) | (d & 0x3F);
    }
    if (!ok || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) { w.push_back(0xFFFD); i++; continue; }
    w.push_back((wchar_t)cp);
    i += n + 1;
  }
  return w;
}
inline void appendUtf8(std::string& s, uint32_t cp) {
  if (cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) cp = 0xFFFD;
  if (cp < 0x80) s.push_back((char)cp);
  else if (cp < 0x800) { s.push_back((char)(0xC0 | (cp >> 6))); s.push_back((char)(0x80 | (cp & 0x3F))); }
  else if (cp < 0x10000) { s.push_back((char)(0xE0 | (cp >> 12))); s.push_back((char)(0x80 | ((cp >> 6) & 0x3F))); s.push_back((char)(0x80 | (cp & 0x3F))); }
  else {
    s.push_back((char)(0xF0 | (cp >> 18))); s.push_back((char)(0x80 | ((cp >> 12) & 0x3F)));
    s.push_back((char)(0x80 | ((cp >> 6) & 0x3F))); s.push_back((char)(0x80 | (cp & 0x3F)));
  }
}
inline std::string wideToUtf8(const std::wstring& w) {
  std::string s;
  s.reserve(w.size());
  for (wchar_t c : w) appendUtf8(s, (uint32_t)c);
  return s;
}
#endif

// The plug-in binary: <bundle>.vst3\Contents\x86_64-win\<name>.vst3 (Windows), <bundle>.vst3/Contents/MacOS/<name> (macOS)
inline std::wstring moduleFile() {
#ifdef _WIN32
  HMODULE h = nullptr;
  GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, (LPCWSTR)&moduleFile, &h);
  wchar_t b[MAX_PATH * 2] = {};
  GetModuleFileNameW(h, b, MAX_PATH * 2);
  return b;
#else
  Dl_info i{};
  if (!dladdr((const void*)&moduleFile, &i) || !i.dli_fname) return L"";
  char real[PATH_MAX];
  return utf8ToWide(realpath(i.dli_fname, real) ? real : i.dli_fname);
#endif
}
inline void pathUp(std::wstring& p) { const size_t s = p.find_last_of(L"\\/"); if (s != std::wstring::npos) p.resize(s); }

// The bundle's Contents folder (its manuals are in Contents/Resources/manual)
inline std::wstring contentsFolder() {
  std::wstring p = moduleFile();
  pathUp(p); pathUp(p);
  return p;
}
// The folder of the presets library: the one holding the OktoMultiWaveSynth.vst3 bundle, else the binary's folder.
inline std::wstring libraryFolder() {
  std::wstring p = moduleFile();
  pathUp(p);
  std::wstring low = p;
  std::transform(low.begin(), low.end(), low.begin(), ::towlower);
#ifdef _WIN32
  const std::wstring tail = L"\\contents\\x86_64-win";
#else
  const std::wstring tail = L"/contents/macos";
#endif
  if (low.size() > tail.size() && low.compare(low.size() - tail.size(), tail.size(), tail) == 0) { pathUp(p); pathUp(p); pathUp(p); }
  return p;
}
inline std::wstring envPath(const wchar_t* var) {   // developer tests (vst/devtest/bank_session.cpp, tests/machost)
#ifdef _WIN32
  wchar_t b[MAX_PATH * 2] = {};
  const DWORD n = GetEnvironmentVariableW(var, b, MAX_PATH * 2);
  return n > 0 && n < MAX_PATH * 2 ? std::wstring(b) : std::wstring();
#else
  const char* v = getenv(wideToUtf8(var).c_str());
  return v ? utf8ToWide(v) : std::wstring();
#endif
}

// Writes the text atomically (temporary file, then replace). Returns "" or the system's error message.
inline std::wstring writeTextFile(const std::wstring& path, const std::string& text) {
#ifdef _WIN32
  auto err = [](DWORD e) {
    wchar_t b[512] = {};
    FormatMessageW(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, nullptr, e, 0, b, 511, nullptr);
    std::wstring s = b;
    while (!s.empty() && (s.back() == L'\n' || s.back() == L'\r' || s.back() == L' ' || s.back() == L'.')) s.pop_back();
    return s.empty() ? L"error " + std::to_wstring(e) : s;
  };
  const std::wstring tmp = path + L".tmp";
  HANDLE h = CreateFileW(tmp.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (h == INVALID_HANDLE_VALUE) return err(GetLastError());
  DWORD put = 0;
  const BOOL ok = WriteFile(h, text.data(), (DWORD)text.size(), &put, nullptr) && put == text.size();
  const DWORD we = ok ? (FlushFileBuffers(h) ? 0 : GetLastError()) : GetLastError();   // on the disk before it replaces the old file
  CloseHandle(h);
  if (ok && we) { DeleteFileW(tmp.c_str()); return err(we); }
  if (!ok) { DeleteFileW(tmp.c_str()); return err(we); }
  if (!MoveFileExW(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
    const DWORD me = GetLastError();
    DeleteFileW(tmp.c_str());
    return err(me);
  }
  return L"";
#else
  auto err = [](int e) { const std::wstring s = utf8ToWide(strerror(e)); return s.empty() ? L"error " + std::to_wstring(e) : s; };
  const std::string p = wideToUtf8(path), tmp = p + ".tmp";
  const int fd = open(tmp.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
  if (fd < 0) return err(errno);
  size_t done = 0;
  int we = 0;
  while (done < text.size()) {
    const ssize_t n = write(fd, text.data() + done, text.size() - done);
    if (n < 0) { if (errno == EINTR) continue; we = errno; break; }
    done += (size_t)n;
  }
  if (!we && fsync(fd) != 0) we = errno;
  close(fd);
  if (we) { unlink(tmp.c_str()); return err(we); }
  if (rename(tmp.c_str(), p.c_str()) != 0) { const int me = errno; unlink(tmp.c_str()); return err(me); }
  return L"";
#endif
}
// Reads a text file of at most 16 MB; a longer one is cut there and `truncated` (if given) says so, so that nobody writes the
// cut text back over the file.
inline std::string readTextFile(const std::wstring& path, bool& found, bool* truncated = nullptr) {
  found = false;
  if (truncated) *truncated = false;
#ifdef _WIN32
  FILE* f = _wfopen(path.c_str(), L"rb");
#else
  FILE* f = std::fopen(wideToUtf8(path).c_str(), "rb");
#endif
  if (!f) return "";
  found = true;
  std::string all;
  char b[4096];
  size_t n;
  while ((n = std::fread(b, 1, sizeof b, f)) > 0 && all.size() < (16u << 20)) all.append(b, n);   // a library is small
  if (truncated && all.size() >= (16u << 20) && std::fread(b, 1, 1, f) > 0) *truncated = true;
  std::fclose(f);
  return all;
}
// The file's last write time and size (false: no such file)
inline bool fileStamp(const std::wstring& path, uint64_t& stamp, uint64_t& size) {
#ifdef _WIN32
  WIN32_FILE_ATTRIBUTE_DATA a{};
  if (!GetFileAttributesExW(path.c_str(), GetFileExInfoStandard, &a)) return false;
  stamp = ((uint64_t)a.ftLastWriteTime.dwHighDateTime << 32) | a.ftLastWriteTime.dwLowDateTime;
  size = ((uint64_t)a.nFileSizeHigh << 32) | a.nFileSizeLow;
  return true;
#else
  struct stat st {};
  if (stat(wideToUtf8(path).c_str(), &st) != 0) return false;
  stamp = (uint64_t)st.st_mtimespec.tv_sec * 1000000000ull + (uint64_t)st.st_mtimespec.tv_nsec;
  size = (uint64_t)st.st_size;
  return true;
#endif
}
// the local date and time (the presets file's "Saved:" line)
struct LocalTime { int wYear, wMonth, wDay, wHour, wMinute; };
inline LocalTime localNow() {
#ifdef _WIN32
  SYSTEMTIME t; GetLocalTime(&t);
  return LocalTime{t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute};
#else
  const time_t now = time(nullptr);
  struct tm t {};
  localtime_r(&now, &t);
  return LocalTime{t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min};
#endif
}
inline int64_t processId() {
#ifdef _WIN32
  return (int64_t)GetCurrentProcessId();
#else
  return (int64_t)getpid();
#endif
}

inline bool fileExists(const std::wstring& path) {
#ifdef _WIN32
  return GetFileAttributesW(path.c_str()) != INVALID_FILE_ATTRIBUTES;
#else
  struct stat st {};
  return stat(wideToUtf8(path).c_str(), &st) == 0;
#endif
}

}  // namespace ws
