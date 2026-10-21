// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.6).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// VST3 declarations shared by the processor, controller and editor.
#pragma once
#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/gui/iplugview.h"
#include "dsp.h"

namespace Steinberg { namespace Vst { class IComponent; class IEditController; } }

namespace ws {

#define WS_VENDOR "OktoPierre"
#define WS_NAME "Okto MultiWave Synth"
#define WS_VERSION "1.0.5"   // Okto MultiWave Synth 1.0.5; also in vst/src/version.rc and tools/spec.js APP

// beta 0.6 (security review): the sample rates a host may set; others are ignored (the engine keeps its rate)
inline constexpr double kMinRate = 8000, kMaxRate = 1536000;

// Live state the audio thread publishes for the editor, plus a queue of notes
// played on the on-screen keyboard. Shared through a process-wide registry
// (processor and controller run in the same process in Ableton Live).
struct SharedState {
  std::atomic<float> gains[NB];
  std::atomic<float> center{0}, width{1}, depth{0}, peakL{0}, peakR{0};
  std::atomic<int> note{-1}, mode{0}, view{0};   // view: the oscillator shown (the gains are its)
  std::atomic<bool> slotLive{false};              // the oscillator shown plays in the last voice (else the panel shows its static gains)
  std::atomic<float> sg[NS][NB], swin[NS][3];     // beta 0.3.1: the live gains and window of every oscillator that plays in the last voice (the scope and the scalogram)
  std::atomic<uint32_t> smask{0};                 // ... and which ones (bit s)
  std::atomic<uint32_t> voices{0};
  std::atomic<uint32_t> keys[4];
  std::atomic<uint32_t> blocks{0};
  // Okto MultiWave Synth: the chord sounding (its root, -1 = none; its notes started so far as bits), the last root, the chord type
  // the engine plays with, and a count of the times a selector key changed it (the editor then tells the controller)
  std::atomic<int> chordRoot{-1}, chordLast{60}, chordType{-1};
  std::atomic<uint32_t> chordBits[4], chordTypeEdits{0};

  struct Ev { int16_t note; int16_t vel; int16_t kind; };  // vel 1..127 = on, 0 = off, -1 = all notes off; kind 0 = a key (the chord layer), 1 = the strum plate
  static constexpr uint32_t QN = 256;
  Ev ring[QN];
  std::atomic<uint32_t> head{0}, tail{0};

  SharedState() { for (auto& g : gains) g.store(0); for (auto& k : keys) k.store(0); for (auto& k : chordBits) k.store(0); }
  bool push(Ev e) {  // UI thread
    uint32_t h = head.load(std::memory_order_relaxed);
    if (h - tail.load(std::memory_order_acquire) >= QN) return false;
    ring[h % QN] = e;
    head.store(h + 1, std::memory_order_release);
    return true;
  }
  bool pop(Ev& e) {  // audio thread
    uint32_t t = tail.load(std::memory_order_relaxed);
    if (t == head.load(std::memory_order_acquire)) return false;
    e = ring[t % QN];
    tail.store(t + 1, std::memory_order_release);
    return true;
  }
};

int64_t registerShared(const std::shared_ptr<SharedState>& s);
void unregisterShared(int64_t id);
std::shared_ptr<SharedState> findShared(int64_t id);

// What the editor needs from the controller.
struct EditorHost {
  virtual ~EditorHost() = default;
  virtual double getPlain(int id) = 0;
  virtual void beginEdit(int id) = 0;
  virtual void performEditPlain(int id, double plain) = 0;
  virtual void endEdit(int id) = 0;
  virtual uint32_t paramVersion() = 0;
  virtual std::shared_ptr<SharedState> sharedState() = 0;
  virtual int presetIndex() = 0;
  virtual bool presetDirty() = 0;
  virtual void loadPreset(int index) = 0;
  // beta 0.3: a sound of the USER BANK (bank.h), loaded like a preset and shown as kUserPrefix + its name
  virtual void loadUserSound(const double* plain, const std::string& shownName) = 0;
  virtual std::string userPresetName() = 0;   // "" while the sound is a factory preset
  // beta 0.5: the name of a factory preset this version no longer has (a Live Set saved with an older one): the panel
  // shows it, the sound itself is in the processor state; "" otherwise
  virtual std::string formerPresetName() = 0;
  // beta 0.3: the factory preset just saved (SAVE PRESET) is the sound shown, unmodified; the preset browser panel
  virtual void presetStored(int index) = 0;
  virtual bool browserOpen() = 0;
  virtual void setBrowserOpen(bool open) = 0;
  virtual double zoom() = 0;
  virtual void setZoom(double z) = 0;
  virtual void editorClosed() = 0;
  void setPlainGesture(int id, double v) { beginEdit(id); performEditPlain(id, v); endEdit(id); }
};

// The preset browser shows a sound of the user bank as "USER · <name>"; the controller state stores it so.
inline constexpr const char* kUserPrefix = "USER \xC2\xB7 ";

Steinberg::IPlugView* createEditor(EditorHost* host, Steinberg::FUnknown* keepAlive);

// The VST3 processor and controller, for the VST2 entry point (vst2.cpp), which hosts them in-process.
Steinberg::Vst::IComponent* newProcessor();
Steinberg::Vst::IEditController* newController();
EditorHost* editorHostOf(Steinberg::Vst::IEditController* controller);

std::u16string toU16(const std::string& utf8);
std::string fromU16(const char16_t* s);
std::wstring toW(const std::string& utf8);
std::string fromW(const std::wstring& w);

}  // namespace ws
