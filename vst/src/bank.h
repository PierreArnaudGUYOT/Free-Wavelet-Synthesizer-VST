// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
// beta 0.3: the PRESET LIBRARY of the plug-in, in one readable text file "OKTOWAVE presets.txt" kept next to the
// WaveletSynthesizer.vst3 folder (so that installing a new version, which replaces that folder, keeps it):
// - every factory preset, as the player may have ADJUSTED it (SAVE PRESET overwrites a factory preset, optionally under a
//   new name; "Adjusted: yes" in the file; only those override the built-in presets when the file is read back), or
//   DELETED it ("Deleted: yes": hidden from the browser, the menu and the arrows, to be dropped from the next version);
// - the USER BANK: the player's own sounds in 12 sections (the factory types + Chords), in the player's order;
// - the LIST ORDER of the preset browser: TOP Sounds (OktoPierre's favourites, then the presets he rated 8 to 10) and
//   each category, as the player arranged them with MOVE UP / DOWN (built-in names, one per line).
// The file is shared by every instance and Live Set, read again whenever it changes on disk, written atomically, and is
// meant to be read back to make the next version's factory presets. Format (one block per preset; the parameters that
// differ from the defaults, ENGINE and A/B MIX always, as in tools/spec.js):
//   ######## FACTORY PRESETS ########
//   == Bass ==
//   Preset: A · Deep Saw Bass 2        (its name now)
//   Factory: A · Deep Saw Bass         (its built-in name: the key)
//   Adjusted: yes
//     f_cutoff: 5.5   (Cutoff: band 5.5)
//   ######## USER BANK ########
//   == Chords ==
//   Preset: My Chord
//   From: A · Warm Pad (modified)
//     ...
// A beta 0.3 user-bank file ("Wavelet Synthesizer user bank.txt", sections and presets only) is read when the library
// file does not exist yet.
#pragma once
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>
#include "dsp.h"
#include "platform.h"   // files and folders (Windows / macOS)

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

inline std::string bankNum(double v) {   // up to 6 decimals, no trailing zeros
  char b[64];
  std::snprintf(b, sizeof b, "%.6f", v);
  std::string s = b;
  while (!s.empty() && s.back() == '0') s.pop_back();
  if (!s.empty() && s.back() == '.') s.pop_back();
  return s == "-0" ? "0" : s;
}
// the parameter lines of a sound: those that differ from the defaults, ENGINE and A/B MIX always
inline void paramLines(const double* v, std::string& s) {
  for (int i = 0; i < kNumParams; i++) {
    const ParamDef& d = kParams[i];
    if (d.hidden) continue;
    if (i != P_ENGINE && i != P_AB_MIX && std::fabs(v[i] - d.def) <= 1e-9 * std::max(1.0, std::fabs(d.def))) continue;
    s += std::string("  ") + d.key + ": " + bankNum(v[i]) + "   (" + d.name + ": " + formatValue(d, v[i]) + ")\r\n";
  }
}
// "  key: value ..." into v (unknown keys ignored, values clamped); false when the line is not a parameter line
inline bool parseParamLine(const std::string& line, double* v) {
  if (line.compare(0, 2, "  ") != 0) return false;
  const size_t c = line.find(':');
  double x;
  if (c == std::string::npos || std::sscanf(line.c_str() + c + 1, " %lf", &x) != 1 || !std::isfinite(x)) return false;
  const std::string key = line.substr(2, c - 2);
  for (int i = 0; i < kNumParams; i++)
    if (key == kParams[i].key && !kParams[i].hidden) { v[i] = std::min(kParams[i].max, std::max(kParams[i].min, x)); return true; }
  return false;
}

// ------------------------------------------------------------------ the library (one per process)
class Library {
 public:
  static Library& get() { static Library lib; return lib; }

  std::wstring path() { return pathOf(); }
  // reads the file again when it changed on disk (another instance or another editor wrote it)
  void refresh() { std::lock_guard<std::mutex> l(m); refreshLocked(); }
  uint32_t version() { return ver.load(); }   // changes with the content (the editor redraws)

  std::string name(int k) { std::lock_guard<std::mutex> l(m); refreshLocked(); return k >= 0 && k < kNumPresets ? s.names[k] : ""; }
  void values(int k, double* v) {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    for (int i = 0; i < kNumParams; i++) v[i] = k >= 0 && k < kNumPresets ? s.vals[k][i] : kParams[i].def;
  }
  bool adjusted(int k) { std::lock_guard<std::mutex> l(m); refreshLocked(); return k >= 0 && k < kNumPresets && s.adj[k]; }
  bool deleted(int k) { std::lock_guard<std::mutex> l(m); refreshLocked(); return k >= 0 && k < kNumPresets && s.del[k]; }
  int deletedCount() { std::lock_guard<std::mutex> l(m); refreshLocked(); int n = 0; for (char d : s.del) n += d; return n; }
  int adjustedCount() { std::lock_guard<std::mutex> l(m); refreshLocked(); int n = 0; for (char a : s.adj) n += a; return n; }
  std::vector<BankPreset> bank() { std::lock_guard<std::mutex> l(m); refreshLocked(); return s.user; }
  // the factory preset with this name now, else with this built-in name, else -1
  int find(const std::string& n) {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    for (int k = 0; k < kNumPresets; k++) if (s.names[k] == n) return k;
    for (int k = 0; k < kNumPresets; k++) if (n == kPresets[k].name) return k;
    return -1;
  }

  // Edits: each one writes the whole file; on an error nothing changes and the Windows error text is returned.
  std::wstring adjust(int k, const std::string& newName, const double* v) {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    if (k < 0 || k >= kNumPresets) return L"no such preset";
    State t = s;
    t.names[k] = newName;
    for (int i = 0; i < kNumParams; i++) t.vals[k][i] = kParams[i].hidden ? kParams[i].def : v[i];
    t.adj[k] = 1;
    return commit(t);
  }
  std::wstring restore(int k) {   // the built-in preset again
    std::lock_guard<std::mutex> l(m); refreshLocked();
    if (k < 0 || k >= kNumPresets) return L"no such preset";
    State t = s;
    t.names[k] = kPresets[k].name;
    for (int i = 0; i < kNumParams; i++) t.vals[k][i] = kPresets[k].v[i];
    t.adj[k] = 0;
    return commit(t);
  }
  std::wstring setDeleted(int k, bool del) {   // a factory preset hidden from the lists, or shown again
    std::lock_guard<std::mutex> l(m); refreshLocked();
    if (k < 0 || k >= kNumPresets) return L"no such preset";
    State t = s;
    t.del[k] = del ? 1 : 0;
    return commit(t);
  }
  // adds p to the user bank, or replaces the sound (section, replaceName) / (p.section, p.name)
  std::wstring putUser(const BankPreset& p, const std::string& replaceName = "") {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    State t = s;
    const std::string key = replaceName.empty() ? p.name : replaceName;
    t.user.erase(std::remove_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) {
      return q.section == p.section && q.name == p.name && q.name != key; }), t.user.end());   // a renamed sound replaces a namesake
    auto it = std::find_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == p.section && q.name == key; });
    if (it != t.user.end()) *it = p; else t.user.push_back(p);
    return commit(t);
  }
  std::wstring removeUser(int section, const std::string& n) {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    State t = s;
    t.user.erase(std::remove_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == section && q.name == n; }), t.user.end());
    return commit(t);
  }
  // the factory lists of the preset browser: TOP Sounds, then the categories in factory order (deleted presets included)
  std::vector<std::pair<std::string, std::vector<int>>> lists() {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    std::vector<std::pair<std::string, std::vector<int>>> out;
    for (size_t i = 0; i < s.lists.size(); i++) out.push_back({listLabels()[i], s.lists[i]});
    return out;
  }
  // MOVE UP (dir -1) / DOWN (+1): preset k swaps with the next one of list i that is not deleted
  std::wstring moveInList(int i, int k, int dir) {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    if (i < 0 || i >= (int)s.lists.size()) return L"no such list";
    State t = s;
    std::vector<int>& v = t.lists[i];
    const int at = (int)(std::find(v.begin(), v.end(), k) - v.begin());
    if (at >= (int)v.size()) return L"not in this list";
    for (int j = at + dir; j >= 0 && j < (int)v.size(); j += dir)
      if (!t.del[v[j]]) { std::swap(v[at], v[j]); return commit(t); }
    return L"";   // already at that end
  }
  // MOVE UP / DOWN in the user bank: the sound swaps with the next one of its section
  std::wstring moveUser(int section, const std::string& n, int dir) {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    State t = s;
    int at = -1;
    for (int j = 0; j < (int)t.user.size(); j++) if (t.user[j].section == section && t.user[j].name == n) at = j;
    if (at < 0) return L"not in the bank";
    for (int j = at + dir; j >= 0 && j < (int)t.user.size(); j += dir)
      if (t.user[j].section == section) { std::swap(t.user[at], t.user[j]); return commit(t); }
    return L"";
  }
  std::wstring exportTo(const std::wstring& to) {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    return writeTextFile(to, text(s));
  }

 private:
  struct State {
    std::vector<std::string> names;
    std::vector<std::array<double, kNumParams>> vals;
    std::vector<char> adj, del;
    std::vector<std::vector<int>> lists;   // the preset browser's factory lists (listLabels order)
    std::vector<BankPreset> user;
  };
  std::mutex m;
  State s;
  bool loaded = false, existed = false;
  uint64_t stamp = 0, size = 0;   // the file's last write time and size when read or written
  std::atomic<uint32_t> ver{1};

  Library() { builtIn(s); }
  static void builtIn(State& t) {
    t.names.assign(kNumPresets, ""); t.vals.assign(kNumPresets, {}); t.adj.assign(kNumPresets, 0); t.del.assign(kNumPresets, 0); t.user.clear();
    for (int k = 0; k < kNumPresets; k++) {
      t.names[k] = kPresets[k].name;
      for (int i = 0; i < kNumParams; i++) t.vals[k][i] = kPresets[k].v[i];
    }
    t.lists = defaultLists();
  }
  // TOP Sounds, then the factory categories (in factory order: they are consecutive after the favourites)
  static const std::vector<std::string>& listLabels() {
    static const std::vector<std::string> labels = [] {
      std::vector<std::string> l{"TOP Sounds"};
      for (int k = kNumFavourites; k < kNumPresets; k++) if (l.back() != kPresets[k].cat) l.push_back(kPresets[k].cat);
      return l;
    }();
    return labels;
  }
  // TOP Sounds = OktoPierre's favourites, then the presets he rated 8 to 10 (best first); each category = its favourites
  // (the browser marks them ★), then its presets in factory order
  static std::vector<std::vector<int>> defaultLists() {
    const std::vector<std::string>& labels = listLabels();
    std::vector<std::vector<int>> v(labels.size());
    for (int k = 0; k < kNumFavourites && k < kNumPresets; k++) v[0].push_back(k);
    std::vector<int> voted;
    for (int k = kNumFavourites; k < kNumPresets; k++) if (kPresetStars[k] >= 8) voted.push_back(k);
    std::stable_sort(voted.begin(), voted.end(), [](int a, int b) { return kPresetStars[a] > kPresetStars[b]; });
    v[0].insert(v[0].end(), voted.begin(), voted.end());
    for (size_t i = 1; i < labels.size(); i++) {
      for (int f = 0; f < kNumFavourites; f++) if (labels[i] == kPresets[f].cat) v[i].push_back(f);
      for (int k = kNumFavourites; k < kNumPresets; k++) if (labels[i] == kPresets[k].cat) v[i].push_back(k);
    }
    return v;
  }
  static std::wstring pathOf() {
    const std::wstring e = envPath(L"WS_PRESETS_FILE");
    return e.empty() ? libraryFolder() + kPathSep + L"OKTOWAVE presets.txt" : e;
  }
  static std::wstring oldBankPath() {
    const std::wstring e = envPath(L"WS_PRESETS_FILE");
    if (!e.empty()) return e + L".oldbank";   // tests: never the player's files
    return libraryFolder() + kPathSep + L"Wavelet Synthesizer user bank.txt";
  }
  void refreshLocked() {
    uint64_t st = 0, sz = 0;
    const bool exists = fileStamp(pathOf(), st, sz);
    if (!exists) sz = 0;
    if (loaded && exists == existed && (!exists || (st == stamp && sz == size))) return;
    loaded = true; existed = exists; size = sz;
    if (exists) stamp = st;
    State t;
    builtIn(t);
    bool found = false;
    std::string all = readTextFile(pathOf(), found);
    if (!found) all = readTextFile(oldBankPath(), found);   // the beta 0.3 user bank, before the library file existed
    if (found) parse(all, t);
    s = std::move(t);
    ver++;
  }
  // after a successful write the new content is the state, and the file stamp is taken (no reload)
  std::wstring commit(State& t) {
    const std::wstring e = writeTextFile(pathOf(), text(t));
    if (!e.empty()) return e;
    s = std::move(t);
    uint64_t st = 0, sz = 0;
    if (fileStamp(pathOf(), st, sz)) { existed = true; stamp = st; size = sz; }
    ver++;
    return L"";
  }

  static void parse(const std::string& all, State& t) {
    int part = 0;   // 0 = before any marker (a beta 0.3 user-bank file), 1 = factory presets, 2 = user bank, 3 = list order
    int orderList = -1;
    std::vector<std::vector<int>> orders(listLabels().size());
    int sec = -1;
    BankPreset* cur = nullptr;
    struct Fb { std::string name, orig; bool adj = false, del = false; double v[kNumParams]; } fb;
    bool inFb = false;
    auto endFb = [&] {
      if (!inFb) return;
      inFb = false;
      for (int k = 0; k < kNumPresets; k++)
        if (fb.orig == kPresets[k].name) {
          t.del[k] = fb.del ? 1 : 0;
          if (!fb.adj) break;   // only the adjusted ones replace the built-in presets
          t.names[k] = fb.name.empty() ? fb.orig : fb.name;
          for (int i = 0; i < kNumParams; i++) t.vals[k][i] = fb.v[i];
          t.adj[k] = 1;
          break;
        }
    };
    for (size_t p = 0; p < all.size();) {
      size_t e = all.find('\n', p);
      if (e == std::string::npos) e = all.size();
      std::string line = all.substr(p, e - p);
      p = e + 1;
      if (!line.empty() && line.back() == '\r') line.pop_back();
      if (line.compare(0, 9, "######## ") == 0) {
        endFb();
        cur = nullptr; sec = -1;
        part = line.find("FACTORY") != std::string::npos ? 1 : line.find("USER BANK") != std::string::npos ? 2 :
               line.find("LIST ORDER") != std::string::npos ? 3 : 0;
        orderList = -1;
        continue;
      }
      if (part == 3) {   // "== List ==" then "N. built-in name   (now: ... / deleted)"
        if (line.size() > 6 && line.compare(0, 3, "== ") == 0 && line.compare(line.size() - 3, 3, " ==") == 0) {
          const std::string lab = line.substr(3, line.size() - 6);
          const auto& labels = listLabels();
          orderList = (int)(std::find(labels.begin(), labels.end(), lab) - labels.begin());
          if (orderList >= (int)labels.size()) orderList = -1;
        } else if (orderList >= 0) {
          const size_t dot = line.find(". ");
          if (dot == std::string::npos || dot == 0 || dot > 4) continue;
          std::string key = line.substr(dot + 2);
          const size_t note = key.find("   (");
          if (note != std::string::npos) key.resize(note);
          for (int k = 0; k < kNumPresets; k++) if (key == kPresets[k].name) { orders[orderList].push_back(k); break; }
        }
        continue;
      }
      if (part == 1) {
        if (line.compare(0, 8, "Preset: ") == 0) {
          endFb();
          inFb = true; fb.name = line.substr(8); fb.orig.clear(); fb.adj = false; fb.del = false;
          for (int i = 0; i < kNumParams; i++) fb.v[i] = kParams[i].def;
        } else if (inFb && line.compare(0, 9, "Factory: ") == 0) fb.orig = line.substr(9);
        else if (inFb && line.compare(0, 10, "Adjusted: ") == 0) fb.adj = line.compare(10, 3, "yes") == 0;
        else if (inFb && line.compare(0, 9, "Deleted: ") == 0) fb.del = line.compare(9, 3, "yes") == 0;
        else if (inFb) parseParamLine(line, fb.v);
        continue;
      }
      // user bank (part 2, or a beta 0.3 user-bank file)
      if (line.size() > 6 && line.compare(0, 3, "== ") == 0 && line.compare(line.size() - 3, 3, " ==") == 0) {
        sec = bankSectionOf(line.substr(3, line.size() - 6));
        cur = nullptr;
      } else if (line.compare(0, 8, "Preset: ") == 0 && sec >= 0 && line.size() > 8) {
        BankPreset np;
        np.section = sec; np.name = line.substr(8);
        for (int i = 0; i < kNumParams; i++) np.v[i] = kParams[i].def;
        t.user.push_back(np);
        cur = &t.user.back();
      } else if (line.compare(0, 6, "From: ") == 0 && cur) cur->from = line.substr(6);
      else if (cur) parseParamLine(line, cur->v);
    }
    endFb();
    // each list in the file's order: the members it names first, then the others (new presets) in their default place
    for (size_t i = 0; i < orders.size() && i < t.lists.size(); i++) {
      if (orders[i].empty()) continue;
      std::vector<int> v;
      for (int k : orders[i])
        if (std::count(t.lists[i].begin(), t.lists[i].end(), k) && !std::count(v.begin(), v.end(), k)) v.push_back(k);
      for (int k : t.lists[i]) if (!std::count(v.begin(), v.end(), k)) v.push_back(k);
      t.lists[i] = v;
    }
  }

  static std::string text(const State& t) {
    std::string s;
    char b[256];
    auto L = [&s](const std::string& x) { s += x; s += "\r\n"; };
    const LocalTime tm = localNow();
    int adj = 0, del = 0; for (char a : t.adj) adj += a; for (char d : t.del) del += d;
    L("OKTOWAVE Wavelet Synthesizer - presets");
    L("Saved by the VST plug-in (beta 0.3): every factory preset (those you adjusted with SAVE PRESET say \"Adjusted: yes\",");
    L("with their name now; those you deleted say \"Deleted: yes\") and your user bank. Each preset: its name, then the");
    L("parameters that differ from the defaults.");
    L("Format: key: value   (name: shown value)");
    std::snprintf(b, sizeof b, "Saved: %04d-%02d-%02d %02d:%02d   Factory presets: %d (adjusted: %d, deleted: %d)   User bank: %d",
                  tm.wYear, tm.wMonth, tm.wDay, tm.wHour, tm.wMinute, kNumPresets, adj, del, (int)t.user.size());
    L(b);
    L("");
    L("######## FACTORY PRESETS ########");
    const char* lastCat = nullptr;
    for (int k = 0; k < kNumPresets; k++) {
      const char* cat = k < kNumFavourites ? "\xE2\x98\x85 Favourites" : kPresets[k].cat;
      if (!lastCat || std::strcmp(cat, lastCat) != 0) { L(""); L(std::string("== ") + cat + " =="); lastCat = cat; }
      L("");
      L("Preset: " + t.names[k]);
      L(std::string("Factory: ") + kPresets[k].name);
      L(t.adj[k] ? "Adjusted: yes" : "Adjusted: no");
      if (t.del[k]) L("Deleted: yes");
      paramLines(t.vals[k].data(), s);
    }
    L("");
    L("######## LIST ORDER (the preset browser, as arranged with MOVE UP / DOWN; built-in names) ########");
    for (size_t i = 0; i < t.lists.size(); i++) {
      L("");
      L("== " + listLabels()[i] + " ==");
      int n = 0;
      for (int k : t.lists[i]) {
        std::string line = std::to_string(++n) + ". " + kPresets[k].name;
        if (t.names[k] != kPresets[k].name) line += "   (now: " + t.names[k] + ")";
        if (t.del[k]) line += "   (deleted)";
        L(line);
      }
    }
    L("");
    L("######## USER BANK ########");
    for (int sec = 0; sec < kNumBankSections; sec++) {
      L("");
      L(std::string("== ") + kBankSections[sec] + " ==");
      bool any = false;
      for (const BankPreset& p : t.user) {
        if (p.section != sec) continue;
        any = true;
        L("");
        L("Preset: " + p.name);
        if (!p.from.empty()) L("From: " + p.from);
        paramLines(p.v, s);
      }
      if (!any) L("(empty)");
    }
    return s;
  }
};

}  // namespace ws
