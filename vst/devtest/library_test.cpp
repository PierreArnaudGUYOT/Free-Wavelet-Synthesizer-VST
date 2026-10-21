// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Developer check of the PRESET LIBRARY (vst/src/bank.h) without any window: the presets file, the adjusted / deleted factory
// presets, the user bank, the lists, EXPORT / IMPORT with its backup, the file read again after another instance changed it
// (the readers look every 500 ms, the edits always look first), and the guard against writing over a file read cut (16 MB).
// The presets file goes to <outdir>\lib (WS_PRESETS_FILE): never the player's own file.
//   x86_64-w64-mingw32-clang++ -std=c++17 -O2 -static -municode -DUNICODE -D_UNICODE -DNOMINMAX -I vst/src
//     vst/devtest/library_test.cpp -o library_test.exe -lshell32 -lole32
//   library_test.exe <outdir>
#include <windows.h>
#include <chrono>
#include <cstdio>
#include <string>
#include <thread>
#include "bank.h"
using namespace ws;

static int gFails = 0;
static void check(bool ok, const char* what, const std::string& detail = {}) {
  std::printf("  [%s] %s%s%s\n", ok ? "PASS" : "FAIL", what, detail.empty() ? "" : "  -- ", detail.c_str());
  if (!ok) gFails++;
  std::fflush(stdout);
}
static std::string u8(const std::wstring& w) {
  const int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string s(n, '\0'); WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, nullptr, nullptr); return s;
}
static std::string readAll(const std::wstring& p) { bool f = false; return readTextFile(p, f); }
static bool has(const std::string& s, const std::string& x) { return s.find(x) != std::string::npos; }
static void sleepMs(int ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }
static int countOf(const std::string& s, const std::string& x) { int n = 0; for (size_t p = s.find(x); p != std::string::npos; p = s.find(x, p + 1)) n++; return n; }

int wmain(int argc, wchar_t** argv) {
  if (argc < 2) { std::printf("usage: library_test.exe <outdir>\n"); return 2; }
  const std::wstring out = argv[1], dir = out + L"\\lib", file = dir + L"\\OKTOMULTIWAVE presets.txt", exported = out + L"\\exported presets.txt";
  CreateDirectoryW(out.c_str(), nullptr); CreateDirectoryW(dir.c_str(), nullptr);
  DeleteFileW(file.c_str()); DeleteFileW(exported.c_str());
  SetEnvironmentVariableW(L"WS_PRESETS_FILE", file.c_str());
  Library& lib = Library::get();

  std::printf("1. no file: the built-in presets\n");
  // two new presets that are not in TOP Sounds by default and have no built-in vote (beta 0.3.1: the owner's favourites are in TOP Sounds, the rated ones carry stars)
  auto plain = [](int from) { for (int k = from; k < kNumPresets; k++) { bool x = false; for (int i = 0; i < kNumTopExtra; i++) x = x || kTopExtra[i] == k; if (!x && kPresetStars[k] == 0) return k; } return kNumPresets - 1; };
  const int kA = plain(kFirstNew + 4), kB = plain(kA + 5);
  check(lib.name(kA) == kPresets[kA].name && !lib.adjusted(kA) && !lib.deleted(kA) && (int)lib.bank().size() == kNumKeyAttac, "names are the built-in ones, nothing adjusted or deleted (the user bank holds the KeyAttac favourites)");
  {
    const auto lists = lib.lists();
    size_t total = 0; for (size_t i = 1; i < lists.size(); i++) total += lists[i].second.size();
    check(lists.size() == 1 + kNumCategories && (int)lists[0].second.size() == kNumTopList && (int)total == kNumPresets,
          "TOP Sounds + the categories hold every preset", std::to_string(lists.size()) + " lists, " + std::to_string(total) + " in the categories");
    bool allIn = true;
    for (int i = 0; i < kNumTopExtra; i++) allIn = allIn && std::count(lists[0].second.begin(), lists[0].second.end(), kTopExtra[i]) == 1;
    check(allIn && kNumTopExtra > 0, "the presets rated above 7 are in TOP Sounds by default", std::to_string(kNumTopExtra) + " of them");
  }

  std::printf("2. SAVE PRESET: a factory preset adjusted and renamed\n");
  double v[kNumParams]; lib.values(kA, v);
  v[P_F_CUTOFF] = 6.2; v[P_AMP_R] = 0.77;
  std::wstring e = lib.adjust(kA, "My adjusted sound", v);
  check(e.empty(), "adjust() writes the file", u8(e));
  std::string txt = readAll(file);
  check(has(txt, "Preset: My adjusted sound") && has(txt, std::string("Factory: ") + kPresets[kA].name) && has(txt, "Adjusted: yes") && has(txt, "  f_cutoff: 6.2   (") &&
        has(txt, "  amp_r: 0.77   ("), "the file shows the preset, its built-in name, 'Adjusted: yes' and the changed parameters");
  double w[kNumParams]; lib.values(kA, w);
  check(lib.name(kA) == "My adjusted sound" && lib.adjusted(kA) && std::fabs(w[P_F_CUTOFF] - 6.2) < 1e-9 && lib.find("My adjusted sound") == kA && lib.find(kPresets[kA].name) == kA,
        "the library gives the adjusted name and values; both names find the preset");
  check(!has(txt, "chord_") && !has(txt, "bend") && !has(txt, "modwheel"), "the chord keyboard's settings and the wheels are not in the file");
  e = lib.restore(kA);
  check(e.empty() && lib.name(kA) == kPresets[kA].name && !lib.adjusted(kA), "RESTORE brings the built-in preset back", u8(e));

  std::printf("3. DELETE and back; the user bank\n");
  e = lib.setDeleted(kB, true);
  check(e.empty() && lib.deleted(kB) && has(readAll(file), "Deleted: yes"), "a deleted preset is marked in the file", u8(e));
  lib.setDeleted(kB, false);
  check(!lib.deleted(kB), "and shown again");
  BankPreset bp; bp.section = bankSectionOf("Pad"); bp.name = "Bank pad"; bp.from = kPresets[kA].name;
  lib.values(kB, bp.v);
  e = lib.putUser(bp);
  check(e.empty() && (int)lib.bank().size() == kNumKeyAttac + 1 && lib.bank().back().name == "Bank pad" && has(readAll(file), "######## USER BANK"), "putUser() adds a sound to the user bank", u8(e));
  e = lib.removeUser(bp.section, "Bank pad");
  check(e.empty() && (int)lib.bank().size() == kNumKeyAttac, "removeUser() deletes it", u8(e));

  std::printf("4. the lists: a preset to TOP Sounds, another moved to a category\n");
  e = lib.setTop(kA, true);
  check(e.empty() && lib.inTop(kA) && (int)lib.lists()[0].second.size() == kNumTopList + 1, "setTop adds a preset to TOP Sounds", u8(e));
  lib.setTop(kA, false);
  const int cat0 = lib.categoryOf(kB), target = cat0 == 1 ? 2 : 1;
  e = lib.moveToCategory(kB, target);
  check(e.empty() && lib.categoryOf(kB) == target, "moveToCategory moves a preset to another category", u8(e));
  lib.moveToCategory(kB, cat0);
  check(lib.categoryOf(kB) == cat0, "and back to its own");

  std::printf("5. another instance changes the file: the readers look every 500 ms, the edits always look first\n");
  {
    e = lib.adjust(kA, "Instance one", v);
    check(e.empty(), "preset adjusted as 'Instance one'", u8(e));
    // another instance renames it: the file is changed behind the library's back
    std::string other = readAll(file);
    size_t pos = other.find("Preset: Instance one");
    check(pos != std::string::npos, "the file names it");
    other.replace(pos, std::string("Preset: Instance one").size(), "Preset: Instance two");
    writeTextFile(file, other);
    // an edit looks at the file first: the change of the other instance is not lost
    e = lib.setDeleted(kB, true);
    const std::string after = readAll(file);
    check(e.empty() && has(after, "Preset: Instance two") && has(after, "Deleted: yes"), "an edit made at once keeps the other instance's change", u8(e));
    lib.setDeleted(kB, false);
    // another external change, then a reader after 650 ms
    std::string again = readAll(file);
    pos = again.find("Preset: Instance two");
    again.replace(pos, std::string("Preset: Instance two").size(), "Preset: Instance three");
    writeTextFile(file, again);
    sleepMs(650);
    check(lib.name(kA) == "Instance three", "a reader sees an external change after 500 ms", lib.name(kA));
    lib.restore(kA);
  }

  std::printf("6. EXPORT, and IMPORT with its backup copy\n");
  e = lib.adjust(kA, "Before export", v);
  e = lib.exportTo(exported);
  check(e.empty() && has(readAll(exported), "Preset: Before export"), "EXPORT writes a copy of the presets file", u8(e));
  lib.restore(kA);
  std::wstring backup;
  e = lib.importFrom(exported, backup);
  check(e.empty() && lib.name(kA) == "Before export" && !backup.empty() && fileExists(backup), "IMPORT replaces the library and keeps the old file as a backup", u8(e) + " " + u8(backup));
  writeTextFile(out + L"\\not a presets file.txt", "hello\r\nworld\r\n");
  e = lib.importFrom(out + L"\\not a presets file.txt", backup);
  check(!e.empty() && lib.name(kA) == "Before export", "a file without a Preset: line is refused, the library is unchanged", u8(e));
  lib.restore(kA);

  std::printf("7. a presets file longer than 16 MB is never written over\n");
  {
    std::string big = readAll(file);
    big += "\r\n######## USER BANK ########\r\n== Chords ==\r\n";
    const std::string filler(1 << 20, 'x');
    while (big.size() < (17u << 20)) big += "# " + filler + "\r\n";
    writeTextFile(file, big);
    lib.refresh();
    e = lib.adjust(kA, "Must not be written", v);
    check(!e.empty() && has(u8(e), "16 MB"), "an edit is refused with a clear message", u8(e));
    check(readAll(file).size() >= (16u << 20) && lib.name(kA) == kPresets[kA].name, "the file is as it was, the library keeps the built-in presets");
    DeleteFileW(file.c_str());
    lib.refresh();
    e = lib.adjust(kA, "Now it works", v);
    check(e.empty() && lib.name(kA) == "Now it works", "after the big file is gone an edit works again", u8(e));
    lib.restore(kA);
  }

  std::printf("8. a presets file of beta 0.1 (no SuperModulation list, none of the new presets in it) is read with them in their default places\n");
  {
    // the file the library writes now, with the presets of beta 0.2 and 0.3 (numbers 201-1100) and the SuperModulation list taken out of the LIST ORDER
    e = lib.adjust(kA, "Old file adjusted", v);
    std::string t = readAll(file), o;
    const size_t lo = t.find("######## LIST ORDER");
    const size_t ub = t.find("######## USER BANK", lo);
    std::string lists = t.substr(lo, ub == std::string::npos ? std::string::npos : ub - lo), kept;
    bool skipSection = false; size_t pos = 0;
    while (pos < lists.size()) {
      size_t nl = lists.find("\r\n", pos); if (nl == std::string::npos) nl = lists.size();
      const std::string line = lists.substr(pos, nl - pos); pos = nl + 2;
      if (line.rfind("== ", 0) == 0) skipSection = line.find("SuperModulation") != std::string::npos;
      const size_t dot = line.find(". ");
      const bool entry = dot != std::string::npos && dot < 4 && std::isdigit((unsigned char)line[0]);
      // the number of the preset (3 or 4 digits: beta 0.3's are 501-1100) is the text after "N. " up to the next space
      const bool isNew = entry && line.size() > dot + 5 && std::isdigit((unsigned char)line[dot + 2]) && std::atoi(line.c_str() + dot + 2) >= 201;
      if (skipSection || isNew) continue;
      kept += line + "\r\n";
    }
    o = t.substr(0, lo) + kept + (ub == std::string::npos ? "" : "\r\n" + t.substr(ub));
    writeTextFile(file, o);
    sleepMs(30);
    lib.refresh();
    const auto ls = lib.lists();
    size_t total = 0; std::vector<int> seen(kNumPresets, 0); bool dup = false;
    for (size_t i = 1; i < ls.size(); i++) { total += ls[i].second.size(); for (int k : ls[i].second) { if (seen[k]++) dup = true; } }
    int superIdx = -1; for (size_t i = 1; i < ls.size(); i++) if (ls[i].first == "SuperModulation") superIdx = (int)i;
    int nSuper = 0; for (int k = 0; k < kNumPresets; k++) if (std::string(kPresets[k].cat) == "SuperModulation") nSuper++;
    check(ls.size() == 1 + kNumCategories && (int)total == kNumPresets && !dup, "every preset is in exactly one category list", std::to_string(total) + " of " + std::to_string(kNumPresets));
    check(superIdx > 0 && (int)ls[superIdx].second.size() == nSuper, "the SuperModulation list holds its presets", std::to_string(superIdx > 0 ? ls[superIdx].second.size() : 0) + " of " + std::to_string(nSuper));
    check(lib.name(kA) == "Old file adjusted" && lib.adjusted(kA), "an adjusted preset of the old file stays adjusted");
    lib.restore(kA);
  }

  std::printf("8b. the lists of a file of 1.0 (\"LIST ORDER v5\") are not read (the default lists: sorted, Other) and its stars are kept; a file of beta 0.3.3 (v4) loses its stars too\n");
  {
    e = lib.setTop(kA, true);   // a list the player changed ...
    check(e.empty() && lib.inTop(kA), "a player's TOP Sounds addition is written", u8(e));
    lib.setStars(kA, 7);   // ... and a rating
    check(lib.stars(kA) == 7, "the rating is kept in the file");
    std::string t = readAll(file);
    const size_t lo = t.find("######## LIST ORDER v7");
    check(lo != std::string::npos, "the file says LIST ORDER v7");
    if (lo != std::string::npos) {
      std::string t5 = t; t5.replace(lo, 22, "######## LIST ORDER v5");   // ... and the same file as 1.0 wrote it
      writeTextFile(file, t5);
      sleepMs(30);
      lib.refresh();
      check(!lib.inTop(kA) && (int)lib.lists()[0].second.size() == kNumTopList, "the v5 lists are rebuilt: the default TOP Sounds and sections", std::to_string(lib.lists()[0].second.size()));
      check(lib.stars(kA) == 7, "the stars of a file of 1.0 are kept", std::to_string(lib.stars(kA)));
      std::string t4 = t; t4.replace(lo, 22, "######## LIST ORDER v4");   // ... and as beta 0.3.3 wrote it
      writeTextFile(file, t4);
      sleepMs(30);
      lib.refresh();
      check(lib.stars(kA) == 0, "the stars of a file older than 1.0 are not carried over: every sound starts with none", std::to_string(lib.stars(kA)));
    }
    lib.setTop(kA, false);
  }

  std::printf("9. stars (beta 0.3.1): the built-in votes, the player's ratings, the file, EXPORT / IMPORT, the user bank\n");
  {
    int kv = -1; for (int k = kFirstNew; k < kNumPresets; k++) if (kPresetStars[k] > 0 && kPresetStars[k] < 10) { kv = k; break; }
    const int kn = plain(kFirstNew);
    check(kv < 0 || lib.stars(kv) == kPresetStars[kv], "a preset with a built-in vote shows it (none in version 1.0)", std::to_string(kv >= 0 ? lib.stars(kv) : -1));
    check(lib.stars(kn) == 0, "an unrated preset has no stars (version 1.0: no sound has a built-in vote)");
    // (the built-in votes of the rated presets are in the file too: the lines are counted)
    lib.setStars(kn, 1);   // writes the file
    const int c7 = countOf(readAll(file), "Stars: 7\r\n");
    e = lib.setStars(kn, 7);
    check(e.empty() && lib.stars(kn) == 7 && countOf(readAll(file), "Stars: 7\r\n") == c7 + 1, "setStars writes 'Stars: 7' in the file", u8(e));
    lib.setStars(kn, 0);
    check(lib.stars(kn) == 0 && countOf(readAll(file), "Stars: 7\r\n") == c7, "clearing a rating removes its line");
    if (kv >= 0) {   // (version 1.0 has no built-in vote: these three checks need one)
      const int def = kPresetStars[kv], other = def == 6 ? 7 : 6;
      const int cOther = countOf(readAll(file), "Stars: " + std::to_string(other) + "\r\n");
      lib.setStars(kv, other);
      check(lib.stars(kv) == other && countOf(readAll(file), "Stars: " + std::to_string(other) + "\r\n") == cOther + 1, "a rating replaces the built-in vote");
      lib.setStars(kv, 0);
      check(lib.stars(kv) == 0 && has(readAll(file), "Stars: 0\r\n"), "a built-in vote the player cleared is written as 'Stars: 0'");
      lib.setStars(kv, def);
      check(lib.stars(kv) == def, "the built-in vote again");
    } else std::printf("  (no built-in vote in this version: the checks on a built-in vote are skipped)\n");
    lib.setStars(kn, 9);
    e = lib.exportTo(exported);
    const std::string ex = readAll(exported);
    check(e.empty() && has(ex, "Stars: 9\r\n") && has(ex, "Rated (stars):"), "EXPORT carries the stars", u8(e));
    lib.setStars(kn, 2);
    std::wstring backup;
    e = lib.importFrom(exported, backup);
    check(e.empty() && lib.stars(kn) == 9, "IMPORT reads the stars back", u8(e));
    lib.setStars(kn, 0);
    BankPreset up; up.section = bankSectionOf("Lead"); up.name = "Starred lead"; lib.values(kn, up.v);
    lib.putUser(up);
    e = lib.setUserStars(up.section, "Starred lead", 6);
    check(e.empty() && !lib.bank().empty() && lib.bank().back().stars == 6 && has(readAll(file), "Stars: 6\r\n"), "a sound of the user bank can be rated", u8(e));
    BankPreset again = up; again.stars = 0;
    lib.putUser(again);
    check(lib.bank().back().stars == 6, "saving a bank sound again keeps its stars");
    lib.removeUser(up.section, "Starred lead");
  }

  std::printf("10. version 1.0.3: the KeyAttac folder of the user bank (the starred favourites, retouched to be percussive)\n");
  {
    const int sec = bankSectionOf("KeyAttac");
    auto inFolder = [&] { int n = 0; for (const BankPreset& p : lib.bank()) n += p.section == sec; return n; };
    check(sec >= 0 && kNumKeyAttac > 0 && inFolder() == kNumKeyAttac, "the user bank holds the KeyAttac favourites", std::to_string(inFolder()) + " of " + std::to_string(kNumKeyAttac));
    bool fast = true, from = true; double slowest = 0;
    for (const BankPreset& p : lib.bank()) if (p.section == sec) { slowest = std::max(slowest, p.v[P_AMP_A]); fast = fast && p.v[P_AMP_A] <= 0.0011; from = from && !p.from.empty(); }
    check(fast && from, "their attack is at its minimum and each one says which factory preset it comes from", std::to_string(slowest));
    std::string first; for (const BankPreset& p : lib.bank()) if (p.section == sec) { first = p.name; break; }
    e = lib.removeUser(sec, first);
    lib.refresh();
    bool gone = true; for (const BankPreset& p : lib.bank()) if (p.section == sec && p.name == first) gone = false;
    check(e.empty() && gone && inFolder() == kNumKeyAttac - 1, "a favourite the player deletes stays deleted (the file says LIST ORDER v7)", u8(e));
    check(has(readAll(file), "== KeyAttac =="), "the file has the KeyAttac folder");
  }

  std::printf(gFails ? "\n%d FAILED\n" : "\nALL PASS\n", gFails);
  return gFails ? 1 : 0;
}
