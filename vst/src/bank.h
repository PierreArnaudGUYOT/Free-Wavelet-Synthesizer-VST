// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
// beta 0.3: the USER BANK of the plug-in. The player saves sounds into one of its sections (the factory types +
// Chords); the bank is a readable text file kept next to the WaveletSynthesizer.vst3 folder (so that installing a new
// version, which replaces that folder, keeps it), shared by every instance and Live Set, and can be exported as .txt.
// Format (also the export): one block per preset under its section, the parameters that differ from the defaults
// (ENGINE and A/B MIX always), as in tools/spec.js presets:
//   == Bass ==
//   Preset: My Bass
//   From: A · Deep Saw Bass (modified)
//     f_cutoff: 5.5   (Cutoff: band 5.5)
#pragma once
#include <windows.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include "dsp.h"

namespace ws {

inline constexpr const char* kBankSections[] = {"Bass", "Lead", "Keys", "Organ", "Pad", "Strings", "Brass & Wind", "Pluck",
                                                "Bells & Mallets", "Chords", "FX", "Drums & Perc"};
inline constexpr int kNumBankSections = (int)(sizeof kBankSections / sizeof *kBankSections);

struct BankPreset {
  int section = 0;
  std::string name, from;
  double v[kNumParams];   // plain values (hidden parameters at their default)
};

inline int bankSectionOf(const std::string& s) {
  for (int i = 0; i < kNumBankSections; i++) if (s == kBankSections[i]) return i;
  return -1;
}

// The bank file: next to the WaveletSynthesizer.vst3 bundle folder (the DLL is <bundle>\Contents\x86_64-win\<dll>),
// else next to the DLL. WS_BANK_FILE (process environment) replaces it in the developer tests.
inline std::wstring bankPath(HMODULE module) {
  wchar_t b[MAX_PATH * 2] = {};
  const DWORD n = GetEnvironmentVariableW(L"WS_BANK_FILE", b, MAX_PATH * 2);
  if (n > 0 && n < MAX_PATH * 2) return b;
  GetModuleFileNameW(module, b, MAX_PATH * 2);
  std::wstring p = b;
  auto up = [&p] { const size_t s = p.find_last_of(L"\\/"); if (s != std::wstring::npos) p.resize(s); };
  up();   // the DLL's folder
  std::wstring low = p;
  std::transform(low.begin(), low.end(), low.begin(), ::towlower);
  const std::wstring tail = L"\\contents\\x86_64-win";
  if (low.size() > tail.size() && low.compare(low.size() - tail.size(), tail.size(), tail) == 0) { up(); up(); up(); }
  return p + L"\\Wavelet Synthesizer user bank.txt";
}

inline std::string bankNum(double v) {   // up to 6 decimals, no trailing zeros (as the votes file of the test build)
  char b[64];
  std::snprintf(b, sizeof b, "%.6f", v);
  std::string s = b;
  while (!s.empty() && s.back() == '0') s.pop_back();
  if (!s.empty() && s.back() == '.') s.pop_back();
  return s == "-0" ? "0" : s;
}

inline std::string bankText(const std::vector<BankPreset>& bank) {
  std::string s;
  char b[256];
  auto L = [&s](const std::string& x) { s += x; s += "\r\n"; };
  SYSTEMTIME t; GetLocalTime(&t);
  L("Wavelet Synthesizer - user bank");
  L("Saved by the VST plug-in (beta 0.3). Each preset: its section, its name, the factory preset it came from, then the");
  L("parameters that differ from the defaults.   Format: key: value   (name: shown value)");
  std::snprintf(b, sizeof b, "Saved: %04d-%02d-%02d %02d:%02d   Presets: %d", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, (int)bank.size());
  L(b);
  for (int sec = 0; sec < kNumBankSections; sec++) {
    L("");
    L(std::string("== ") + kBankSections[sec] + " ==");
    bool any = false;
    for (const BankPreset& p : bank) {
      if (p.section != sec) continue;
      any = true;
      L("");
      L("Preset: " + p.name);
      if (!p.from.empty()) L("From: " + p.from);
      for (int i = 0; i < kNumParams; i++) {
        const ParamDef& d = kParams[i];
        if (d.hidden) continue;
        if (i != P_ENGINE && i != P_AB_MIX && std::fabs(p.v[i] - d.def) <= 1e-9 * std::max(1.0, std::fabs(d.def))) continue;
        L(std::string("  ") + d.key + ": " + bankNum(p.v[i]) + "   (" + d.name + ": " + formatValue(d, p.v[i]) + ")");
      }
    }
    if (!any) L("(empty)");
  }
  return s;
}

// Reads a bank text (unknown lines are ignored; values are clamped to their range).
inline std::vector<BankPreset> bankParse(const std::string& all) {
  std::vector<BankPreset> bank;
  int sec = -1;
  BankPreset* cur = nullptr;
  for (size_t p = 0; p < all.size();) {
    size_t e = all.find('\n', p);
    if (e == std::string::npos) e = all.size();
    std::string line = all.substr(p, e - p);
    p = e + 1;
    if (!line.empty() && line.back() == '\r') line.pop_back();
    if (line.size() > 6 && line.compare(0, 3, "== ") == 0 && line.compare(line.size() - 3, 3, " ==") == 0) {
      sec = bankSectionOf(line.substr(3, line.size() - 6));
      cur = nullptr;
    } else if (line.compare(0, 8, "Preset: ") == 0 && sec >= 0 && line.size() > 8) {
      BankPreset np;
      np.section = sec; np.name = line.substr(8);
      for (int i = 0; i < kNumParams; i++) np.v[i] = kParams[i].def;
      bank.push_back(np);
      cur = &bank.back();
    } else if (line.compare(0, 6, "From: ") == 0 && cur) {
      cur->from = line.substr(6);
    } else if (line.compare(0, 2, "  ") == 0 && cur) {
      const size_t c = line.find(':');
      double v;
      if (c == std::string::npos || std::sscanf(line.c_str() + c + 1, " %lf", &v) != 1 || !std::isfinite(v)) continue;
      const std::string key = line.substr(2, c - 2);
      for (int i = 0; i < kNumParams; i++)
        if (key == kParams[i].key && !kParams[i].hidden) { cur->v[i] = std::min(kParams[i].max, std::max(kParams[i].min, v)); break; }
    }
  }
  return bank;
}

inline std::vector<BankPreset> bankRead(const std::wstring& path) {
  FILE* f = _wfopen(path.c_str(), L"rb");
  if (!f) return {};
  std::string all;
  char b[4096];
  size_t n;
  while ((n = std::fread(b, 1, sizeof b, f)) > 0 && all.size() < (8u << 20)) all.append(b, n);   // a bank is small
  std::fclose(f);
  return bankParse(all);
}

// Writes the text atomically (temporary file, then replace). Returns "" or the Windows error.
inline std::wstring bankWriteText(const std::wstring& path, const std::string& text) {
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
  const DWORD we = GetLastError();
  CloseHandle(h);
  if (!ok) { DeleteFileW(tmp.c_str()); return err(we); }
  if (!MoveFileExW(tmp.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
    const DWORD me = GetLastError();
    DeleteFileW(tmp.c_str());
    return err(me);
  }
  return L"";
}

}  // namespace ws
