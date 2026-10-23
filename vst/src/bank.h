// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.6).
// beta 0.3: the PRESET LIBRARY of the plug-in, in one readable text file "OKTOMULTIWAVE presets.txt" kept next to the
// OktoMultiWaveSynth.vst3 folder (so that installing a new version, which replaces that folder, keeps it); version 1.0.17: in the player's
// Documents folder (Documents\OktoPierre\Okto Fractal Wavelet, made at the first thing he keeps; the file of an older version next to the plug-in is
// read until then and stays as it was), with EXPORT / IMPORT of one bank (exportBank, importScan, importSome):
// - every factory preset, as the player may have ADJUSTED it (SAVE PRESET overwrites a factory preset, optionally under a
//   new name; "Adjusted: yes" in the file; only those override the built-in presets when the file is read back), or
//   DELETED it ("Deleted: yes": hidden from the browser, the menu and the arrows, to be dropped from the next version);
// - the USER BANK: the player's own sounds in 12 sections (the factory types + Chords), in the player's order;
// - the LIST ORDER of the preset browser: TOP Sounds and each category, as the player arranged them with MOVE UP / DOWN
//   (built-in names, one per line). beta 0.5 ("LIST ORDER v2"): the lists also say which presets they hold — the player
//   moves a preset to another category and adds or removes TOP Sounds; a preset the file does not know (a newer version's)
//   goes to its default places. Older files' lists are not read (beta 0.5 rebuilt the factory lists). beta 0.7 ("LIST ORDER
//   v3"): OktoPierre's 22 TOP Sounds and Source Phase last: the v2 lists of beta 0.5 are not read either (rebuilt again).  beta 0.3.1 ("LIST ORDER v4"): the new TOP Sounds: the v3 lists are not read either.
// beta 0.3.1: STARS. The player rates the sounds in the preset browser (1-10, shown as five stars with half stars; 0 = none): "Stars: 7" is a line of a
// factory preset's or a user-bank sound's block (a factory preset the player did not rate keeps the stars of its built-in vote, kPresetStars, when it has
// one; "Stars: 0" is a rating he cleared). They are in the file, so EXPORT carries them and IMPORT reads them.
// The file is shared by every instance and Live Set, read again whenever it changes on disk, written atomically, and is
// meant to be read back to make the next version's factory presets. Format (one block per preset; the parameters that
// differ from the defaults, ENGINE and A/B MIX always, as in tools/spec.js):
//   ######## FACTORY PRESETS ########
//   == Bass ==
//   Preset: A · Acid Sub 2             (its name now)
//   Factory: A · Acid Sub              (its built-in name: the key)
//   Adjusted: yes
//     f_cutoff: 5.5   (Cutoff: band 5.5)
//   ######## USER BANK ########
//   == Chords ==
//   Preset: My Chord
//   From: A · Warm Pad (modified)
//     ...
// A beta 0.3 user-bank file ("Okto MultiWave Synth user bank.txt", sections and presets only) is read when the library
// file does not exist yet.
#pragma once
#include <algorithm>
#include <array>
#include <atomic>
#include <cctype>
#include <chrono>
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
                                                "Bells & Mallets", "Chords", "FX", "Drums & Perc", "KeyAttac"};   // version 1.0.3: KeyAttac, filled with the retouched favourites (kKeyAttac)
inline constexpr int kNumBankSections = (int)(sizeof kBankSections / sizeof *kBankSections);
// version 1.0.17 (the owner: "pouvoir créer une nouvelle banque"): the player's own banks come after these sections (NEW BANK in the preset browser); a section index from
// kNumBankSections on is one of them (State::banks). The file writes them as more "== name ==" headers of the USER BANK, empty ones too.
inline constexpr int kMaxCustomBanks = 12;
// version 1.0.17 (the owner: NEW "un nouveau preset apparaît dans la liste juste après le preset sélectionné", in the factory lists too): the player's own presets placed
// in the factory lists (NEW in the factory tab). A list entry k from kNumPresets on is State::extra[k - kNumPresets]; the file keeps them in a part of their own,
// "######## YOUR PRESETS IN THE FACTORY LISTS ########" (before the LIST ORDER), and the lists name them "N. + name".
inline constexpr int kMaxExtra = 500;

struct BankPreset {
  int section = 0;
  int stars = 0;   // beta 0.3.1: the player's rating of this sound, 1..10 (0 = none)
  std::string name, from;
  double v[kNumParams];   // plain values (hidden parameters at their default)
};

// beta 0.6 (security review): limits for a presets file from someone else. The save windows allow 48 characters
// (≤ 144 bytes of UTF-8), so a name above kMaxNameBytes never comes from the plug-in; a user bank of millions of sounds
// would freeze the host (every edit and repaint copies the library).
inline constexpr size_t kMaxBankSounds = 2000, kMaxNameBytes = 160;
inline std::string clipName(std::string s) {
  if (s.size() <= kMaxNameBytes) return s;
  size_t n = kMaxNameBytes;
  while (n > 0 && ((unsigned char)s[n] & 0xC0) == 0x80) n--;   // not inside a UTF-8 character
  s.resize(n);
  return s;
}

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
// the parameter lines of a sound: those that differ from the defaults, OSC (the oscillator shown) always
inline void paramLines(const double* v, std::string& s) {
  for (int i = 0; i < kNumParams; i++) {
    const ParamDef& d = kParams[i];
    if (d.hidden || d.perf) continue;   // Okto MultiWave Synth: the chord keyboard's settings are not a sound
    if (i != P_OSC_VIEW && std::fabs(v[i] - d.def) <= 1e-9 * std::max(1.0, std::fabs(d.def))) continue;
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
    if (key == kParams[i].key && !kParams[i].hidden && !kParams[i].perf) { v[i] = std::min(kParams[i].max, std::max(kParams[i].min, x)); return true; }
  return false;
}

// ------------------------------------------------------------------ the library (one per process)
class Library {
 public:
  static Library& get() { static Library lib; return lib; }

  std::wstring path() { return readPath(); }   // (version 1.0.17: the file read now; the first write moves it to the Documents library)
  // reads the file again when it changed on disk (another instance or another editor wrote it)
  void refresh() { std::lock_guard<std::mutex> l(m); refreshLocked(true); }
  uint32_t version() { return ver.load(); }   // changes with the content (the editor redraws)

  std::string name(int k) { std::lock_guard<std::mutex> l(m); refreshLocked(); return k >= 0 && k < kNumPresets ? s.names[k] : extraOf(s, k) ? extraOf(s, k)->name : ""; }
  void values(int k, double* v) {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    const BankPreset* x = extraOf(s, k);   // (version 1.0.17: a preset of the player's own in a factory list)
    for (int i = 0; i < kNumParams; i++) v[i] = k >= 0 && k < kNumPresets ? s.vals[k][i] : x ? x->v[i] : kParams[i].def;
  }
  // version 1.0.17: the player's presets in the factory lists (entries kNumPresets + j)
  static bool isExtra(int k) { return k >= kNumPresets; }
  int extraCount() { std::lock_guard<std::mutex> l(m); refreshLocked(); return (int)s.extra.size(); }
  // the entry of the extra preset with this name, or -1
  int findExtra(const std::string& n) {
    std::lock_guard<std::mutex> l(m); refreshLocked();
    for (size_t j = 0; j < s.extra.size(); j++) if (s.extra[j].name == n) return kNumPresets + (int)j;
    return -1;
  }
  // a new preset of the player's own into factory list `list`, right after entry `after` (or at the end); in TOP Sounds it also joins the category of `after`
  // (else Other), as every preset is in one category; returns its entry in `entry`
  std::wstring addExtra(const BankPreset& p, int list, int after, int& entry) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    entry = -1;
    if (list < 0 || list >= (int)s.lists.size()) return L"no such list";
    if ((int)s.extra.size() >= kMaxExtra) return L"there are already 500 presets of your own in the factory lists";
    for (const BankPreset& q : s.extra) if (q.name == p.name) return L"a preset of yours already has this name";
    State t = s;
    t.extra.push_back(p);
    const int k = kNumPresets + (int)t.extra.size() - 1;
    auto insertAfter = [&](std::vector<int>& v) { auto at = std::find(v.begin(), v.end(), after); v.insert(at == v.end() ? v.end() : at + 1, k); };
    insertAfter(t.lists[list]);
    if (list == 0) {   // TOP Sounds: its category too
      const int c = catOf(t, after);
      std::vector<int>& cv = t.lists[c > 0 ? c : (int)t.lists.size() - 1];
      if (c > 0) insertAfter(cv); else cv.push_back(k);
    }
    const std::wstring e = commit(t);
    if (e.empty()) entry = k;
    return e;
  }
  // one of them saved again (SAVE PRESET) or renamed
  std::wstring putExtra(int k, const std::string& n, const double* v) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    if (!extraOf(s, k)) return L"no such preset";
    for (size_t j = 0; j < s.extra.size(); j++) if (kNumPresets + (int)j != k && s.extra[j].name == n) return L"a preset of yours already has this name";
    State t = s;
    BankPreset& x = t.extra[k - kNumPresets];
    x.name = n;
    if (v) for (int i = 0; i < kNumParams; i++) x.v[i] = kParams[i].hidden ? kParams[i].def : v[i];
    return commit(t);
  }
  // deleted: out of the lists (the entries after it move down one)
  std::wstring removeExtra(int k) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    if (!extraOf(s, k)) return L"no such preset";
    State t = s;
    t.extra.erase(t.extra.begin() + (k - kNumPresets));
    for (std::vector<int>& v : t.lists) {
      v.erase(std::remove(v.begin(), v.end(), k), v.end());
      for (int& e : v) if (e > k) e--;
    }
    return commit(t);
  }
  bool adjusted(int k) { std::lock_guard<std::mutex> l(m); refreshLocked(); return k >= 0 && k < kNumPresets && s.adj[k]; }
  // beta 0.3.1: the stars of a factory preset: the player's rating, else the built-in vote (the owner's listening test) when it has one
  int stars(int k) { std::lock_guard<std::mutex> l(m); refreshLocked(); return k >= 0 && k < kNumPresets ? starsOf(s, k) : extraOf(s, k) ? extraOf(s, k)->stars : 0; }
  int starredCount() { std::lock_guard<std::mutex> l(m); refreshLocked(); int n = 0; for (int k = 0; k < kNumPresets; k++) n += starsOf(s, k) > 0; for (const BankPreset& p : s.user) n += p.stars > 0; return n; }
  std::wstring setStars(int k, int n) {   // 0 clears the rating
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    n = std::max(0, std::min(10, n));
    if (extraOf(s, k)) {   // (version 1.0.17: a preset of the player's own in a factory list)
      if (extraOf(s, k)->stars == n) return L"";
      State t = s; t.extra[k - kNumPresets].stars = n; return commit(t);
    }
    if (k < 0 || k >= kNumPresets) return L"no such preset";
    State t = s;
    t.stars[k] = n == kPresetStars[k] ? -1 : (signed char)n;
    if (t.stars[k] == s.stars[k]) return L"";
    return commit(t);
  }
  std::wstring setUserStars(int section, const std::string& name, int n) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    State t = s;
    auto it = std::find_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == section && q.name == name; });
    if (it == t.user.end()) return L"not in the bank";
    n = std::max(0, std::min(10, n));
    if (it->stars == n) return L"";
    it->stars = n;
    return commit(t);
  }
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
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    if (k < 0 || k >= kNumPresets) return L"no such preset";
    State t = s;
    t.names[k] = newName;
    for (int i = 0; i < kNumParams; i++) t.vals[k][i] = kParams[i].hidden || kParams[i].perf ? kParams[i].def : v[i];
    t.adj[k] = 1;
    return commit(t);
  }
  std::wstring restore(int k) {   // the built-in preset again
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    if (k < 0 || k >= kNumPresets) return L"no such preset";
    State t = s;
    t.names[k] = kPresets[k].name;
    for (int i = 0; i < kNumParams; i++) t.vals[k][i] = kPresets[k].v[i];
    t.adj[k] = 0;
    return commit(t);
  }
  std::wstring setDeleted(int k, bool del) {   // a factory preset hidden from the lists, or shown again
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    if (k < 0 || k >= kNumPresets) return L"no such preset";
    State t = s;
    t.del[k] = del ? 1 : 0;
    return commit(t);
  }
  // adds p to the user bank, or replaces the sound (section, replaceName) / (p.section, p.name); version 1.0.17: a new sound goes right after the sound
  // `after` of its section when given (NEW), else at the end
  std::wstring putUser(const BankPreset& p, const std::string& replaceName = "", const std::string& after = "") {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    State t = s;
    const std::string key = replaceName.empty() ? p.name : replaceName;
    t.user.erase(std::remove_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) {
      return q.section == p.section && q.name == p.name && q.name != key; }), t.user.end());   // a renamed sound replaces a namesake
    auto it = std::find_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == p.section && q.name == key; });
    if (it != t.user.end()) { const int keep = p.stars > 0 ? p.stars : it->stars; *it = p; it->stars = keep; }   // saving a sound again keeps its stars
    else if (t.user.size() >= kMaxBankSounds) return L"the user bank is full (2000 sounds): delete some first";
    else {
      auto at = after.empty() ? t.user.end() : std::find_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == p.section && q.name == after; });
      t.user.insert(at == t.user.end() ? t.user.end() : at + 1, p);
    }
    return commit(t);
  }
  std::wstring removeUser(int section, const std::string& n) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    State t = s;
    t.user.erase(std::remove_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == section && q.name == n; }), t.user.end());
    return commit(t);
  }
  // version 1.0.17: the banks of the user bank: the built-in sections, then the player's own banks, in the order he made them
  std::vector<std::string> bankNames() { std::lock_guard<std::mutex> l(m); refreshLocked(); return namesOf(s); }
  // a new bank of the player's own (empty); "" when done
  std::wstring addBank(const std::string& n) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    const std::string nm = clipName(n);
    if (nm.empty()) return L"a bank needs a name";
    const std::vector<std::string> all = namesOf(s);
    if (std::find(all.begin(), all.end(), nm) != all.end()) return L"a bank already has this name";
    if ((int)s.banks.size() >= kMaxCustomBanks) return L"there are already 12 banks of your own: delete one first";
    State t = s;
    t.banks.push_back(nm);
    return commit(t);
  }
  // one of the player's banks (section kNumBankSections + j) renamed; its sounds stay in it
  std::wstring renameBank(int section, const std::string& n) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    const int j = section - kNumBankSections;
    if (j < 0 || j >= (int)s.banks.size()) return L"only a bank of your own can be renamed";
    const std::string nm = clipName(n);
    if (nm.empty()) return L"a bank needs a name";
    const std::vector<std::string> all = namesOf(s);
    for (size_t i = 0; i < all.size(); i++) if ((int)i != section && all[i] == nm) return L"a bank already has this name";
    State t = s;
    t.banks[j] = nm;
    return commit(t);
  }
  // one of the player's banks deleted, with its sounds (the banks after it move up one place)
  std::wstring removeBank(int section) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    const int j = section - kNumBankSections;
    if (j < 0 || j >= (int)s.banks.size()) return L"only a bank of your own can be deleted";
    State t = s;
    t.user.erase(std::remove_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == section; }), t.user.end());
    for (BankPreset& q : t.user) if (q.section > section) q.section--;
    t.banks.erase(t.banks.begin() + j);
    return commit(t);
  }
  // version 1.0.17 (the owner: "copier et coller un preset"): one sound as text, a block of the presets file's own format, so that COPY / PASTE work between two
  // instances, two hosts, or through a message; PASTE reads the first block of a text ("Preset: ..." and the parameter lines after it)
  static std::string presetText(const std::string& name, const std::string& from, const double* v) {
    std::string s = "OKTOMULTIWAVE SYNTH - preset (PASTE in the preset browser of the plug-in puts it in your user bank)\r\n";
    s += "Preset: " + name + "\r\n";
    if (!from.empty()) s += "From: " + from + "\r\n";
    paramLines(v, s);
    return s;
  }
  static bool parsePreset(const std::string& all, BankPreset& out) {
    bool in = false;
    for (int i = 0; i < kNumParams; i++) out.v[i] = kParams[i].def;
    out.name.clear(); out.from.clear(); out.stars = 0;
    for (size_t p = 0; p < all.size() && p < (1u << 20);) {
      size_t e = all.find('\n', p);
      if (e == std::string::npos) e = all.size();
      std::string line = all.substr(p, e - p);
      p = e + 1;
      if (!line.empty() && line.back() == '\r') line.pop_back();
      if (line.compare(0, 8, "Preset: ") == 0) {
        if (in) break;   // the next block: the first one only
        in = true;
        out.name = clipName(line.substr(8));
      } else if (in && line.compare(0, 9, "######## ") == 0) break;
      else if (in && line.compare(0, 6, "From: ") == 0) out.from = clipName(line.substr(6));
      else if (in) parseParamLine(line, out.v);
    }
    return in && !out.name.empty();
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
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    if (i < 0 || i >= (int)s.lists.size()) return L"no such list";
    State t = s;
    std::vector<int>& v = t.lists[i];
    const int at = (int)(std::find(v.begin(), v.end(), k) - v.begin());
    if (at >= (int)v.size()) return L"not in this list";
    for (int j = at + dir; j >= 0 && j < (int)v.size(); j += dir)
      if (!(v[j] < kNumPresets && t.del[v[j]])) { std::swap(v[at], v[j]); return commit(t); }   // (version 1.0.17: an entry of the player's own is never deleted)
    return L"";   // already at that end
  }
  // beta 0.5: the category a factory preset is in now (its index in lists(), 1..), and its built-in one
  int categoryOf(int k) { std::lock_guard<std::mutex> l(m); refreshLocked(); return catOf(s, k); }
  static int defaultCategory(int k) {
    const auto& labels = listLabels();
    for (size_t i = 1; i < labels.size(); i++) if (k >= 0 && k < kNumPresets && labels[i] == kPresets[k].cat) return (int)i;
    return -1;
  }
  bool inTop(int k) { std::lock_guard<std::mutex> l(m); refreshLocked(); return std::count(s.lists[0].begin(), s.lists[0].end(), k) > 0; }
  // beta 0.5: preset k into the category list `to` (1..): at the end of it, or at its own place when it goes back to its
  // built-in category; "" when done or already there
  std::wstring moveToCategory(int k, int to) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    if (k < 0 || (k >= kNumPresets && !extraOf(s, k)) || to < 1 || to >= (int)s.lists.size()) return L"no such preset or category";
    if (catOf(s, k) == to) return L"";
    State t = s;
    for (size_t i = 1; i < t.lists.size(); i++) t.lists[i].erase(std::remove(t.lists[i].begin(), t.lists[i].end(), k), t.lists[i].end());
    std::vector<int>& v = t.lists[to];
    auto at = v.end();
    if (to == defaultCategory(k))
      at = std::find_if(v.begin(), v.end(), [&](int j) { return defaultCategory(j) == to && kPresetRank[j] > kPresetRank[k]; });
    v.insert(at, k);
    return commit(t);
  }
  // beta 0.5: preset k added to TOP Sounds (at the end) or taken out of it
  std::wstring setTop(int k, bool on) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    if (k < 0 || (k >= kNumPresets && !extraOf(s, k))) return L"no such preset";
    State t = s;
    std::vector<int>& v = t.lists[0];
    const bool in = std::count(v.begin(), v.end(), k) > 0;
    if (in == on) return L"";
    if (on) v.push_back(k); else v.erase(std::remove(v.begin(), v.end(), k), v.end());
    return commit(t);
  }
  // beta 0.5: a sound of the user bank into another section (at its end); the editor checks first that no sound of that
  // section has its name
  std::wstring moveUserTo(int section, const std::string& n, int to) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    if (to < 0 || to >= kNumBankSections + (int)s.banks.size()) return L"no such section";   // (version 1.0.17: or a bank of the player's own)
    State t = s;
    auto it = std::find_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == section && q.name == n; });
    if (it == t.user.end()) return L"not in the bank";
    if (section == to) return L"";
    BankPreset p = *it;
    p.section = to;
    t.user.erase(it);
    t.user.push_back(p);
    return commit(t);
  }
  // MOVE UP / DOWN in the user bank: the sound swaps with the next one of its section
  std::wstring moveUser(int section, const std::string& n, int dir) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    State t = s;
    int at = -1;
    for (int j = 0; j < (int)t.user.size(); j++) if (t.user[j].section == section && t.user[j].name == n) at = j;
    if (at < 0) return L"not in the bank";
    for (int j = at + dir; j >= 0 && j < (int)t.user.size(); j += dir)
      if (t.user[j].section == section) { std::swap(t.user[at], t.user[j]); return commit(t); }
    return L"";
  }
  std::wstring exportTo(const std::wstring& to) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    return writeTextFile(to, text(s));
  }
  // version 1.0.17 (the owner: "exporter soit une banque particulière, utilisateur ou banque de factory"): EXPORT of one bank, as a file of the presets file's own
  // format holding that bank only (a USER BANK part with one "== name ==" section): the sounds of a bank of the user bank (index: its section), the presets of a
  // factory list as they are now (index: the list; the deleted ones left out), or the favourites (every sound rated minStars or more: the factory presets and his
  // own in the lists, in the browser's order, then the user bank). Each sound carries all its settings and its stars, so that IMPORT adds the bank in any later
  // version, whatever its factory presets. `count`: the sounds written.
  enum { kExportUserBank = 0, kExportFactoryList = 1, kExportFavourites = 2 };
  std::wstring exportBank(const std::wstring& to, int what, int index, int minStars, int& count) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    count = 0;
    std::vector<BankPreset> v;
    std::string label;
    if (what == kExportUserBank) {
      const std::vector<std::string> names = namesOf(s);
      if (index < 0 || index >= (int)names.size()) return L"no such bank";
      label = names[index];
      for (const BankPreset& p : s.user) if (p.section == index) v.push_back(p);
    } else if (what == kExportFactoryList) {
      if (index < 0 || index >= (int)s.lists.size()) return L"no such list";
      label = listLabels()[index];
      for (int k : s.lists[index]) if ((k < kNumPresets && !s.del[k]) || extraOf(s, k)) v.push_back(entryOf(s, k));
    } else {
      minStars = std::max(1, std::min(10, minStars));
      label = "Favourites";
      std::vector<char> seen(kNumPresets + s.extra.size(), 0);
      for (const std::vector<int>& list : s.lists)
        for (int k : list) {
          if (k < 0 || k >= (int)seen.size() || seen[k] || (k < kNumPresets && s.del[k])) continue;
          seen[k] = 1;
          const BankPreset p = entryOf(s, k);
          if (p.stars >= minStars) v.push_back(p);
        }
      for (const BankPreset& p : s.user) if (p.stars >= minStars) v.push_back(p);
    }
    if (v.empty()) return L"there is no sound to export in it";
    count = (int)v.size();
    return writeTextFile(to, bankText(label, v));
  }
  // IMPORT (beta 0.4): the presets of another file (an EXPORT, someone's "OKTOMULTIWAVE presets.txt", a beta 0.3 user bank)
  // replace the library — adjusted and deleted presets, list order, user bank. The file is read and checked first; the
  // current file is then kept as "OKTOMULTIWAVE presets (backup <date> <time>).txt" next to it (`backup`, "" when there was
  // none). Returns "" or the error (the library is then unchanged). Version 1.0.17: the IMPORT window's REPLACE EVERYTHING.
  std::wstring importFrom(const std::wstring& from, std::wstring& backup) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    backup.clear();
    State t;
    std::wstring e = readImport(from, t);
    if (!e.empty()) return e;
    if (t.fileVer < 7) seedKeyAttac(t);
    e = backupCurrent(backup);
    if (!e.empty()) return e;
    return commit(t);
  }
  // version 1.0.17 (the owner: "à l'import, on demande si l'utilisateur préfère tout écraser ou importer uniquement une ou des banques particulières"): what a
  // file holds, for the IMPORT window to offer: each bank of its user bank that has sounds, the factory presets it adjusted, its presets in the factory lists,
  // its stars of the factory presets
  struct ImportItem {
    int kind = 0;        // 0 a bank of its user bank, 1 its adjusted factory presets, 2 its presets in the factory lists, 3 its stars of the factory presets
    std::string name;    // the bank's name (kind 0)
    int count = 0;       // sounds (stars: ratings)
    int section = -1;    // the bank's section in the file (kind 0)
  };
  std::wstring importScan(const std::wstring& from, std::vector<ImportItem>& items, std::string& savedBy) {
    items.clear(); savedBy.clear();
    State f;
    const std::wstring e = readImport(from, f);
    if (!e.empty()) return e;
    scanState(f, items);
    savedBy = f.savedBy;
    return items.empty() ? L"it holds no sound of a bank, no adjusted preset and no stars" : L"";
  }
  // the items chosen of the file (importScan's order) join the library, and nothing of the player's is replaced (the owner: "elle sera ajoutée en plus",
  // "tout ne soit pas écrasé"). A bank: ADD makes it a bank of his own (its name, or "name (imported)" when he has a bank of that name with sounds in it; an
  // empty built-in section of that name takes it), MERGE puts its sounds into his bank of that name (made when missing): a sound he has already (the same name
  // and settings) is left out, a namesake that differs comes in as "name (2)". The adjusted factory presets and the presets of the factory lists come in the
  // same way, as the banks "Adjusted presets" and "My presets"; stars rate only the factory presets he has not rated. His file is kept as a backup copy first
  // (`backup`); `summary` says what came in.
  enum { kImportAdd = 0, kImportMerge = 1 };
  std::wstring importSome(const std::wstring& from, const std::vector<char>& chosen, int mode, std::wstring& backup, std::string& summary) {
    std::lock_guard<std::mutex> l(m); refreshLocked(true);
    backup.clear(); summary.clear();
    State f;
    std::wstring e = readImport(from, f);
    if (!e.empty()) return e;
    std::vector<ImportItem> items;
    scanState(f, items);
    State t = s;
    auto same = [](const BankPreset& a, const BankPreset& b) {
      for (int i = 0; i < kNumParams; i++)
        if (!kParams[i].hidden && !kParams[i].perf && std::fabs(a.v[i] - b.v[i]) > 2e-6 * std::max(1.0, std::fabs(b.v[i]))) return false;
      return true;
    };
    auto inBank = [&](int sec, const std::string& n) { return std::find_if(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == sec && q.name == n; }); };
    auto target = [&](const std::string& name, std::wstring& err) -> int {   // the bank of t that takes a bank named `name`; -1: he has 12 banks of his own already
      const std::vector<std::string> names = namesOf(t);
      auto at = [&](const std::string& n) { return (int)(std::find(names.begin(), names.end(), n) - names.begin()); };
      const int i = at(name);
      const bool filled = i < (int)names.size() && std::any_of(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == i; });
      if (i < (int)names.size() && (mode == kImportMerge || !filled)) return i;
      std::string nm = name;
      if (i < (int)names.size()) {
        nm = clipName(name + " (imported)");
        for (int n = 2; at(nm) < (int)names.size(); n++) nm = clipName(name + " (imported " + std::to_string(n) + ")");
      }
      if ((int)t.banks.size() >= kMaxCustomBanks) { err = L"there are already 12 banks of your own: delete one first"; return -1; }
      t.banks.push_back(nm);
      return kNumBankSections + (int)t.banks.size() - 1;
    };
    std::string sum;
    int done = 0;
    for (size_t i = 0; i < items.size() && i < chosen.size(); i++) {
      if (!chosen[i]) continue;
      const ImportItem& it = items[i];
      done++;
      if (it.kind == 3) {   // stars: the factory presets he has not rated
        int n = 0;
        for (int k = 0; k < kNumPresets; k++) if (f.stars[k] > 0 && t.stars[k] < 0) { t.stars[k] = f.stars[k]; n++; }
        sum += (sum.empty() ? "" : "; ") + std::string("stars: ") + std::to_string(n) + (n == 1 ? " rating" : " ratings");
        continue;
      }
      std::vector<BankPreset> v;
      std::string name = it.name;
      if (it.kind == 0) { for (const BankPreset& p : f.user) if (p.section == it.section) v.push_back(p); }
      else if (it.kind == 1) { name = "Adjusted presets"; for (int k = 0; k < kNumPresets; k++) if (f.adj[k]) v.push_back(entryOf(f, k)); }
      else { name = "My presets"; v = f.extra; }
      std::wstring err;
      const int sec = target(name, err);
      if (sec < 0) return err;
      int added = 0, skipped = 0;
      for (BankPreset p : v) {
        p.section = sec;
        auto have = inBank(sec, p.name);
        if (have != t.user.end()) {
          if (same(*have, p)) { skipped++; continue; }
          const std::string base = p.name;
          for (int n = 2; inBank(sec, p.name) != t.user.end(); n++) p.name = clipName(base + " (" + std::to_string(n) + ")");
        }
        if (t.user.size() >= kMaxBankSounds) return L"the user bank is full (2000 sounds): delete some first";
        t.user.push_back(p);
        added++;
      }
      sum += (sum.empty() ? "" : "; ") + namesOf(t)[sec] + ": " + std::to_string(added) + (added == 1 ? " sound" : " sounds") +
             (skipped ? " (" + std::to_string(skipped) + " already there)" : "");
    }
    if (!done) return L"nothing is chosen";
    e = backupCurrent(backup);
    if (!e.empty()) return e;
    e = commit(t);
    if (e.empty()) summary = sum;
    return e;
  }

 private:
  struct State {
    std::vector<std::string> names;
    std::vector<std::array<double, kNumParams>> vals;
    std::vector<char> adj, del;
    std::vector<signed char> stars;        // beta 0.3.1: the player's rating of each factory preset, -1 = none given (the built-in vote, if any, shows)
    std::vector<std::vector<int>> lists;   // the preset browser's factory lists (listLabels order)
    std::vector<BankPreset> user;
    std::vector<std::string> banks;   // version 1.0.17: the player's own banks (sections kNumBankSections + j)
    std::vector<BankPreset> extra;    // version 1.0.17: the player's presets in the factory lists (entries kNumPresets + j)
    bool tooMany = false;   // parse met more than kMaxBankSounds bank sounds (the rest is left out)
    int fileVer = 0;        // version 1.0.3: the "LIST ORDER vN" of the file read (0: none); the KeyAttac folder is put in the user bank while it is below 7
    std::string savedBy;    // version 1.0.17: the "Plug-in version:" of the file read ("" before 1.0.17)
  };
  std::mutex m;
  State s;
  bool loaded = false, existed = false;
  bool tooBig = false;   // the file is longer than 16 MB: it was read cut, so nothing is ever written over it
  std::chrono::steady_clock::time_point checked{};   // when the file was last looked at (readers look at most every 500 ms)
  uint64_t stamp = 0, size = 0;   // the file's last write time and size when read or written
  std::wstring readFrom;          // version 1.0.17: the file they are of (the Documents library's, or an older version's next to the plug-in)
  uint64_t known = 0;             // version 1.0.17: textHash of that file's text when read or written (an edit sees a change the time and size miss)
  static uint64_t textHash(const std::string& x) { uint64_t h = 1469598103934665603ull; for (unsigned char c : x) { h ^= c; h *= 1099511628211ull; } return h; }   // FNV-1a
  std::atomic<uint32_t> ver{1};

  Library() { builtIn(s); seedKeyAttac(s); }
  static void builtIn(State& t) {
    t.names.assign(kNumPresets, ""); t.vals.assign(kNumPresets, {}); t.adj.assign(kNumPresets, 0); t.del.assign(kNumPresets, 0); t.stars.assign(kNumPresets, -1); t.user.clear(); t.banks.clear(); t.extra.clear();
    for (int k = 0; k < kNumPresets; k++) {
      t.names[k] = kPresets[k].name;
      for (int i = 0; i < kNumParams; i++) t.vals[k][i] = kPresets[k].v[i];
    }
    t.lists = defaultLists();
  }
  // version 1.0.3: the KeyAttac folder of the user bank: the favourites retouched to be percussive (kKeyAttac); put there while the presets file is older than "LIST ORDER v7" (or there is none),
  // the ones that are already there are left as they are, and after the first write the player's deletions stay
  static void seedKeyAttac(State& t) {
    const int sec = bankSectionOf("KeyAttac");
    if (sec < 0) return;
    for (int k = 0; k < kNumKeyAttac; k++) {
      const bool have = std::any_of(t.user.begin(), t.user.end(), [&](const BankPreset& q) { return q.section == sec && q.name == kKeyAttac[k].name; });
      if (have || t.user.size() >= kMaxBankSounds) continue;
      BankPreset p; p.section = sec; p.name = kKeyAttac[k].name; p.from = kKeyAttac[k].from; p.stars = kKeyAttac[k].stars;
      for (int i = 0; i < kNumParams; i++) p.v[i] = kKeyAttac[k].v[i];
      t.user.push_back(p);
    }
  }
  static int starsOf(const State& t, int k) { return t.stars[k] >= 0 ? t.stars[k] : kPresetStars[k]; }
  static const BankPreset* extraOf(const State& t, int k) { return k >= kNumPresets && k - kNumPresets < (int)t.extra.size() ? &t.extra[k - kNumPresets] : nullptr; }
  static std::vector<std::string> namesOf(const State& t) {   // version 1.0.17: the built-in sections, then the player's banks
    std::vector<std::string> v(kBankSections, kBankSections + kNumBankSections);
    v.insert(v.end(), t.banks.begin(), t.banks.end());
    return v;
  }
  // version 1.0.17: a factory list's entry as a sound of a bank (EXPORT of a list or of the favourites): its name now, its built-in name as From, its settings, its stars
  static BankPreset entryOf(const State& t, int k) {
    if (const BankPreset* x = extraOf(t, k)) return *x;
    BankPreset p;
    p.name = t.names[k]; p.from = kPresets[k].name; p.stars = std::max(0, starsOf(t, k));
    for (int i = 0; i < kNumParams; i++) p.v[i] = t.vals[k][i];
    return p;
  }
  // version 1.0.17: the file of one bank (EXPORT of a bank): a short header, then a USER BANK part with the one section; names made unique in it
  static std::string bankText(const std::string& label, const std::vector<BankPreset>& v) {
    std::string s;
    auto L = [&s](const std::string& x) { s += x; s += "\r\n"; };
    const LocalTime tm = localNow();
    char b[128];
    L("OKTOMULTIWAVE SYNTH - bank");
    L(std::string("One bank of sounds exported by the VST plug-in (") + kAppVersionNum + "): IMPORT... in its preset browser adds it as a bank of your own.");
    L("Each sound: its name, then the parameters that differ from the defaults. Format: key: value   (name: shown value)");
    std::snprintf(b, sizeof b, "Saved: %04d-%02d-%02d %02d:%02d   Sounds: %d", tm.wYear, tm.wMonth, tm.wDay, tm.wHour, tm.wMinute, (int)v.size());
    L(b);
    L(std::string("Plug-in version: ") + kAppVersionNum);
    L("");
    L("######## USER BANK ########");
    L("");
    L("== " + label + " ==");
    std::vector<std::string> used;
    for (const BankPreset& p : v) {
      std::string nm = p.name;
      for (int n = 2; std::find(used.begin(), used.end(), nm) != used.end(); n++) nm = clipName(p.name + " (" + std::to_string(n) + ")");
      used.push_back(nm);
      L("");
      L("Preset: " + nm);
      if (!p.from.empty()) L("From: " + p.from);
      if (p.stars > 0) L("Stars: " + std::to_string(p.stars));
      paramLines(p.v, s);
    }
    return s;
  }
  // version 1.0.17: a file to IMPORT (an EXPORT of everything or of one bank, a presets file of any version, a beta 0.3 user bank), read and checked, into f
  // (what the file holds: the KeyAttac folder is not put in); "" or the error
  static std::wstring readImport(const std::wstring& from, State& f) {
    bool found = false;
    const std::string all = readTextFile(from, found);
    if (!found) return L"the file cannot be read";
    if (all.size() >= (16u << 20)) return L"the file is too large for a presets file (16 MB or more)";
    if (all.find("\nPreset: ") == std::string::npos && all.compare(0, 8, "Preset: ") != 0)
      return L"it holds no preset of the plug-in (no \"Preset:\" line)";
    builtIn(f);
    parse(all, f);
    if (f.tooMany) return L"its user bank holds more than 2000 sounds";
    return L"";
  }
  static void scanState(const State& f, std::vector<ImportItem>& items) {
    items.clear();
    const std::vector<std::string> names = namesOf(f);
    for (int sec = 0; sec < (int)names.size(); sec++) {
      ImportItem it;
      for (const BankPreset& p : f.user) it.count += p.section == sec;
      if (!it.count) continue;
      it.kind = 0; it.name = names[sec]; it.section = sec;
      items.push_back(it);
    }
    ImportItem adj, st, own;
    adj.kind = 1; adj.name = "Adjusted factory presets";
    own.kind = 2; own.name = "Presets of yours in the factory lists"; own.count = (int)f.extra.size();
    st.kind = 3; st.name = "Stars of the factory presets";
    for (int k = 0; k < kNumPresets; k++) { adj.count += f.adj[k]; st.count += f.stars[k] > 0; }
    for (const ImportItem& it : {adj, own, st}) if (it.count) items.push_back(it);
  }
  // before an IMPORT: the current file kept as "OKTOMULTIWAVE presets (backup <date> <time>).txt" in the library's folder (`backup`; "" when there is no file)
  std::wstring backupCurrent(std::wstring& backup) {
    backup.clear();
    if (!existed) return L"";
    bool had = false;
    const std::string cur = readTextFile(readPath(), had);
    if (!had) return L"";
    std::wstring dir = writePath();
    pathUp(dir);
    const LocalTime tm = localNow();
    char b[64];
    for (int k = 1; k < 1000; k++) {   // never over an earlier backup (two imports in the same minute: "... 1644 2")
      if (k == 1) std::snprintf(b, sizeof b, " (backup %04d-%02d-%02d %02d%02d)", tm.wYear, tm.wMonth, tm.wDay, tm.wHour, tm.wMinute);
      else std::snprintf(b, sizeof b, " (backup %04d-%02d-%02d %02d%02d %d)", tm.wYear, tm.wMonth, tm.wDay, tm.wHour, tm.wMinute, k);
      backup = dir + kPathSep + L"OKTOMULTIWAVE presets" + std::wstring(b, b + std::strlen(b)) + L".txt";
      if (!fileExists(backup)) break;
    }
    const std::wstring e = writeTextFile(backup, cur);
    if (!e.empty()) { backup.clear(); return L"the backup copy could not be written: " + e; }
    return L"";
  }
  // TOP Sounds, then the factory categories (kCategories; Source Phase second in beta 0.5 / 0.6, last since beta 0.7)
  static const std::vector<std::string>& listLabels() {
    static const std::vector<std::string> labels = [] {
      std::vector<std::string> l{"TOP Sounds"};
      for (int i = 0; i < kNumCategories; i++) l.push_back(kCategories[i]);
      return l;
    }();
    return labels;
  }
  // beta 0.5: TOP Sounds = the first kNumTop presets, in their order; each category = its presets in OktoPierre's order
  // (kPresetRank; TOP Sounds included, the browser marks them ★)
  static std::vector<std::vector<int>> defaultLists() {
    const std::vector<std::string>& labels = listLabels();
    std::vector<std::vector<int>> v(labels.size());
    for (int i = 0; i < kNumTopList; i++) if (kTopList[i] >= 0 && kTopList[i] < kNumPresets) v[0].push_back(kTopList[i]);   // beta 1.0: the TOP Sounds of beta 0.7 and the presets rated above 7, the best first
    for (size_t i = 1; i < labels.size(); i++) {
      for (int k = 0; k < kNumPresets; k++) if (labels[i] == kPresets[k].cat) v[i].push_back(k);
      std::stable_sort(v[i].begin(), v[i].end(), [](int a, int b) { return kPresetRank[a] < kPresetRank[b]; });
    }
    return v;
  }
  // the category list (1..) holding preset k, or -1
  static int catOf(const State& t, int k) {
    for (size_t i = 1; i < t.lists.size(); i++) if (std::count(t.lists[i].begin(), t.lists[i].end(), k)) return (int)i;
    return -1;
  }
  // the folders do not change while the plug-in runs: asked once (it takes the system a few calls). Version 1.0.17: the Documents library
  // (documentsLibraryFolder) and the folder of 1.0 .. 1.0.16, next to the plug-in (libraryFolder)
  static const std::wstring& oldFolder() { static const std::wstring f = [] { const std::wstring e = envPath(L"WS_OLD_LIBRARY_DIR"); return e.empty() ? libraryFolder() : e; }(); return f; }
  static const std::wstring& docsFolder() { static const std::wstring f = documentsLibraryFolder(); return f; }
  static std::wstring fileIn(const std::wstring& dir) { return dir + kPathSep + L"OKTOMULTIWAVE presets.txt"; }
  // read: the Documents library's file when it exists, else the file of an older version next to the plug-in when it exists, else none (the built-in
  // presets; nothing is made: a player who only plays leaves nothing behind)
  static std::wstring readPath() {
    const std::wstring e = envPath(L"WS_PRESETS_FILE");   // tests
    if (!e.empty()) return e;
    if (!docsFolder().empty() && fileExists(fileIn(docsFolder()))) return fileIn(docsFolder());
    if (docsFolder().empty() || fileExists(fileIn(oldFolder()))) return fileIn(oldFolder());
    return fileIn(docsFolder());
  }
  // written: always the Documents library, its folders made now (the first thing the player keeps takes his sounds there, the old file stays as it was: a
  // backup); next to the plug-in only when the system gives no Documents folder or it cannot be made
  static std::wstring writePath() {
    const std::wstring e = envPath(L"WS_PRESETS_FILE");
    if (!e.empty()) return e;
    if (!docsFolder().empty() && makeFolders(docsFolder())) return fileIn(docsFolder());
    return fileIn(oldFolder());
  }
  static std::wstring oldBankPath() {
    const std::wstring e = envPath(L"WS_PRESETS_FILE");
    if (!e.empty()) return e + L".oldbank";   // tests: never the player's files
    return oldFolder() + kPathSep + L"Okto MultiWave Synth user bank.txt";
  }
  // hard: look at the file now (every edit does); otherwise at most every 500 ms
  void refreshLocked(bool hard = false) {
    const auto now = std::chrono::steady_clock::now();
    if (!hard && loaded && now - checked < std::chrono::milliseconds(500)) return;
    checked = now;
    uint64_t st = 0, sz = 0;
    const std::wstring rp = readPath();
    const bool exists = fileStamp(rp, st, sz);
    if (!exists) sz = 0;
    std::string same;
    bool sameRead = false;
    if (loaded && exists == existed && rp == readFrom && (!exists || (st == stamp && sz == size))) {
      // version 1.0.17: an edit also reads the file when its time and size look unchanged: Windows moves file times in steps of about 15 ms, so another
      // instance's change of the same size made in the same step would be missed (and written over)
      if (!hard || !exists || tooBig) return;
      same = readTextFile(rp, sameRead);
      if (!sameRead || textHash(same) == known) return;
    }
    loaded = true; existed = exists; size = sz; readFrom = rp;
    if (exists) stamp = st;
    State t;
    builtIn(t);
    bool found = sameRead, cut = false;
    std::string all = sameRead ? std::move(same) : readTextFile(rp, found, &cut);
    known = found && !cut ? textHash(all) : 0;
    if (!found) all = readTextFile(oldBankPath(), found, &cut);   // the beta 0.3 user bank, before the library file existed
    tooBig = cut;
    if (found && !cut) parse(all, t);
    if (!(found && cut) && t.fileVer < 7) seedKeyAttac(t);
    s = std::move(t);
    ver++;
  }
  // after a successful write the new content is the state, and the file stamp is taken (no reload)
  std::wstring commit(State& t) {
    if (tooBig) return L"the presets file is longer than 16 MB: it is left as it is";
    const std::wstring to = writePath();
    // version 1.0.17: the first write of a new version over the file another version wrote keeps that file next to it, once
    // ("OKTOMULTIWAVE presets (saved by 1.0.17).txt"; "(saved by an older version)" before 1.0.17)
    if (s.savedBy != kAppVersionNum && fileExists(to)) {
      std::wstring by;
      for (char ch : s.savedBy) if (std::isalnum((unsigned char)ch) || ch == '.' || ch == '-') by += (wchar_t)ch;
      std::wstring dir = to;
      pathUp(dir);
      const std::wstring bk = dir + kPathSep + L"OKTOMULTIWAVE presets (saved by " + (by.empty() ? L"an older version" : by) + L").txt";
      bool had = false;
      if (!fileExists(bk)) { const std::string cur = readTextFile(to, had); if (had) writeTextFile(bk, cur); }
    }
    t.savedBy = kAppVersionNum;
    const std::string txt = text(t);
    const std::wstring e = writeTextFile(to, txt);
    if (!e.empty()) return e;
    known = textHash(txt);
    s = std::move(t);
    uint64_t st = 0, sz = 0;
    if (fileStamp(to, st, sz)) { existed = true; stamp = st; size = sz; readFrom = to; }
    ver++;
    return L"";
  }

  static void parse(const std::string& all, State& t) {
    int part = 0;   // 0 = before any marker (a beta 0.3 user-bank file), 1 = factory presets, 2 = user bank, 3 = list order
    int orderList = -1;
    bool keepStars = false;   // version 1.0.2: the stars of a file of 1.0 or later ("LIST ORDER v5" or v6) are kept
    bool v2 = false;   // lists of this version's format ("LIST ORDER v5", beta 0.3.4; they say which presets they hold); older ones are not read
    std::vector<std::vector<int>> orders(listLabels().size());
    std::vector<char> present(listLabels().size(), 0), known(kNumPresets, 0);
    int sec = -1;
    BankPreset* cur = nullptr;
    struct Fb { std::string name, orig; bool adj = false, del = false; int stars = -1; double v[kNumParams]; } fb;
    bool inFb = false;
    auto endFb = [&] {
      if (!inFb) return;
      inFb = false;
      for (int k = 0; k < kNumPresets; k++)
        if (fb.orig == kPresets[k].name) {
          known[k] = 1;
          t.del[k] = fb.del ? 1 : 0;
          t.stars[k] = fb.stars < 0 || fb.stars == kPresetStars[k] ? -1 : (signed char)fb.stars;
          if (!fb.adj) break;   // only the adjusted ones replace the built-in presets
          t.names[k] = fb.name.empty() ? fb.orig : fb.name;
          for (int i = 0; i < kNumParams; i++) t.vals[k][i] = fb.v[i];
          t.adj[k] = 1;
          // beta 0.5: an adjustment that became the factory preset itself (same name, same values) is no longer one
          bool same = t.names[k] == kPresets[k].name;
          for (int i = 0; i < kNumParams && same; i++)
            same = kParams[i].hidden || kParams[i].perf || std::fabs(fb.v[i] - kPresets[k].v[i]) <= 2e-6 * std::max(1.0, std::fabs(kPresets[k].v[i]));
          if (same) { t.adj[k] = 0; for (int i = 0; i < kNumParams; i++) t.vals[k][i] = kPresets[k].v[i]; }
          break;
        }
    };
    for (size_t p = 0; p < all.size();) {
      size_t e = all.find('\n', p);
      if (e == std::string::npos) e = all.size();
      std::string line = all.substr(p, e - p);
      p = e + 1;
      if (!line.empty() && line.back() == '\r') line.pop_back();
      if (part == 0 && line.compare(0, 17, "Plug-in version: ") == 0) { t.savedBy = line.substr(17, 24); continue; }   // version 1.0.17 (the header)
      if (line.compare(0, 9, "######## ") == 0) {
        endFb();
        cur = nullptr; sec = -1;
        part = line.find("YOUR PRESETS IN THE FACTORY LISTS") != std::string::npos ? 4 :   // (version 1.0.17)
               line.find("FACTORY") != std::string::npos ? 1 : line.find("USER BANK") != std::string::npos ? 2 :
               line.find("LIST ORDER") != std::string::npos ? 3 : 0;
        if (part == 3) { t.fileVer = line.find("LIST ORDER v8") != std::string::npos ? 8 : line.find("LIST ORDER v7") != std::string::npos ? 7 : line.find("LIST ORDER v6") != std::string::npos ? 6 : line.find("LIST ORDER v5") != std::string::npos ? 5 : 4; v2 = t.fileVer >= 8; keepStars = t.fileVer >= 5; }   // version 1.0.2 (v6: the sorted sections and Other, after the owner's third listening: the v5 lists of 1.0 / 1.0.1 are rebuilt); version 1.0.17 (v8: the owner's new list, every section by his stars, Bass third: the v6 / v7 lists are rebuilt once)
        orderList = -1;
        continue;
      }
      if (part == 3) {   // "== List ==" then "N. built-in name   (now: ... / deleted)"
        if (line.size() > 6 && line.compare(0, 3, "== ") == 0 && line.compare(line.size() - 3, 3, " ==") == 0) {
          const std::string lab = line.substr(3, line.size() - 6);
          const auto& labels = listLabels();
          orderList = (int)(std::find(labels.begin(), labels.end(), lab) - labels.begin());
          if (orderList >= (int)labels.size()) orderList = -1;
          if (orderList >= 0) present[orderList] = 1;
        } else if (orderList >= 0) {
          const size_t dot = line.find(". ");
          if (dot == std::string::npos || dot == 0 || dot > 4) continue;
          std::string key = line.substr(dot + 2);
          const size_t note = key.find("   (");
          if (note != std::string::npos) key.resize(note);
          if (key.compare(0, 2, "+ ") == 0) {   // version 1.0.17: a preset of the player's own
            const std::string nm = key.substr(2);
            for (size_t j = 0; j < t.extra.size(); j++) if (t.extra[j].name == nm) { orders[orderList].push_back(kNumPresets + (int)j); break; }
            continue;
          }
          for (int k = 0; k < kNumPresets; k++) if (key == kPresets[k].name) { orders[orderList].push_back(k); break; }
        }
        continue;
      }
      if (part == 4) {   // version 1.0.17: the player's presets in the factory lists
        if (line.compare(0, 8, "Preset: ") == 0 && line.size() > 8) {
          cur = nullptr;
          const std::string nm = clipName(line.substr(8));
          if ((int)t.extra.size() >= kMaxExtra || std::any_of(t.extra.begin(), t.extra.end(), [&](const BankPreset& q) { return q.name == nm; })) continue;
          BankPreset np; np.name = nm;
          for (int i = 0; i < kNumParams; i++) np.v[i] = kParams[i].def;
          t.extra.push_back(np);
          cur = &t.extra.back();
        } else if (line.compare(0, 7, "Stars: ") == 0 && cur) cur->stars = std::max(0, std::min(10, std::atoi(line.c_str() + 7)));
        else if (line.compare(0, 6, "From: ") == 0 && cur) cur->from = clipName(line.substr(6));
        else if (cur) parseParamLine(line, cur->v);
        continue;
      }
      if (part == 1) {
        if (line.compare(0, 8, "Preset: ") == 0) {
          endFb();
          inFb = true; fb.name = clipName(line.substr(8)); fb.orig.clear(); fb.adj = false; fb.del = false; fb.stars = -1;
          for (int i = 0; i < kNumParams; i++) fb.v[i] = kParams[i].def;
        } else if (inFb && line.compare(0, 9, "Factory: ") == 0) fb.orig = line.substr(9);
        else if (inFb && line.compare(0, 10, "Adjusted: ") == 0) fb.adj = line.compare(10, 3, "yes") == 0;
        else if (inFb && line.compare(0, 9, "Deleted: ") == 0) fb.del = line.compare(9, 3, "yes") == 0;
        else if (inFb && line.compare(0, 7, "Stars: ") == 0) fb.stars = std::max(0, std::min(10, std::atoi(line.c_str() + 7)));
        else if (inFb) parseParamLine(line, fb.v);
        continue;
      }
      // user bank (part 2, or a beta 0.3 user-bank file)
      if (line.size() > 6 && line.compare(0, 3, "== ") == 0 && line.compare(line.size() - 3, 3, " ==") == 0) {
        const std::string lab = clipName(line.substr(3, line.size() - 6));
        sec = bankSectionOf(lab);
        if (sec < 0 && part == 2 && !lab.empty()) {   // version 1.0.17: a bank of the player's own
          const auto it = std::find(t.banks.begin(), t.banks.end(), lab);
          if (it != t.banks.end()) sec = kNumBankSections + (int)(it - t.banks.begin());
          else if ((int)t.banks.size() < kMaxCustomBanks) { t.banks.push_back(lab); sec = kNumBankSections + (int)t.banks.size() - 1; }
        }
        cur = nullptr;
      } else if (line.compare(0, 8, "Preset: ") == 0 && sec >= 0 && line.size() > 8) {
        cur = nullptr;
        if (t.user.size() >= kMaxBankSounds) { t.tooMany = true; continue; }   // its value lines are ignored too
        BankPreset np;
        np.section = sec; np.name = clipName(line.substr(8));
        for (int i = 0; i < kNumParams; i++) np.v[i] = kParams[i].def;
        t.user.push_back(np);
        cur = &t.user.back();
      } else if (line.compare(0, 7, "Stars: ") == 0 && cur) cur->stars = std::max(0, std::min(10, std::atoi(line.c_str() + 7)));
      else if (line.compare(0, 6, "From: ") == 0 && cur) cur->from = clipName(line.substr(6));
      else if (cur) parseParamLine(line, cur->v);
    }
    endFb();
    if (!keepStars) std::fill(t.stars.begin(), t.stars.end(), (signed char)-1);   // version 1.0: the stars of a file of an older version are not carried over: every sound starts with none (the user bank keeps its own)
    if (!v2) return;   // a beta 0.3 / 0.4 / 0.5 file: the default lists of this version
    // beta 0.5: each list holds what the file names, in its order (a preset in one category only: the first named);
    // a preset the file does not know, or a list it does not have, takes the default places; a known preset that no
    // category names (an edited file) goes back to its own category
    const int nl = (int)t.lists.size();
    std::vector<std::vector<int>> v(nl);
    std::vector<char> placed(kNumPresets + t.extra.size(), 0);   // (version 1.0.17: the player's presets too)
    auto put = [&](int i, int k) {
      if (std::count(v[i].begin(), v[i].end(), k)) return;
      if (i > 0) { if (placed[k]) return; placed[k] = 1; }
      v[i].push_back(k);
    };
    for (int i = 0; i < nl; i++) if (present[i]) for (int k : orders[i]) put(i, k);
    for (int i = 0; i < nl; i++) for (int k : t.lists[i]) if (!known[k] || !present[i]) put(i, k);
    for (int k = 0; k < kNumPresets; k++) if (!placed[k] && defaultCategory(k) > 0) put(defaultCategory(k), k);
    for (size_t j = 0; j < t.extra.size(); j++) if (!placed[kNumPresets + j]) put(nl - 1, kNumPresets + (int)j);   // a preset of his that no category names: in the last one (Other)
    t.lists = v;
  }

  static std::string text(const State& t) {
    std::string s;
    char b[256];
    auto L = [&s](const std::string& x) { s += x; s += "\r\n"; };
    const LocalTime tm = localNow();
    int adj = 0, del = 0, starred = 0; for (char a : t.adj) adj += a; for (char d : t.del) del += d;
    for (int k = 0; k < kNumPresets; k++) starred += starsOf(t, k) > 0;
    for (const BankPreset& p : t.user) starred += p.stars > 0;
    L("OKTOMULTIWAVE SYNTH - presets");
    L(std::string("Saved by the VST plug-in (") + kAppVersion + "): every factory preset (those you adjusted with SAVE PRESET say \"Adjusted: yes\",");
    L("with their name now; those you deleted say \"Deleted: yes\") and your user bank. Each preset: its name, then the");
    L("parameters that differ from the defaults.");
    L("Format: key: value   (name: shown value)");
    std::snprintf(b, sizeof b, "Saved: %04d-%02d-%02d %02d:%02d   Factory presets: %d (adjusted: %d, deleted: %d)   User bank: %d   Rated (stars): %d",
                  tm.wYear, tm.wMonth, tm.wDay, tm.wHour, tm.wMinute, kNumPresets, adj, del, (int)t.user.size(), starred);
    L(b);
    L("Stars: \"Stars: N\" (1-10, shown as five stars with half stars in the preset browser) after a preset's name is your rating of it.");
    L(std::string("Plug-in version: ") + kAppVersionNum);   // version 1.0.17: the next version keeps a copy of this file before it writes over it
    L("");
    L("######## FACTORY PRESETS ########");
    const char* lastCat = nullptr;
    for (int k = 0; k < kNumPresets; k++) {
      const char* cat = k < kNumTop ? "TOP Sounds" : kPresets[k].cat;   // the factory order (its lists below)
      if (!lastCat || std::strcmp(cat, lastCat) != 0) { L(""); L(std::string("== ") + cat + " =="); lastCat = cat; }
      L("");
      L("Preset: " + t.names[k]);
      L(std::string("Factory: ") + kPresets[k].name);
      L(t.adj[k] ? "Adjusted: yes" : "Adjusted: no");
      if (t.del[k]) L("Deleted: yes");
      if (starsOf(t, k) > 0 || t.stars[k] == 0) L("Stars: " + std::to_string(starsOf(t, k)));   // a rating, or the built-in vote the player cleared
      paramLines(t.vals[k].data(), s);
    }
    L("");
    L("######## YOUR PRESETS IN THE FACTORY LISTS ########");   // version 1.0.17 (NEW in the factory tab; the lists below name them "+ name")
    for (const BankPreset& p : t.extra) {
      L("");
      L("Preset: " + p.name);
      if (!p.from.empty()) L("From: " + p.from);
      if (p.stars > 0) L("Stars: " + std::to_string(p.stars));
      paramLines(p.v, s);
    }
    if (t.extra.empty()) L("(none)");
    L("");
    L("######## LIST ORDER v8 (the preset browser: what each list holds, in its order; built-in names) ########");
    for (size_t i = 0; i < t.lists.size(); i++) {
      L("");
      L("== " + listLabels()[i] + " ==");
      int n = 0;
      for (int k : t.lists[i]) {
        if (const BankPreset* x = extraOf(t, k)) { L(std::to_string(++n) + ". + " + x->name); continue; }
        if (k < 0 || k >= kNumPresets) continue;
        std::string line = std::to_string(++n) + ". " + kPresets[k].name;
        if (t.names[k] != kPresets[k].name) line += "   (now: " + t.names[k] + ")";
        if (t.del[k]) line += "   (deleted)";
        L(line);
      }
    }
    L("");
    L("######## USER BANK ########");
    const std::vector<std::string> banks = namesOf(t);   // (version 1.0.17: the player's own banks after the built-in sections, empty ones too)
    for (int sec = 0; sec < (int)banks.size(); sec++) {
      L("");
      L("== " + banks[sec] + " ==");
      bool any = false;
      for (const BankPreset& p : t.user) {
        if (p.section != sec) continue;
        any = true;
        L("");
        L("Preset: " + p.name);
        if (!p.from.empty()) L("From: " + p.from);
        if (p.stars > 0) L("Stars: " + std::to_string(p.stars));
        paramLines(p.v, s);
      }
      if (!any) L("(empty)");
    }
    return s;
  }
};

}  // namespace ws
