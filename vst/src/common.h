// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
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
#define WS_NAME "Wavelet Synthesizer"
#define WS_VERSION "0.3.0"   // beta 0.3 (pre-release); also in vst/src/version.rc and tools/spec.js APP

// Live state the audio thread publishes for the editor, plus a queue of notes
// played on the on-screen keyboard. Shared through a process-wide registry
// (processor and controller run in the same process in Ableton Live).
struct SharedState {
  std::atomic<float> gains[NB];
  std::atomic<float> center{0}, width{1}, depth{0}, peakL{0}, peakR{0};
  std::atomic<int> note{-1}, mode{0};
  std::atomic<uint32_t> voices{0};
  std::atomic<uint32_t> keys[4];
  std::atomic<uint32_t> blocks{0};

  struct Ev { int16_t note; int16_t vel; };  // vel 1..127 = on, 0 = off, -1 = all notes off
  static constexpr uint32_t QN = 256;
  Ev ring[QN];
  std::atomic<uint32_t> head{0}, tail{0};

  SharedState() { for (auto& g : gains) g.store(0); for (auto& k : keys) k.store(0); }
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

}  // namespace ws
