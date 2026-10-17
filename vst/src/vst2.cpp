// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
// VST2 entry point (VSTPluginMain), so that the same DLL also loads from a host's VST2 plug-in folder.
// It hosts the VST3 processor and controller of plugin.cpp in-process: same sound engine, editor, presets and state.
// The VST 2.4 declarations below are written from the publicly documented binary layout; no file of
// Steinberg's VST2 SDK is used.
#include <windows.h>
#include <atomic>
#include <cstring>
#include <new>
#include <string>
#include <vector>
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstmidicontrollers.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "common.h"
#include "bank.h"

using namespace Steinberg;
using namespace Steinberg::Vst;

// ------------------------------------------------------------------ VST 2.4 binary interface (64-bit Windows)
namespace vst2 {
struct AEffect;
typedef intptr_t (*HostCallback)(AEffect* fx, int32_t opcode, int32_t index, intptr_t value, void* ptr, float opt);
struct AEffect {
  int32_t magic;
  intptr_t (*dispatcher)(AEffect* fx, int32_t opcode, int32_t index, intptr_t value, void* ptr, float opt);
  void (*process)(AEffect* fx, float** inputs, float** outputs, int32_t frames);   // deprecated, accumulating
  void (*setParameter)(AEffect* fx, int32_t index, float value);
  float (*getParameter)(AEffect* fx, int32_t index);
  int32_t numPrograms, numParams, numInputs, numOutputs, flags;
  intptr_t resvd1, resvd2;
  int32_t initialDelay, realQualities, offQualities;
  float ioRatio;
  void* object;
  void* user;
  int32_t uniqueID, version;
  void (*processReplacing)(AEffect* fx, float** inputs, float** outputs, int32_t frames);
  void (*processDoubleReplacing)(AEffect* fx, double** inputs, double** outputs, int32_t frames);
  char future[56];
};
struct Event { int32_t type, byteSize, deltaFrames, flags; char data[16]; };
struct MidiEvent {
  int32_t type, byteSize, deltaFrames, flags, noteLength, noteOffset;
  unsigned char midiData[4];
  char detune, noteOffVelocity, reserved1, reserved2;
};
struct Events { int32_t numEvents; intptr_t reserved; Event* events[2]; };
struct Rect { int16_t top, left, bottom, right; };

constexpr int32_t kMagic = 0x56737450;   // 'VstP'
constexpr int32_t kMidiType = 1;
enum : int32_t {   // plug-in opcodes (dispatcher)
  effOpen = 0, effClose = 1, effSetProgram = 2, effGetProgram = 3, effSetProgramName = 4, effGetProgramName = 5,
  effGetParamLabel = 6, effGetParamDisplay = 7, effGetParamName = 8, effSetSampleRate = 10, effSetBlockSize = 11,
  effMainsChanged = 12, effEditGetRect = 13, effEditOpen = 14, effEditClose = 15, effEditIdle = 19,
  effGetChunk = 23, effSetChunk = 24, effProcessEvents = 25, effCanBeAutomated = 26, effString2Parameter = 27,
  effGetProgramNameIndexed = 29, effGetPlugCategory = 35, effGetEffectName = 45, effGetVendorString = 47,
  effGetProductString = 48, effGetVendorVersion = 49, effCanDo = 51, effGetTailSize = 52, effGetVstVersion = 58,
  effGetNumMidiInputChannels = 78, effGetNumMidiOutputChannels = 79
};
enum : int32_t {   // host opcodes (callback)
  audioMasterAutomate = 0, audioMasterVersion = 1, audioMasterSizeWindow = 15, audioMasterGetCurrentProcessLevel = 23,
  audioMasterUpdateDisplay = 42, audioMasterBeginEdit = 43, audioMasterEndEdit = 44
};
enum : int32_t { effFlagsHasEditor = 1 << 0, effFlagsCanReplacing = 1 << 4, effFlagsProgramChunks = 1 << 5, effFlagsIsSynth = 1 << 8 };
constexpr int32_t kPlugCategSynth = 2, kProcessLevelOffline = 4;
constexpr int32_t kNameLen = 24;   // bytes written for parameter and program names and values (hosts give at least this)
}  // namespace vst2

namespace ws {
namespace {

// VST2 strings are 8-bit: write plain ASCII (the UTF-8 "·", "−", "±" and "°" of the spec become ASCII).
void copyAscii(char* dst, const std::string& utf8, size_t size) {
  std::string a;
  for (size_t i = 0; i < utf8.size();) {
    const unsigned char c = (unsigned char)utf8[i];
    if (c < 0x80) { a += (char)c; i++; continue; }
    if (!utf8.compare(i, 2, "\xC2\xB7")) { a += '-'; i += 2; }
    else if (!utf8.compare(i, 3, "\xE2\x88\x92")) { a += '-'; i += 3; }
    else if (!utf8.compare(i, 2, "\xC2\xB1")) { a += "+/-"; i += 2; }
    else if (!utf8.compare(i, 2, "\xC2\xB0")) { a += " deg"; i += 2; }
    else { a += '?'; i++; while (i < utf8.size() && ((unsigned char)utf8[i] & 0xC0) == 0x80) i++; }
  }
  if (!dst || !size) return;
  const size_t n = std::min(a.size(), size - 1);
  std::memcpy(dst, a.data(), n);
  dst[n] = 0;
}

// Small VST3 helper objects owned by the instance (their reference counts are not used).
#define WS2_UNKNOWN(Iface)                                                                          \
  tresult PLUGIN_API queryInterface(const TUID iid, void** obj) override {                         \
    if (FUnknownPrivate::iidEqual(iid, Iface::iid) || FUnknownPrivate::iidEqual(iid, FUnknown::iid)) { \
      *obj = static_cast<Iface*>(this); return kResultOk; }                                         \
    *obj = nullptr; return kNoInterface;                                                            \
  }                                                                                                 \
  uint32 PLUGIN_API addRef() override { return 1; }                                                 \
  uint32 PLUGIN_API release() override { return 1; }

class MemStream : public IBStream {
 public:
  WS2_UNKNOWN(IBStream)
  std::vector<char> data;
  int64 pos = 0;
  tresult PLUGIN_API read(void* buffer, int32 n, int32* got) override {
    int32 k = (int32)std::max<int64>(0, std::min<int64>(n, (int64)data.size() - pos));
    if (k > 0) std::memcpy(buffer, data.data() + pos, k);
    pos += k;
    if (got) *got = k;
    return kResultOk;
  }
  tresult PLUGIN_API write(void* buffer, int32 n, int32* put) override {
    if (n < 0) return kInvalidArgument;
    if ((int64)data.size() < pos + n) data.resize((size_t)(pos + n));
    if (n) std::memcpy(data.data() + pos, buffer, n);
    pos += n;
    if (put) *put = n;
    return kResultOk;
  }
  tresult PLUGIN_API seek(int64 p, int32 mode, int64* result) override {
    int64 base = mode == kIBSeekCur ? pos : mode == kIBSeekEnd ? (int64)data.size() : 0;
    if (base + p < 0) return kInvalidArgument;
    pos = base + p;
    if (result) *result = pos;
    return kResultOk;
  }
  tresult PLUGIN_API tell(int64* p) override { if (p) *p = pos; return kResultOk; }
};

class ParamQueue : public IParamValueQueue {
 public:
  WS2_UNKNOWN(IParamValueQueue)
  ParamID id = 0;
  ParamValue value = 0;
  ParamID PLUGIN_API getParameterId() override { return id; }
  int32 PLUGIN_API getPointCount() override { return 1; }
  tresult PLUGIN_API getPoint(int32 index, int32& offset, ParamValue& v) override {
    if (index != 0) return kInvalidArgument;
    offset = 0; v = value; return kResultOk;
  }
  tresult PLUGIN_API addPoint(int32, ParamValue v, int32& index) override { value = v; index = 0; return kResultOk; }
};

class ParamChanges : public IParameterChanges {
 public:
  WS2_UNKNOWN(IParameterChanges)
  ParamQueue queues[kNumParams];
  int32 count = 0;
  void add(int id, double v) { if (count < kNumParams) { queues[count].id = (ParamID)id; queues[count].value = v; count++; } }
  int32 PLUGIN_API getParameterCount() override { return count; }
  IParamValueQueue* PLUGIN_API getParameterData(int32 index) override { return index >= 0 && index < count ? &queues[index] : nullptr; }
  IParamValueQueue* PLUGIN_API addParameterData(const ParamID& id, int32& index) override {
    if (count >= kNumParams) return nullptr;
    queues[count].id = id; index = count; return &queues[count++];
  }
};

class EventList : public IEventList {
 public:
  WS2_UNKNOWN(IEventList)
  static constexpr int32 kMax = 1024;
  Steinberg::Vst::Event events[kMax];
  int32 count = 0;
  int32 PLUGIN_API getEventCount() override { return count; }
  tresult PLUGIN_API getEvent(int32 index, Steinberg::Vst::Event& e) override {
    if (index < 0 || index >= count) return kInvalidArgument;
    e = events[index]; return kResultOk;
  }
  tresult PLUGIN_API addEvent(Steinberg::Vst::Event& e) override {
    if (count >= kMax) return kResultFalse;
    events[count++] = e; return kResultOk;
  }
};

class Instance;

class Handler : public IComponentHandler {
 public:
  WS2_UNKNOWN(IComponentHandler)
  Instance* inst = nullptr;
  tresult PLUGIN_API beginEdit(ParamID id) override;
  tresult PLUGIN_API performEdit(ParamID id, ParamValue v) override;
  tresult PLUGIN_API endEdit(ParamID id) override;
  tresult PLUGIN_API restartComponent(int32 flags) override;
};

class Frame : public IPlugFrame {
 public:
  WS2_UNKNOWN(IPlugFrame)
  Instance* inst = nullptr;
  tresult PLUGIN_API resizeView(IPlugView* view, ViewRect* r) override;
};

// ------------------------------------------------------------------ one plug-in instance
class Instance {
 public:
  vst2::AEffect fx{};
  vst2::HostCallback host = nullptr;

  explicit Instance(vst2::HostCallback h) : host(h) {
    handler.inst = this; frame.inst = this;
    fx.magic = vst2::kMagic;
    fx.dispatcher = &sDispatch; fx.process = &sProcessAdd; fx.processReplacing = &sProcessReplacing;
    fx.setParameter = &sSetParameter; fx.getParameter = &sGetParameter;
    fx.numPrograms = kNumPresets; fx.numParams = kNumParams; fx.numInputs = 0; fx.numOutputs = 2;
    fx.flags = vst2::effFlagsHasEditor | vst2::effFlagsCanReplacing | vst2::effFlagsProgramChunks | vst2::effFlagsIsSynth;
    fx.ioRatio = 1.0f; fx.object = this;
    fx.uniqueID = ('O' << 24) | ('k' << 16) | ('W' << 8) | 'v';
    fx.version = 100;   // 0.1.0

    comp = newProcessor(); ctrl = newController();
    comp->initialize(nullptr); ctrl->initialize(nullptr);
    comp->queryInterface(IAudioProcessor::iid, (void**)&proc);
    comp->queryInterface(IConnectionPoint::iid, (void**)&cpComp);
    ctrl->queryInterface(IConnectionPoint::iid, (void**)&cpCtrl);
    IMidiMapping* mm = nullptr;
    if (ctrl->queryInterface(IMidiMapping::iid, (void**)&mm) == kResultOk && mm) {
      ParamID id;
      if (mm->getMidiControllerAssignment(0, 0, kPitchBend, id) == kResultTrue) bendId = (int)id;
      if (mm->getMidiControllerAssignment(0, 0, kCtrlModWheel, id) == kResultTrue) modId = (int)id;
      if (mm->getMidiControllerAssignment(0, 0, kCtrlSustainOnOff, id) == kResultTrue) holdId = (int)id;
      mm->release();
    }
    edHost = editorHostOf(ctrl);
    if (cpComp && cpCtrl) { cpComp->connect(cpCtrl); cpCtrl->connect(cpComp); }
    ctrl->setComponentHandler(&handler);
    MemStream s;   // the controller starts from the processor's state, as in a VST3 host
    if (comp->getState(&s) == kResultOk) { s.pos = 0; ctrl->setComponentState(&s); }
    for (int i = 0; i < kNumParams; i++) { norm[i].store((float)ctrl->getParamNormalized(i)); toProc[i].store(false); toCtrl[i].store(false); }
  }

  ~Instance() {
    if (active) setActive(false);
    closeEditor();
    if (cpComp && cpCtrl) { cpComp->disconnect(cpCtrl); cpCtrl->disconnect(cpComp); }
    ctrl->setComponentHandler(nullptr);
    ctrl->terminate(); comp->terminate();
    if (cpCtrl) cpCtrl->release();
    if (cpComp) cpComp->release();
    if (proc) proc->release();
    ctrl->release(); comp->release();
  }

  // ---------------------------------------------------------------- parameters (any thread)
  void setParameter(int i, float v) {
    if (i < 0 || i >= kNumParams) return;
    v = std::min(1.0f, std::max(0.0f, v == v ? v : 0.0f));
    norm[i].store(v); toProc[i].store(true); toCtrl[i].store(true);
  }
  float getParameter(int i) { return i >= 0 && i < kNumParams ? norm[i].load() : 0.0f; }

  // edits from the editor (UI thread): to the processor and, unless a host program change is running, to the host
  void edited(int id, double v) {
    if (id < 0 || id >= kNumParams) return;
    norm[id].store((float)v); toProc[id].store(true);
    if (!quietEdits) host(&fx, vst2::audioMasterAutomate, id, 0, nullptr, (float)v);
  }
  void gesture(int id, bool begin) {
    if (!quietEdits) host(&fx, begin ? vst2::audioMasterBeginEdit : vst2::audioMasterEndEdit, id, 0, nullptr, 0);
  }

  // host values to the controller (UI thread), so the editor follows automation
  void syncController() {
    for (int i = 0; i < kNumParams; i++) if (toCtrl[i].exchange(false)) ctrl->setParamNormalized(i, norm[i].load());
  }

  // ---------------------------------------------------------------- audio
  void setActive(bool on) {
    if (on == active) return;
    if (on) {
      const bool offline = host(&fx, vst2::audioMasterGetCurrentProcessLevel, 0, 0, nullptr, 0) == vst2::kProcessLevelOffline;
      ProcessSetup setup{offline ? kOffline : kRealtime, kSample32, std::max(1, maxBlock), sampleRate > 0 ? sampleRate : 44100.0};
      processMode = setup.processMode;
      proc->setupProcessing(setup);
      comp->setActive(true);
      proc->setProcessing(true);
      scratch.assign((size_t)std::max(1, maxBlock) * 2, 0.0f);
    } else {
      proc->setProcessing(false);
      comp->setActive(false);
    }
    active = on;
  }

  void midi(const vst2::MidiEvent& m) {
    const int status = m.midiData[0] & 0xF0, ch = m.midiData[0] & 0x0F, d1 = m.midiData[1] & 0x7F, d2 = m.midiData[2] & 0x7F;
    Steinberg::Vst::Event e{};
    e.busIndex = 0; e.sampleOffset = std::max(0, m.deltaFrames);
    if (status == 0x90 && d2 > 0) {
      e.type = Steinberg::Vst::Event::kNoteOnEvent;
      e.noteOn.channel = (int16)ch; e.noteOn.pitch = (int16)d1; e.noteOn.velocity = d2 / 127.0f; e.noteOn.noteId = -1;
      events.addEvent(e);
    } else if (status == 0x80 || status == 0x90) {
      e.type = Steinberg::Vst::Event::kNoteOffEvent;
      e.noteOff.channel = (int16)ch; e.noteOff.pitch = (int16)d1; e.noteOff.velocity = d2 / 127.0f; e.noteOff.noteId = -1;
      events.addEvent(e);
    } else if (status == 0xE0 && bendId >= 0) {
      setParameter(bendId, (float)(((d2 << 7) | d1) / 16383.0));
    } else if (status == 0xB0) {
      if (d1 == 1 && modId >= 0) setParameter(modId, d2 / 127.0f);
      else if (d1 == 64 && holdId >= 0) setParameter(holdId, d2 / 127.0f);
      else if (d1 == 120 || d1 == 123) {   // all sound off / all notes off
        for (int n = 0; n < 128; n++) {
          e.type = Steinberg::Vst::Event::kNoteOffEvent;
          e.noteOff.channel = (int16)ch; e.noteOff.pitch = (int16)n; e.noteOff.velocity = 0; e.noteOff.noteId = -1;
          events.addEvent(e);
        }
      }
    }
  }

  void render(float** out, int32_t n) {
    changes.count = 0;
    for (int i = 0; i < kNumParams; i++) if (toProc[i].exchange(false)) changes.add(i, norm[i].load());
    ProcessData d;
    d.processMode = processMode; d.symbolicSampleSize = kSample32; d.numSamples = n;
    AudioBusBuffers bus;
    bus.numChannels = 2; bus.channelBuffers32 = out;
    d.numOutputs = out ? 1 : 0; d.outputs = out ? &bus : nullptr;
    d.inputParameterChanges = &changes; d.inputEvents = &events;
    proc->process(d);
    events.count = 0;
  }

  void processReplacing(float** outputs, int32_t n) {
    if (!outputs || !outputs[0] || !outputs[1] || n <= 0) return;
    render(outputs, n);
  }
  void processAdd(float** outputs, int32_t n) {   // deprecated accumulating call
    if (!outputs || !outputs[0] || !outputs[1] || n <= 0) return;
    if ((int32_t)scratch.size() < 2 * n) scratch.resize((size_t)n * 2);
    float* tmp[2] = {scratch.data(), scratch.data() + n};
    render(tmp, n);
    for (int32_t i = 0; i < n; i++) { outputs[0][i] += tmp[0][i]; outputs[1][i] += tmp[1][i]; }
  }

  // ---------------------------------------------------------------- state: processor state + controller state
  // chunk: "WSV2", uint32 processor-state size, processor state, uint32 controller-state size, controller state
  static constexpr uint32_t kChunkMagic = 0x32565357;   // "WSV2"
  intptr_t getChunk(void** ptr) {
    if (!ptr) return 0;
    if (!active) render(nullptr, 0);   // apply parameter changes the processor has not seen yet
    MemStream a, b;
    comp->getState(&a); ctrl->getState(&b);
    chunk.clear();
    auto put = [&](const void* p, size_t n) { chunk.insert(chunk.end(), (const char*)p, (const char*)p + n); };
    const uint32_t magic = kChunkMagic, na = (uint32_t)a.data.size(), nb = (uint32_t)b.data.size();
    put(&magic, 4); put(&na, 4); put(a.data.data(), na); put(&nb, 4); put(b.data.data(), nb);
    *ptr = chunk.data();
    return (intptr_t)chunk.size();
  }
  intptr_t setChunk(const void* ptr, intptr_t size) {
    if (!ptr || size < 12) return 0;
    const char* p = (const char*)ptr;
    uint32_t magic, na, nb;
    std::memcpy(&magic, p, 4); std::memcpy(&na, p + 4, 4);
    if (magic != kChunkMagic || (uint64_t)na + 12 > (uint64_t)size) return 0;
    std::memcpy(&nb, p + 8 + na, 4);
    if ((uint64_t)na + nb + 12 > (uint64_t)size) return 0;
    MemStream a, a2, b;
    a.data.assign(p + 8, p + 8 + na); a2.data = a.data; b.data.assign(p + 12 + na, p + 12 + na + nb);
    if (comp->setState(&a) != kResultOk) return 0;
    ctrl->setComponentState(&a2);
    ctrl->setState(&b);
    for (int i = 0; i < kNumParams; i++) { norm[i].store((float)ctrl->getParamNormalized(i)); toProc[i].store(false); toCtrl[i].store(false); }
    host(&fx, vst2::audioMasterUpdateDisplay, 0, 0, nullptr, 0);
    return 1;
  }

  // ---------------------------------------------------------------- programs = factory presets
  void setProgram(int k) {
    if (k < 0 || k >= kNumPresets) return;
    syncController();
    quietEdits = true;    // a program change is not an automation gesture
    edHost->loadPreset(k);
    quietEdits = false;
  }

  // ---------------------------------------------------------------- editor
  bool ensureView() {
    if (view) return true;
    view = ctrl->createView(ViewType::kEditor);
    if (view) view->setFrame(&frame);
    return view != nullptr;
  }
  void closeEditor() {
    if (!view) return;
    if (attached) view->removed();
    attached = false;
    view->setFrame(nullptr);
    view->release();
    view = nullptr;
  }
  intptr_t editGetRect(void* ptr) {
    if (!ptr || !ensureView()) return 0;
    ViewRect r;
    view->getSize(&r);
    rect = vst2::Rect{0, 0, (int16_t)(r.bottom - r.top), (int16_t)(r.right - r.left)};
    *(vst2::Rect**)ptr = &rect;
    return 1;
  }
  intptr_t editOpen(void* parent) {
    if (!parent || !ensureView()) return 0;
    syncController();
    if (attached) view->removed();
    attached = view->attached(parent, kPlatformTypeHWND) == kResultOk;
    return attached ? 1 : 0;
  }

  // ---------------------------------------------------------------- dispatcher
  intptr_t dispatch(int32_t op, int32_t index, intptr_t value, void* ptr, float opt) {
    using namespace vst2;
    switch (op) {
      case effOpen: return 0;
      case effSetSampleRate: if (opt > 0) sampleRate = opt; return 0;
      case effSetBlockSize: if (value > 0) maxBlock = (int32_t)value; return 0;
      case effMainsChanged: setActive(value != 0); return 0;
      case effSetProgram: setProgram((int)value); return 0;
      case effGetProgram: return edHost->presetIndex();
      case effGetProgramName: {
        const std::string user = edHost->userPresetName();
        copyAscii((char*)ptr, !user.empty() ? user.c_str() : edHost->presetIndex() >= 0 ? Library::get().name(edHost->presetIndex()).c_str() : "", kNameLen);
        return 1;
      }
      case effGetProgramNameIndexed:   // the factory presets as the player may have renamed them (beta 0.3)
        if (index < 0 || index >= kNumPresets) return 0;
        copyAscii((char*)ptr, Library::get().name(index).c_str(), kNameLen); return 1;
      case effSetProgramName: return 0;
      case effGetParamName:
        if (index < 0 || index >= kNumParams) return 0;
        copyAscii((char*)ptr, std::strlen(kParams[index].name) < (size_t)kNameLen ? kParams[index].name : kParams[index].shortName, kNameLen);
        return 1;
      case effGetParamLabel: if (ptr) *(char*)ptr = 0; return 1;
      case effGetParamDisplay:
        if (index < 0 || index >= kNumParams) return 0;
        copyAscii((char*)ptr, formatValue(kParams[index], toPlain(kParams[index], norm[index].load())), kNameLen); return 1;
      case effString2Parameter: {
        if (index < 0 || index >= kNumParams || !ptr) return 0;
        double pv;
        if (!parseValue(kParams[index], std::string((const char*)ptr), pv)) return 0;
        setParameter(index, (float)toNorm(kParams[index], pv));
        return 1;
      }
      case effCanBeAutomated: return index >= 0 && index < kNumParams ? 1 : 0;
      case effGetChunk: return getChunk((void**)ptr);
      case effSetChunk: return setChunk(ptr, value);
      case effProcessEvents: {
        const Events* ev = (const Events*)ptr;
        if (!ev) return 0;
        for (int32_t i = 0; i < ev->numEvents; i++)
          if (ev->events[i] && ev->events[i]->type == kMidiType) midi(*(const MidiEvent*)ev->events[i]);
        return 1;
      }
      case effEditGetRect: return editGetRect(ptr);
      case effEditOpen: return editOpen(ptr);
      case effEditClose: closeEditor(); return 1;
      case effEditIdle: syncController(); return 0;
      case effGetPlugCategory: return kPlugCategSynth;
      case effGetEffectName: copyAscii((char*)ptr, WS_NAME, 32); return 1;
      case effGetProductString: copyAscii((char*)ptr, WS_NAME, 64); return 1;
      case effGetVendorString: copyAscii((char*)ptr, WS_VENDOR, 64); return 1;
      case effGetVendorVersion: return 100;
      case effGetVstVersion: return 2400;
      case effGetTailSize: return 0;
      case effGetNumMidiInputChannels: return 16;
      case effGetNumMidiOutputChannels: return 0;
      case effCanDo: {
        const char* s = (const char*)ptr;
        if (!s) return 0;
        if (!std::strcmp(s, "receiveVstEvents") || !std::strcmp(s, "receiveVstMidiEvent")) return 1;
        if (!std::strcmp(s, "sendVstEvents") || !std::strcmp(s, "sendVstMidiEvent")) return -1;
        return 0;
      }
      default: return 0;
    }
  }

  // host-facing helpers for Handler / Frame
  intptr_t hostCall(int32_t op, int32_t index, intptr_t value, float opt) { return host(&fx, op, index, value, nullptr, opt); }
  bool editorAttached() const { return attached; }

 private:
  IComponent* comp = nullptr;
  IAudioProcessor* proc = nullptr;
  IEditController* ctrl = nullptr;
  IConnectionPoint* cpComp = nullptr;
  IConnectionPoint* cpCtrl = nullptr;
  EditorHost* edHost = nullptr;
  IPlugView* view = nullptr;
  bool attached = false;
  Handler handler;
  Frame frame;
  ParamChanges changes;
  EventList events;
  std::atomic<float> norm[kNumParams];
  std::atomic<bool> toProc[kNumParams], toCtrl[kNumParams];
  int bendId = -1, modId = -1, holdId = -1;
  double sampleRate = 44100;
  int32_t maxBlock = 1024;
  int32 processMode = kRealtime;
  bool active = false, quietEdits = false;
  std::vector<float> scratch;
  std::vector<char> chunk;
  vst2::Rect rect{};

  static Instance* of(vst2::AEffect* fx) { return fx ? (Instance*)fx->object : nullptr; }
  static intptr_t sDispatch(vst2::AEffect* fx, int32_t op, int32_t index, intptr_t value, void* ptr, float opt) {
    Instance* in = of(fx);
    if (!in) return 0;
    if (op == vst2::effClose) { delete in; return 1; }
    return in->dispatch(op, index, value, ptr, opt);
  }
  static void sProcessReplacing(vst2::AEffect* fx, float**, float** out, int32_t n) { if (Instance* in = of(fx)) in->processReplacing(out, n); }
  static void sProcessAdd(vst2::AEffect* fx, float**, float** out, int32_t n) { if (Instance* in = of(fx)) in->processAdd(out, n); }
  static void sSetParameter(vst2::AEffect* fx, int32_t i, float v) { if (Instance* in = of(fx)) in->setParameter(i, v); }
  static float sGetParameter(vst2::AEffect* fx, int32_t i) { Instance* in = of(fx); return in ? in->getParameter(i) : 0.0f; }
};

tresult PLUGIN_API Handler::beginEdit(ParamID id) { inst->gesture((int)id, true); return kResultOk; }
tresult PLUGIN_API Handler::performEdit(ParamID id, ParamValue v) { inst->edited((int)id, v); return kResultOk; }
tresult PLUGIN_API Handler::endEdit(ParamID id) { inst->gesture((int)id, false); return kResultOk; }
tresult PLUGIN_API Handler::restartComponent(int32) { inst->hostCall(vst2::audioMasterUpdateDisplay, 0, 0, 0); return kResultOk; }
tresult PLUGIN_API Frame::resizeView(IPlugView* view, ViewRect* r) {
  if (!view || !r) return kInvalidArgument;
  if (!inst->hostCall(vst2::audioMasterSizeWindow, r->right - r->left, r->bottom - r->top, 0)) return kResultFalse;
  view->onSize(r);
  return kResultTrue;
}

}  // namespace
}  // namespace ws

extern "C" __declspec(dllexport) vst2::AEffect* VSTPluginMain(vst2::HostCallback host) {
  if (!host || !host(nullptr, vst2::audioMasterVersion, 0, 0, nullptr, 0)) return nullptr;
  ws::Instance* in = new (std::nothrow) ws::Instance(host);
  return in ? &in->fx : nullptr;
}
