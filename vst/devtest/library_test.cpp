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
  if (argc < 2) { std::printf("usage: library_test.exe <outdir>   |   library_test.exe --folders <outdir>   |   library_test.exe --load <a COPY of a presets file>\n"); return 2; }
  if (argc >= 3 && std::wstring(argv[1]) == L"--folders") {   // version 1.0.17: where the file is read and written (the Documents library; an older version's file next to the plug-in)
    const std::wstring root = argv[2], docs = root + L"\\Documents\\OktoPierre\\Okto Fractal Wavelet", old = root + L"\\VST";
    const std::wstring docsFile = docs + L"\\OKTOMULTIWAVE presets.txt", oldFile = old + L"\\OKTOMULTIWAVE presets.txt";
    CreateDirectoryW(root.c_str(), nullptr); CreateDirectoryW(old.c_str(), nullptr);
    WIN32_FIND_DATAW fd; HANDLE fh = FindFirstFileW((docs + L"\\*").c_str(), &fd);   // a clean start: no Documents library
    if (fh != INVALID_HANDLE_VALUE) { do { DeleteFileW((docs + L"\\" + fd.cFileName).c_str()); } while (FindNextFileW(fh, &fd)); FindClose(fh); }
    RemoveDirectoryW(docs.c_str()); RemoveDirectoryW((root + L"\\Documents\\OktoPierre").c_str()); RemoveDirectoryW((root + L"\\Documents").c_str());
    SetEnvironmentVariableW(L"WS_LIBRARY_DIR", docs.c_str()); SetEnvironmentVariableW(L"WS_OLD_LIBRARY_DIR", old.c_str());
    const std::string oldText = "OKTOMULTIWAVE SYNTH - presets\r\n\r\n######## USER BANK ########\r\n\r\n== Pad ==\r\n\r\nPreset: Old pad\r\n  f_cutoff: 5\r\n";
    writeTextFile(oldFile, oldText);
    Library& lib = Library::get();
    bool oldPad = false; for (const BankPreset& q : lib.bank()) oldPad = oldPad || q.name == "Old pad";
    check(oldPad && lib.path() == oldFile, "the file of an older version next to the plug-in is read where it is", u8(lib.path()));
    check(!fileExists(root + L"\\Documents"), "nothing is made in Documents while the player only plays");
    std::wstring e = lib.setStars(0, 6);
    check(e.empty() && fileExists(docsFile), "the first thing he keeps makes the Documents library and is written there", u8(e));
    check(readAll(oldFile) == oldText, "the file next to the plug-in stays as it was (a backup)");
    oldPad = false; for (const BankPreset& q : lib.bank()) oldPad = oldPad || q.name == "Old pad";
    check(lib.path() == docsFile && oldPad && lib.stars(0) == 6, "from then on the Documents file is read: his sounds are in it", u8(lib.path()));
    std::string d = readAll(docsFile);
    const size_t at = d.find(std::string("Plug-in version: ") + kAppVersionNum);
    check(at != std::string::npos, "the file says which version wrote it");
    if (at != std::string::npos) d.replace(at, 17 + std::strlen(kAppVersionNum), "Plug-in version: 0.9.9");
    sleepMs(20);
    writeTextFile(docsFile, d);
    lib.refresh();
    e = lib.setStars(0, 7);
    check(e.empty() && fileExists(docs + L"\\OKTOMULTIWAVE presets (saved by 0.9.9).txt"), "a new version keeps a copy of the file another version wrote before it writes over it", u8(e));
    std::printf(gFails ? "\n%d FAILED\n" : "\nALL PASS\n", gFails);
    return gFails ? 1 : 0;
  }
  if (argc >= 3 && std::wstring(argv[1]) == L"--load") {   // version 1.0.17: a presets file read as the plug-in reads it (a copy: it may be written back): each bank, its sounds, their source waves
    SetEnvironmentVariableW(L"WS_PRESETS_FILE", argv[2]);
    Library& lib = Library::get();
    const auto names = lib.bankNames();
    const auto user = lib.bank();
    for (size_t sec = 0; sec < names.size(); sec++) {
      int n = 0, wmax = 0, newW = 0;
      for (const auto& p : user) if (p.section == (int)sec) { n++; const int w = (int)p.v[P_A_WAVE]; wmax = std::max(wmax, w); newW += w >= 6 || (p.v[P_A2_LVL] > 0.01 && p.v[P_A2_WAVE] >= 6); }
      if (n) std::printf("  %-20s %4d sounds, %d with a new wave (A1 wave up to %d)\n", names[sec].c_str(), n, newW, wmax);
    }
    std::printf("%d banks, %d user sounds\n", (int)names.size(), (int)user.size());
    const auto lists = lib.lists();   // the browser's lists: each one's size, the first sounds of TOP Sounds with their stars
    for (const auto& L : lists) std::printf("  list %-18s %4d\n", L.first.c_str(), (int)L.second.size());
    const auto& top = lists[0].second;
    for (size_t i = 0; i < top.size() && i < 16; i++) std::printf("    %2d. [%2d] %s\n", (int)i + 1, lib.stars(top[i]), lib.name(top[i]).c_str());
    return 0;
  }
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
    sleepMs(20);   // (a reader compares the file's time and size: Windows moves file times in steps of about 15 ms; an edit also compares the text)
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
    const size_t lo = t.find("######## LIST ORDER v8");   // (version 1.0.17: v8, the owner's new list)
    check(lo != std::string::npos, "the file says LIST ORDER v8");
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
    check(e.empty() && gone && inFolder() == kNumKeyAttac - 1, "a favourite the player deletes stays deleted (the file says LIST ORDER v8)", u8(e));
    check(has(readAll(file), "== KeyAttac =="), "the file has the KeyAttac folder");
  }

  std::printf("11. version 1.0.17: banks of the player's own (NEW BANK), and a preset as text (COPY / PASTE)\n");
  {
    const int nb = (int)lib.bankNames().size();
    e = lib.addBank("My Live Set");
    check(e.empty() && (int)lib.bankNames().size() == nb + 1 && lib.bankNames().back() == "My Live Set" && has(readAll(file), "== My Live Set =="),
          "addBank() makes a bank, written in the file even while empty", u8(e));
    check(!lib.addBank("My Live Set").empty() && !lib.addBank("Bass").empty(), "a bank name already taken is refused (a built-in one too)");
    const int sec = nb;
    BankPreset p; p.section = sec; p.name = "Live lead"; for (int i = 0; i < kNumParams; i++) p.v[i] = kParams[i].def; p.v[P_F_CUTOFF] = 4.5;
    e = lib.putUser(p);
    check(e.empty() && lib.bank().back().section == sec && has(readAll(file), "== My Live Set ==\r\n\r\nPreset: Live lead"), "a sound goes into it", u8(e));
    {   // read back from the file only: the bank and its sound are there
      const std::string txt = readAll(file);
      writeTextFile(file, txt + "\r\n");
      sleepMs(600);
      lib.refresh();
      bool found = false; for (const BankPreset& q : lib.bank()) found = found || (q.section == sec && q.name == "Live lead" && std::fabs(q.v[P_F_CUTOFF] - 4.5) < 1e-9);
      check(found && lib.bankNames().back() == "My Live Set", "the file read again keeps the bank and its sound");
    }
    e = lib.renameBank(sec, "Stage");
    check(e.empty() && lib.bankNames().back() == "Stage" && has(readAll(file), "== Stage ==") && !has(readAll(file), "== My Live Set =="), "renameBank() renames it, its sound stays", u8(e));
    check(!lib.renameBank(0, "Basses").empty() && !lib.removeBank(0).empty(), "a built-in bank cannot be renamed or deleted");
    e = lib.removeBank(sec);
    bool left = false; for (const BankPreset& q : lib.bank()) left = left || q.name == "Live lead";
    check(e.empty() && (int)lib.bankNames().size() == nb && !left && !has(readAll(file), "== Stage =="), "removeBank() deletes it with its sounds", u8(e));
    // a preset as text, and back
    const std::string t = Library::presetText("Copied pad", "A · Warm Pad", p.v);
    BankPreset q;
    const bool ok = Library::parsePreset("some words before\r\n" + t + "Preset: a second one\r\n  f_cutoff: 9\r\n", q);
    check(ok && q.name == "Copied pad" && q.from == "A · Warm Pad" && std::fabs(q.v[P_F_CUTOFF] - 4.5) < 1e-9 && std::fabs(q.v[P_AMP_A] - kParams[P_AMP_A].def) < 1e-12,
          "a preset copied as text is read back the same (the first block only)", t.substr(0, 120));
    check(!Library::parsePreset("hello\nno preset here", q), "a text without a Preset: line is not a preset");
  }

  std::printf("12. version 1.0.17: NEW in a factory list (a preset of the player's own right after the selected one), NEW in a bank (right after the sound)\n");
  {
    const auto ls = lib.lists();
    int cat = -1, after = -1, next = -1;
    for (size_t i = 1; i < ls.size() && cat < 0; i++) if (ls[i].second.size() >= 2) { cat = (int)i; after = ls[i].second[0]; next = ls[i].second[1]; }
    BankPreset p; p.name = "My new lead"; p.from = lib.name(after); for (int i = 0; i < kNumParams; i++) p.v[i] = kParams[i].def; p.v[P_F_CUTOFF] = 3.25;
    int entry = -1;
    e = lib.addExtra(p, cat, after, entry);
    auto pos = [&](int list, int k) { const auto L = lib.lists()[list].second; return (int)(std::find(L.begin(), L.end(), k) - L.begin()); };
    check(e.empty() && entry == kNumPresets && lib.name(entry) == "My new lead" && pos(cat, entry) == 1 && pos(cat, next) == 2 && lib.categoryOf(entry) == cat,
          "addExtra() puts the new preset right after the selected one, in its category", u8(e));
    const std::string txt = readAll(file);
    check(has(txt, "######## YOUR PRESETS IN THE FACTORY LISTS ########\r\n\r\nPreset: My new lead") && has(txt, "2. + My new lead\r\n"), "the file keeps it, and its place in the list");
    {   // read back from the file only
      writeTextFile(file, txt + "\r\n");
      sleepMs(600);
      lib.refresh();
      double w[kNumParams]; lib.values(entry, w);
      check(lib.name(entry) == "My new lead" && pos(cat, entry) == 1 && std::fabs(w[P_F_CUTOFF] - 3.25) < 1e-9, "the file read again keeps it, with its sound, at its place");
    }
    check(!lib.addExtra(p, cat, after, entry).empty(), "a second preset of the player's own with the same name is refused");
    e = lib.putExtra(kNumPresets, "My lead", nullptr);
    check(e.empty() && lib.name(kNumPresets) == "My lead" && lib.findExtra("My lead") == kNumPresets, "putExtra() renames it", u8(e));
    e = lib.setStars(kNumPresets, 8);
    check(e.empty() && lib.stars(kNumPresets) == 8, "it can be rated", u8(e));
    e = lib.removeExtra(kNumPresets);
    check(e.empty() && lib.extraCount() == 0 && pos(cat, next) == 1 && !has(readAll(file), "+ My lead"), "removeExtra() deletes it, the list closes up", u8(e));
    // a bank sound right after another one
    BankPreset a; a.section = 1; a.name = "First"; for (int i = 0; i < kNumParams; i++) a.v[i] = kParams[i].def;
    BankPreset b = a; b.name = "Second"; BankPreset c = a; c.name = "In between";
    lib.putUser(a); lib.putUser(b);
    e = lib.putUser(c, "", "First");
    std::vector<std::string> order; for (const BankPreset& x : lib.bank()) if (x.section == 1) order.push_back(x.name);
    const size_t f = std::find(order.begin(), order.end(), "First") - order.begin();
    check(e.empty() && f + 2 < order.size() + 1 && f + 1 < order.size() && order[f + 1] == "In between" && f + 2 < order.size() && order[f + 2] == "Second",
          "putUser(..., after) puts a new bank sound right after the selected one", u8(e));
  }

  std::printf("13. version 1.0.17: EXPORT of one bank (a user bank, a factory list, the favourites), IMPORT of the banks chosen (ADD, MERGE): nothing is replaced\n");
  {
    auto secOf = [&](const std::string& n) { const auto nm = lib.bankNames(); return (int)(std::find(nm.begin(), nm.end(), n) - nm.begin()); };
    auto inSec = [&](int sec) { std::vector<BankPreset> v; for (const BankPreset& q : lib.bank()) if (q.section == sec) v.push_back(q); return v; };
    e = lib.addBank("Export me");
    const int sec = secOf("Export me");
    BankPreset a; a.section = sec; a.name = "Bank sound A"; a.stars = 8; for (int i = 0; i < kNumParams; i++) a.v[i] = kParams[i].def; a.v[P_F_CUTOFF] = 3.5;
    BankPreset b = a; b.name = "Bank sound B"; b.stars = 3; b.v[P_F_CUTOFF] = 4.4;
    lib.putUser(a); lib.putUser(b);
    const std::wstring fUser = out + L"\\bank user.txt", fList = out + L"\\bank list.txt", fFav = out + L"\\bank fav.txt", fAll = out + L"\\bank all.txt";
    int n = 0;
    e = lib.exportBank(fUser, Library::kExportUserBank, sec, 0, n);
    const std::string tu = readAll(fUser);
    check(e.empty() && n == 2 && has(tu, "== Export me ==") && has(tu, "Preset: Bank sound A") && has(tu, "Stars: 8") && !has(tu, "######## FACTORY"),
          "EXPORT of a bank writes only its sounds, with their stars", u8(e));
    const auto ls = lib.lists();
    int expect = 0; for (int k : ls[1].second) expect += k >= kNumPresets || !lib.deleted(k);
    e = lib.exportBank(fList, Library::kExportFactoryList, 1, 0, n);
    check(e.empty() && n == expect && has(readAll(fList), "== " + ls[1].first + " ==") && has(readAll(fList), "From: "), "EXPORT of a factory list writes its presets as they are",
          u8(e) + " " + std::to_string(n) + " of " + std::to_string(expect));
    const int kC = plain(kB + 5);
    lib.setStars(kB, 9);
    e = lib.exportBank(fFav, Library::kExportFavourites, 0, 8, n);
    const std::string tf = readAll(fFav);
    check(e.empty() && has(tf, "Preset: " + lib.name(kB)) && has(tf, "Preset: Bank sound A") && !has(tf, "Bank sound B") && has(tf, "== Favourites =="),
          "EXPORT of the favourites: every sound rated 8 or more, factory presets and user bank", u8(e));
    std::vector<Library::ImportItem> items; std::string by;
    e = lib.importScan(fUser, items, by);
    check(e.empty() && items.size() == 1 && items[0].kind == 0 && items[0].name == "Export me" && items[0].count == 2 && by == kAppVersionNum,
          "importScan of a bank file: the one bank, its sounds, the version that wrote it", u8(e) + " " + by);
    std::wstring bk; std::string sum;
    e = lib.importSome(fUser, {1}, Library::kImportAdd, bk, sum);
    const int sec2 = secOf("Export me (imported)");
    check(e.empty() && sec2 < (int)lib.bankNames().size() && inSec(sec2).size() == 2 && inSec(sec).size() == 2,
          "ADD: his bank of that name stays as it was, the file's comes in as \"Export me (imported)\"", u8(e) + " " + sum);
    check(!bk.empty() && fileExists(bk), "IMPORT keeps a backup copy of his file first", u8(bk));
    b.v[P_F_CUTOFF] = 6.6; lib.putUser(b);   // his B changed since the export
    e = lib.importSome(fUser, {1}, Library::kImportMerge, bk, sum);
    bool b2 = false; for (const BankPreset& q : inSec(sec)) b2 = b2 || (q.name == "Bank sound B (2)" && std::fabs(q.v[P_F_CUTOFF] - 4.4) < 1e-9);
    check(e.empty() && inSec(sec).size() == 3 && b2 && has(sum, "1 already there"), "MERGE: the same sound is left out, a namesake that differs comes in as \"(2)\"", u8(e) + " " + sum);
    lib.setStars(kC, 6);
    lib.setStars(kB, 9);
    e = lib.exportTo(fAll);
    lib.setStars(kC, 0);   // no rating now
    lib.setStars(kB, 4);   // another rating now
    e = lib.importScan(fAll, items, by);
    int starItem = -1; bool hasBank = false;
    for (size_t i = 0; i < items.size(); i++) { if (items[i].kind == 3) starItem = (int)i; if (items[i].kind == 0 && items[i].name == "Export me") hasBank = true; }
    check(e.empty() && starItem >= 0 && hasBank, "importScan of a whole presets file: its banks and its stars", u8(e));
    std::vector<char> only(items.size(), 0); if (starItem >= 0) only[starItem] = 1;
    e = lib.importSome(fAll, only, Library::kImportAdd, bk, sum);
    check(e.empty() && lib.stars(kC) == 6 && lib.stars(kB) == 4, "IMPORT of the stars rates only the presets he has not rated", u8(e) + " " + sum);
    check(!lib.importSome(fAll, std::vector<char>(items.size(), 0), Library::kImportAdd, bk, sum).empty(), "nothing chosen: nothing is imported");
    lib.setStars(kB, 0); lib.setStars(kC, 0);
    lib.removeBank(secOf("Export me (imported)")); lib.removeBank(secOf("Export me"));
  }

  std::printf(gFails ? "\n%d FAILED\n" : "\nALL PASS\n", gFails);
  return gFails ? 1 : 0;
}
