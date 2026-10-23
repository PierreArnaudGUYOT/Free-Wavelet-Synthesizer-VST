// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.6).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// VST3 processor, controller and factory.
// Written directly against the VST3 interfaces (pluginterfaces, MIT); no SDK helper library.
#ifdef _WIN32
#include <windows.h>
#endif
#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__)
#include <xmmintrin.h>
#endif
#ifdef __APPLE__
#define __ASSERT_MACROS_DEFINE_VERSIONS_WITHOUT_UNDERSCORES 0   // no check() / verify() macros from Apple's headers
#include <CoreFoundation/CoreFoundation.h>
#include <pthread.h>
#include <pthread/qos.h>
#endif
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <map>
#include <mutex>
#include <thread>
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/vst/ivstattributes.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivsthostapplication.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstmidicontrollers.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "pluginterfaces/vst/vstspeaker.h"
#include "pluginterfaces/vst/vsttypes.h"
#include "common.h"
#include "bank.h"

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace ws {

// Okto MultiWave Synth: its own class IDs (the Wavelet Synthesizer and Okto MultiWave Synth can be installed side by side)
static const FUID kProcessorUID(0xAD0A5967, 0x9F4B4D8F, 0x98779E69, 0x04E4F2D0);
static const FUID kControllerUID(0x7E02B916, 0x86914A57, 0xBCBCA737, 0xA4F08A21);
static constexpr uint32_t kStateMagic = 0x31595357;  // "WSY1"
// beta 0.3: version 2. B2's 41 parameters were removed, so the ParamIDs after them moved: the state of a beta 0.1 / 0.2 session (version 1) would put its
// values on the wrong controls, so it is not read at all (the instance keeps its default sound)
static constexpr uint32_t kStateVersion = 2;
static constexpr uint32_t kCtlMagic2 = 0x32435357;   // "WSC2": zoom, modified flag, preset name
// ------------------------------------------------------------------ helpers
#ifdef _WIN32
std::u16string toU16(const std::string& s) {
  std::u16string out;
  int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
  std::wstring w(n, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &w[0], n);
  out.assign(w.begin(), w.end());
  return out;
}
std::wstring toW(const std::string& s) {
  int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
  std::wstring w(n, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &w[0], n);
  return w;
}
std::string fromW(const std::wstring& w) {
  const int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string s(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &s[0], n, nullptr, nullptr);
  return s;
}
std::string fromU16(const char16_t* s) {
  std::wstring w;
  for (; s && *s; s++) w.push_back((wchar_t)*s);
  int n = WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), nullptr, 0, nullptr, nullptr);
  std::string out(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, w.c_str(), (int)w.size(), &out[0], n, nullptr, nullptr);
  return out;
}
#else
// macOS: wchar_t is UTF-32 (platform.h converts); VST3 strings are UTF-16
std::wstring toW(const std::string& s) { return utf8ToWide(s); }
std::string fromW(const std::wstring& w) { return wideToUtf8(w); }
std::u16string toU16(const std::string& s) {
  std::u16string out;
  for (wchar_t c : utf8ToWide(s)) {
    const uint32_t cp = (uint32_t)c;
    if (cp >= 0x10000) { out.push_back((char16_t)(0xD800 + ((cp - 0x10000) >> 10))); out.push_back((char16_t)(0xDC00 + ((cp - 0x10000) & 0x3FF))); }
    else out.push_back((char16_t)cp);
  }
  return out;
}
std::string fromU16(const char16_t* s) {
  std::string out;
  for (; s && *s; s++) {
    uint32_t cp = (uint16_t)*s;
    if (cp >= 0xD800 && cp < 0xDC00 && s[1] >= 0xDC00 && s[1] < 0xE000) { cp = 0x10000 + ((cp - 0xD800) << 10) + ((uint16_t)s[1] - 0xDC00); s++; }
    appendUtf8(out, cp);
  }
  return out;
}
#endif
static void copyU16(TChar* dst, const std::string& utf8, int max) {
  std::u16string u = toU16(utf8);
  int n = std::min((int)u.size(), max - 1);
  for (int i = 0; i < n; i++) dst[i] = u[i];
  dst[n] = 0;
}
static void copyStr(char8* dst, const char* src, size_t max) { std::strncpy(dst, src, max - 1); dst[max - 1] = 0; }

// ------------------------------------------------------------------ shared-state registry
static std::mutex gRegMutex;
static std::map<int64_t, std::weak_ptr<SharedState>> gRegistry;
static int64_t gNextId = 1;
int64_t registerShared(const std::shared_ptr<SharedState>& s) {
  std::lock_guard<std::mutex> l(gRegMutex);
  int64_t id = processId() * 100000 + gNextId++;
  gRegistry[id] = s;
  return id;
}
void unregisterShared(int64_t id) { std::lock_guard<std::mutex> l(gRegMutex); gRegistry.erase(id); }
std::shared_ptr<SharedState> findShared(int64_t id) {
  std::lock_guard<std::mutex> l(gRegMutex);
  auto it = gRegistry.find(id);
  return it == gRegistry.end() ? nullptr : it->second.lock();
}

// ------------------------------------------------------------------ minimal IMessage / IAttributeList
#define WS_REFCOUNT                                                              \
  std::atomic<uint32> refs{1};                                                   \
  uint32 PLUGIN_API addRef() override { return ++refs; }                         \
  uint32 PLUGIN_API release() override { uint32 r = --refs; if (!r) delete this; return r; }
#define WS_QI(Iface) \
  if (FUnknownPrivate::iidEqual(_iid, Iface::iid)) { addRef(); *obj = static_cast<Iface*>(this); return kResultOk; }

class AttrList : public IAttributeList {
 public:
  WS_REFCOUNT
  std::map<std::string, int64> ints;
  std::map<std::string, double> floats;
  std::map<std::string, std::u16string> strings;
  std::map<std::string, std::string> bins;
  tresult PLUGIN_API queryInterface(const TUID _iid, void** obj) override {
    WS_QI(IAttributeList)
    if (FUnknownPrivate::iidEqual(_iid, FUnknown::iid)) { addRef(); *obj = static_cast<FUnknown*>(this); return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
  // The host may call these with any arguments: null ids or buffers and too-small sizes are rejected.
  tresult PLUGIN_API setInt(AttrID id, int64 v) override { if (!id) return kInvalidArgument; ints[id] = v; return kResultOk; }
  tresult PLUGIN_API getInt(AttrID id, int64& v) override { if (!id) return kInvalidArgument; auto it = ints.find(id); if (it == ints.end()) return kResultFalse; v = it->second; return kResultOk; }
  tresult PLUGIN_API setFloat(AttrID id, double v) override { if (!id) return kInvalidArgument; floats[id] = v; return kResultOk; }
  tresult PLUGIN_API getFloat(AttrID id, double& v) override { if (!id) return kInvalidArgument; auto it = floats.find(id); if (it == floats.end()) return kResultFalse; v = it->second; return kResultOk; }
  tresult PLUGIN_API setString(AttrID id, const TChar* s) override { if (!id || !s) return kInvalidArgument; strings[id] = std::u16string((const char16_t*)s); return kResultOk; }
  tresult PLUGIN_API getString(AttrID id, TChar* s, uint32 sizeInBytes) override {
    if (!id || !s || sizeInBytes < sizeof(TChar)) return kInvalidArgument;
    auto it = strings.find(id); if (it == strings.end()) return kResultFalse;
    uint32 n = std::min<uint32>((uint32)it->second.size(), sizeInBytes / (uint32)sizeof(TChar) - 1);
    std::memcpy(s, it->second.data(), n * sizeof(TChar)); s[n] = 0; return kResultOk;
  }
  tresult PLUGIN_API setBinary(AttrID id, const void* d, uint32 size) override {
    if (!id || (!d && size)) return kInvalidArgument;
    bins[id] = size ? std::string((const char*)d, size) : std::string(); return kResultOk;
  }
  tresult PLUGIN_API getBinary(AttrID id, const void*& d, uint32& size) override {
    if (!id) return kInvalidArgument;
    auto it = bins.find(id); if (it == bins.end()) return kResultFalse; d = it->second.data(); size = (uint32)it->second.size(); return kResultOk;
  }
  virtual ~AttrList() = default;
};

class Message : public IMessage {
 public:
  WS_REFCOUNT
  std::string id;
  AttrList* attrs = new AttrList();
  tresult PLUGIN_API queryInterface(const TUID _iid, void** obj) override {
    WS_QI(IMessage)
    if (FUnknownPrivate::iidEqual(_iid, FUnknown::iid)) { addRef(); *obj = static_cast<FUnknown*>(this); return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }
  FIDString PLUGIN_API getMessageID() override { return id.c_str(); }
  void PLUGIN_API setMessageID(FIDString s) override { id = s ? s : ""; }
  IAttributeList* PLUGIN_API getAttributes() override { return attrs; }
  virtual ~Message() { attrs->release(); }
};

static IMessage* makeMessage(FUnknown* hostContext, const char* id) {
  IMessage* m = nullptr;
  if (hostContext) {
    IHostApplication* app = nullptr;
    if (hostContext->queryInterface(IHostApplication::iid, (void**)&app) == kResultOk && app) {
      TUID cid, iid;
      IMessage::iid.toTUID(cid); IMessage::iid.toTUID(iid);
      void* p = nullptr;
      if (app->createInstance(cid, iid, &p) == kResultOk && p) m = (IMessage*)p;
      app->release();
    }
  }
  if (!m) m = new Message();
  m->setMessageID(id);
  return m;
}

// ------------------------------------------------------------------ state streams
static bool readAll(IBStream* s, void* d, int32 n) { int32 got = 0; return s->read(d, n, &got) == kResultOk && got == n; }
static bool writeAll(IBStream* s, const void* d, int32 n) { int32 put = 0; return s->write(const_cast<void*>(d), n, &put) == kResultOk && put == n; }

// Reads a processor state blob into plain values (missing parameters keep their current value).
static bool readState(IBStream* s, double* plain) {
  uint32_t magic = 0, version = 0, count = 0;
  if (!readAll(s, &magic, 4) || magic != kStateMagic) return false;
  if (!readAll(s, &version, 4) || version != kStateVersion || !readAll(s, &count, 4) || count > 4096) return false;
  for (uint32_t k = 0; k < count; k++) {
    uint32_t id; double v;
    if (!readAll(s, &id, 4) || !readAll(s, &v, 8)) return false;
    if (id < (uint32_t)kNumParams && std::isfinite(v) && !kParams[id].hidden) {
      plain[id] = std::min(kParams[id].max, std::max(kParams[id].min, v));
    }
  }
  return true;
}

// version 1.0.7 (CPU review 3.4): the sets of a preset are built by up to buildThreads() threads (the same bits, a third of the time on a heavy preset). The helper threads run below
// the normal priority so that they do not take the cores of the DAW's audio threads.
static void lowerBuildPriority() {
#if defined(_WIN32)
  SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
#elif defined(__APPLE__)
  pthread_set_qos_class_self_np(QOS_CLASS_UTILITY, 0);
#endif
}
static int buildThreads() {
  static const int n = [] { const unsigned hw = std::thread::hardware_concurrency(); gBuildThreadInit = lowerBuildPriority; return (int)std::max(1u, std::min(4u, hw / 2)); }();
  return n;
}

// ================================================================== processor
class Processor : public IComponent, public IAudioProcessor, public IConnectionPoint, public IProcessContextRequirements {
 public:
  WS_REFCOUNT

  Processor() {
    // a new instance opens on the default preset (A · Wavelet Lead)
    double v[kNumParams];
    Library::get().values(kDefaultPreset, v);   // as the player may have adjusted it (beta 0.3)
    for (int i = 0; i < kNumParams; i++) plain[i].store(v[i]);
    for (auto& s : setState_) s.store(kFree);
  }
  virtual ~Processor() { stopWorker(); if (sharedId) unregisterShared(sharedId); if (hostContext) hostContext->release(); if (peer) peer->release(); }

  tresult PLUGIN_API queryInterface(const TUID _iid, void** obj) override {
    WS_QI(IComponent) WS_QI(IAudioProcessor) WS_QI(IConnectionPoint) WS_QI(IProcessContextRequirements)
    if (FUnknownPrivate::iidEqual(_iid, IPluginBase::iid)) { addRef(); *obj = static_cast<IPluginBase*>(static_cast<IComponent*>(this)); return kResultOk; }
    if (FUnknownPrivate::iidEqual(_iid, FUnknown::iid)) { addRef(); *obj = static_cast<FUnknown*>(static_cast<IComponent*>(this)); return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }

  // IPluginBase
  tresult PLUGIN_API initialize(FUnknown* context) override {
    if (hostContext) return kResultFalse;
    hostContext = context; if (hostContext) hostContext->addRef();
    shared = std::make_shared<SharedState>();
    sharedId = registerShared(shared);
    startWorker();
    return kResultOk;
  }
  tresult PLUGIN_API terminate() override {
    stopWorker();
    if (sharedId) { unregisterShared(sharedId); sharedId = 0; }
    if (hostContext) { hostContext->release(); hostContext = nullptr; }
    return kResultOk;
  }

  // IComponent
  tresult PLUGIN_API getControllerClassId(TUID classId) override { kControllerUID.toTUID(classId); return kResultOk; }
  tresult PLUGIN_API setIoMode(IoMode) override { return kResultOk; }
  int32 PLUGIN_API getBusCount(MediaType type, BusDirection dir) override {
    if (type == kAudio && dir == kOutput) return 1;
    if (type == kEvent && dir == kInput) return 1;
    return 0;
  }
  tresult PLUGIN_API getBusInfo(MediaType type, BusDirection dir, int32 index, BusInfo& bus) override {
    if (index != 0) return kInvalidArgument;
    if (type == kAudio && dir == kOutput) {
      bus.mediaType = kAudio; bus.direction = kOutput; bus.channelCount = 2;
      copyU16(bus.name, "Stereo Out", 128); bus.busType = kMain; bus.flags = BusInfo::kDefaultActive;
      return kResultOk;
    }
    if (type == kEvent && dir == kInput) {
      bus.mediaType = kEvent; bus.direction = kInput; bus.channelCount = 16;
      copyU16(bus.name, "MIDI In", 128); bus.busType = kMain; bus.flags = BusInfo::kDefaultActive;
      return kResultOk;
    }
    return kInvalidArgument;
  }
  tresult PLUGIN_API getRoutingInfo(RoutingInfo&, RoutingInfo&) override { return kNotImplemented; }
  tresult PLUGIN_API activateBus(MediaType type, BusDirection dir, int32 index, TBool) override {
    return index == 0 && ((type == kAudio && dir == kOutput) || (type == kEvent && dir == kInput)) ? kResultOk : kInvalidArgument;
  }
  tresult PLUGIN_API setActive(TBool state) override {
    if (state) {
      if (!engine.hasCur) {
        // first activation: build the tables synchronously so sound is available immediately
        std::lock_guard<std::mutex> lk(buildMutex);
        double snap[kNumParams]; for (int i = 0; i < kNumParams; i++) snap[i] = plain[i].load();
        uint32_t v = structVersion.load();
        int idx = claimFree();
        if (idx >= 0) {
          try {
            buildTables(snap, true, sets[idx], buildThreads());
          } catch (...) {   // out of memory: the host is told, it does not crash
            setState_[idx].store(kFree);
            return kResultFalse;
          }
          // a set the builder thread published for an older state must not replace this one at the next block
          const int stale = pendingIdx.exchange(-1);
          if (stale >= 0) setState_[stale].store(kFree);
          setState_[idx].store(kActive);
          engine.setTables(tableRef(sets[idx]));
          builtVersion.store(v);
        }
      }
      stateDirty.store(true);
    } else {
      demoStop();   // version 1.0.13
      engine.reset();
      liftPedal();   // version 1.0.12: a sustain pedal still down when the plug-in is switched off does not hold the notes of the next run
      wasPlaying = false;
    }
    return kResultOk;
  }
  tresult PLUGIN_API setState(IBStream* state) override {
    if (!state) return kInvalidArgument;
    double v[kNumParams]; for (int i = 0; i < kNumParams; i++) v[i] = plain[i].load();
    if (!readState(state, v)) return kResultFalse;
    for (int i = 0; i < kNumParams; i++) if (!kParams[i].hidden) plain[i].store(v[i]);
    stateDirty.store(true);
    structVersion.fetch_add(1);
    kick();
    return kResultOk;
  }
  tresult PLUGIN_API getState(IBStream* state) override {
    if (!state) return kInvalidArgument;
    uint32_t count = 0; for (int i = 0; i < kNumParams; i++) if (!kParams[i].hidden) count++;
    uint32_t head[3] = {kStateMagic, kStateVersion, count};
    if (!writeAll(state, head, 12)) return kResultFalse;
    for (uint32_t i = 0; i < (uint32_t)kNumParams; i++) {
      if (kParams[i].hidden) continue;
      double v = plain[i].load();
      if (!writeAll(state, &i, 4) || !writeAll(state, &v, 8)) return kResultFalse;
    }
    return kResultOk;
  }

  // IAudioProcessor
  tresult PLUGIN_API setBusArrangements(SpeakerArrangement* inputs, int32 numIns, SpeakerArrangement* outputs, int32 numOuts) override {
    (void)inputs;
    if (numIns == 0 && numOuts == 1 && outputs && outputs[0] == SpeakerArr::kStereo) return kResultTrue;
    return kResultFalse;
  }
  tresult PLUGIN_API getBusArrangement(BusDirection dir, int32 index, SpeakerArrangement& arr) override {
    if (dir == kOutput && index == 0) { arr = SpeakerArr::kStereo; return kResultOk; }
    return kInvalidArgument;
  }
  tresult PLUGIN_API canProcessSampleSize(int32 size) override { return size == kSample32 ? kResultTrue : kResultFalse; }
  // version 1.0.15: the look-ahead limiter delays the output by 1.5 ms (the same in both output stages, so OUTPUT never changes it; in samples it follows the sample rate:
  // 66 at 44.1 kHz, 72 at 48 kHz, 144 at 96 kHz, see setupProcessing)
  uint32 PLUGIN_API getLatencySamples() override { return (uint32)engine.latency(); }
  tresult PLUGIN_API setupProcessing(ProcessSetup& setup) override {
    if (setup.symbolicSampleSize != kSample32) return kResultFalse;
    const int latencyBefore = engine.latency();
    // beta 0.6 (security review): only real rates; an absurd one would overflow the 4 s delay line's size
    if (setup.sampleRate >= kMinRate && setup.sampleRate <= kMaxRate && setup.sampleRate != engine.sr) engine.setSampleRate(setup.sampleRate);
    offline = setup.processMode == kOffline;
    if (setup.maxSamplesPerBlock > 0 && setup.maxSamplesPerBlock <= 1 << 20) scratch.resize((size_t)setup.maxSamplesPerBlock);   // (version 1.0.7: the right channel of a mono host layout is not allocated on the audio thread)
    // version 1.0.15: a new sample rate is a new latency in samples, and the VST3 rules want the host told (restartComponent(kLatencyChanged): it then deactivates,
    // reactivates and asks getLatencySamples again, so its delay compensation stays right). Only the edit controller holds the component handler: the processor asks it through
    // the connection, on this thread (setupProcessing is a UI-thread call, as restartComponent must be). Last, once the setup is complete: a host that restarts the plug-in
    // from inside the call finds it ready. The same rate twice changes nothing and sends nothing: no loop.
    if (engine.latency() != latencyBefore) sendLatencyChanged();
    return kResultOk;
  }
  // version 1.0.12: a host that switches the processing off (a suspended track, a stop) leaves nothing sounding, or held by the sustain pedal, behind it
  tresult PLUGIN_API setProcessing(TBool state) override { if (!state) { demoStop(); releaseAll(); wasPlaying = false; } return kResultOk; }
  uint32 PLUGIN_API getTailSamples() override { return kInfiniteTail; }
  // beta 0.6: the tempo, for the tempo sync of the delay and the LFOs; version 1.0.12: the transport state (a stop releases every note, see process)
  uint32 PLUGIN_API getProcessContextRequirements() override { return IProcessContextRequirements::kNeedTempo | IProcessContextRequirements::kNeedTransportState; }

  tresult PLUGIN_API process(ProcessData& data) override {
    // flush denormals to zero on this thread while we process (restored on return)
#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__)
    struct FtzGuard { unsigned int old = _mm_getcsr(); FtzGuard() { _mm_setcsr(old | 0x8040); } ~FtzGuard() { _mm_setcsr(old); } } ftz;
#elif defined(__aarch64__)
    struct FtzGuard {   // Apple silicon: the FZ bit (24) of FPCR
      uint64_t old;
      FtzGuard() { __asm__ __volatile__("mrs %0, fpcr" : "=r"(old)); const uint64_t n = old | (1ull << 24); __asm__ __volatile__("msr fpcr, %0" : : "r"(n)); }
      ~FtzGuard() { __asm__ __volatile__("msr fpcr, %0" : : "r"(old)); }
    } ftz;
#endif
    // beta 0.6: the host's tempo for the tempo sync (120 BPM when the host gives none, so that SYNC always plays)
    const ProcessContext* pc = data.processContext;
    engine.setTempo(pc && (pc->state & ProcessContext::kTempoValid) && pc->tempo > 0 ? pc->tempo : 120.0);
    // version 1.0.12: the transport going from playing to stopped releases every note and lifts the sustain pedal: a host that does not send the pedal's release (or the
    // note offs of the notes it stops) must not leave a sound behind. Only the change counts (a host that plays no transport while the player plays live is left alone).
    bool stopped = false;
    if (pc) { const bool playing = (pc->state & ProcessContext::kPlaying) != 0; stopped = wasPlaying && !playing; wasPlaying = playing; }
    bool panicSound = false, panicNotes = false, panicControllers = false;
    nPedal = 0;
    // 1. parameter changes (last value of each queue, applied at block start)
    if (data.inputParameterChanges) {
      int32 nq = data.inputParameterChanges->getParameterCount();
      for (int32 q = 0; q < nq; q++) {
        IParamValueQueue* queue = data.inputParameterChanges->getParameterData(q);
        if (!queue) continue;
        ParamID id = queue->getParameterId();
        int32 np = queue->getPointCount();
        // version 1.0.12: MIDI CC 120 / 121 / 123 reach a VST3 plug-in as parameters (IMidiMapping) and are triggers: a point at any value but the default (0.5) fires
        // (the data byte of these messages is 0; a host that resets its hidden parameters to their default sends 0.5, which must not fire a panic)
        if (id == (ParamID)P_MIDI_ASOFF || id == (ParamID)P_MIDI_RSTCTL || id == (ParamID)P_MIDI_ANOFF) {
          bool fired = false;
          for (int32 k = 0; k < np && !fired; k++) {
            int32 poff = 0; ParamValue pvn = 0;
            fired = queue->getPoint(k, poff, pvn) == kResultOk && std::fabs(pvn - toNorm(kParams[id], kParams[id].def)) > 1e-6;
          }
          if (fired) { if (id == (ParamID)P_MIDI_ASOFF) panicSound = true; else if (id == (ParamID)P_MIDI_ANOFF) panicNotes = true; else panicControllers = true; }
          continue;
        }
        // the sustain pedal: every point lands at its own sample offset, in step with the notes (4.), not all at the start of the block
        if (id == (ParamID)P_HOLD) {
          for (int32 k = 0; k < np; k++) {
            int32 poff = 0; ParamValue pvn = 0;
            if (queue->getPoint(k, poff, pvn) != kResultOk) continue;
            const PedalPt pt{std::max<int32>(0, std::min<int32>(data.numSamples, poff)), toPlain(kParams[P_HOLD], pvn)};
            if (nPedal < kMaxPedal) pedal[nPedal++] = pt; else pedal[kMaxPedal - 1] = pt;   // (a block has never so many: the last point always counts)
          }
          continue;
        }
        int32 off = 0; ParamValue v = 0;
        if (id < (ParamID)kNumParams && np > 0 && queue->getPoint(np - 1, off, v) == kResultOk) {
          double pv = toPlain(kParams[id], v);
          if (plain[id].load() != pv) {
            const double old = plain[id].load();
            plain[id].store(pv);
            if (demo.phase != 0 && !kParams[id].hidden) continue;   // version 1.0.13: the demo plays its own values; the player's come back when it stops (demoStop)
            engine.setParam((int)id, pv);
            // an oscillator's level rebuilds the tables only when it reaches or leaves 0 (the oscillator plays or not)
            bool levelEnds = false;
            for (int s = 0; s < NS; s++) if (id == (ParamID)kSlots[s].lvl && (old > 0) != (pv > 0)) levelEnds = true;
            // WAVELET MORPH needs (or no longer needs) the WAVELET 2 tables, and an LFO starts or stops moving the SOURCE PHASE, SPARSITY or
            // SOURCE WIDTH (the variants' tables): compared with what the tables in use were built for
            const bool morph = morphNeeded(engine.p); const int vsig = variantSig(engine.p);
            const bool tablesEnd = morph != lastMorph || vsig != lastVarSig;
            lastMorph = morph; lastVarSig = vsig;
            if ((kParams[id].structural && id != (ParamID)P_OSC_VIEW) || levelEnds || tablesEnd) { structVersion.fetch_add(1); kick(); }
          }
        }
      }
    }
    for (int a = 1; a < nPedal; a++) {   // (the points of one queue come in order; two queues of the same parameter, as the VST2 wrapper may give, are merged here)
      const PedalPt t = pedal[a]; int b = a - 1;
      while (b >= 0 && pedal[b].off > t.off) { pedal[b + 1] = pedal[b]; b--; }
      pedal[b + 1] = t;
    }
    if (stateDirty.exchange(false) && demo.phase == 0) {   // (during the demo the loaded state waits: demoStop gives the engine the player's values)
      for (int i = 0; i < kNumParams; i++) engine.setParam(i, plain[i].load());
      lastMorph = morphNeeded(engine.p); lastVarSig = variantSig(engine.p);   // (a loaded state rebuilds the tables itself)
    }

    // version 1.0.13: the demo's commands from the editor (PLAY DEMO / STOP DEMO), the first preset of the tour once its tables are built, the end of the piece
    if (shared) {
      const int c = shared->demoCmd.exchange(0);
      if (c == 1 && !offline) demoStart(); else if (c == 2) demoStop();
    }
    if (demo.phase == 1 && demoReady.load() == demoTag(0)) {
      demoApply(0);
      demo.phase = 2; demo.t0 = demo.clock + (int64_t)std::llround(kDemoLeadIn * engine.sr);
    }
    if (demo.phase == 2 && demo.clock >= demo.t0 + (int64_t)std::llround((kDemoDuration + kDemoTail) * engine.sr)) demoStop();

    // 2. new tables from the builder thread (version 1.0.13: not during the demo, which has its own; demoStop asks for the player's again)
    int pend = demo.phase == 0 ? pendingIdx.exchange(-1) : -1;
    if (pend >= 0) {
      setState_[pend].store(kActive);
      engine.setTables(tableRef(sets[pend]));
    }
    // Offline rendering (export / freeze) must not depend on the builder thread's timing:
    // rebuild structural changes synchronously, which is allowed when not running in real time.
    if (offline && demo.phase == 0 && structVersion.load() != builtVersion.load()) {
      std::lock_guard<std::mutex> lk(buildMutex);
      uint32_t v = structVersion.load();
      if (v != builtVersion.load()) {
        int old = pendingIdx.exchange(-1);
        if (old >= 0) setState_[old].store(kFree);
        int idx = claimFree();
        if (idx >= 0) {
          double snap[kNumParams]; for (int i = 0; i < kNumParams; i++) snap[i] = plain[i].load();
          buildTables(snap, true, sets[idx]);
          builtVersion.store(v);
          setState_[idx].store(kActive);
          engine.setTables(tableRef(sets[idx]));
        }
      }
    }

    // version 1.0.12: the MIDI panic messages (CC 120 all sound off, CC 123 all notes off, CC 121 reset all controllers) and the transport stop, before this block's notes
    if (panicSound) { engine.allSoundOff(); std::memset(demo.count, 0, sizeof demo.count); liftPedal(); }
    else if (panicNotes || stopped) releaseAll();
    if (panicControllers) resetControllers();

    // 3. notes from the on-screen keyboard
    if (shared) {
      SharedState::Ev e;
      while (shared->pop(e)) {   // Okto MultiWave Synth: keys go through the chord layer, the strum plate's notes play as themselves
        if (e.vel < 0) { engine.allNotesOff(); std::memset(demo.count, 0, sizeof demo.count); }
        else if (e.kind == 1) { if (e.vel == 0) engine.plateOff(e.note); else engine.plateOn(e.note, e.vel / 127.0); }
        else if (e.vel == 0) engine.keyOff(e.note);
        else engine.keyOn(e.note, e.vel / 127.0);
      }
    }

    // 4. audio with sample-accurate note events (from the host, and version 1.0.13: the demo's notes and its change of preset)
    const int32 ns = data.numSamples;
    float* L = nullptr; float* R = nullptr;
    if (data.numOutputs > 0 && data.outputs && data.outputs[0].numChannels > 0 && ns > 0) {
      L = data.outputs[0].channelBuffers32[0];
      R = data.outputs[0].numChannels > 1 ? data.outputs[0].channelBuffers32[1] : nullptr;
    }
    if (R == nullptr && L != nullptr) {
      if ((int32)scratch.size() < ns) scratch.resize(ns);  // only for unusual mono layouts
      R = scratch.data();
    }
    IEventList* events = data.inputEvents;
    int32 ne = events ? events->getEventCount() : 0;
    int32 pos = 0, hi = 0, pdi = 0;
    // version 1.0.12: the sustain pedal changes (collected in 1.) go in step with the notes, each at its own sample offset and before a note of the same offset (it used to
    // be the last change of the block applied at its start: a note off that came before the pedal went down was held, and the pedal's release was early or late)
    auto pedalUpTo = [&](int32 upTo) {
      while (pdi < nPedal && pedal[pdi].off <= upTo) {
        const int32 at = pedal[pdi].off;
        if (L && at > pos) { engine.process(L + pos, R + pos, at - pos); pos = at; }
        setPedal(pedal[pdi].v); pdi++;
      }
    };
    // version 1.0.13: the demo's dip for the next preset of the tour starts when its tables are ready and the time has come (it ends at the note the change goes with)
    if (demo.phase == 2 && demo.dip < 0 && demo.scene + 1 < kNumDemoScenes && demoReady.load() == demoTag(demo.scene + 1)) {
      const int64_t start = demoChordAt(demo.scene + 1) - demoDipLen();
      if (start < demo.clock + ns) { demo.dip = std::max(start, demo.clock); demo.changed = false; }
    }
    const int64_t kNever = INT64_MAX;
    // offsets in this block of the demo's next note and of its change of preset (kNever: none in this block)
    auto demoNoteAt = [&]() -> int64_t {
      if (demo.phase != 2 || demo.ev >= kNumDemoEvents) return kNever;
      const int64_t at = demo.t0 + (int64_t)std::llround(kDemoEvents[demo.ev].t * engine.sr) - demo.clock;
      return at < ns ? std::max<int64_t>(0, at) : kNever;
    };
    auto demoChangeAt = [&]() -> int64_t {
      if (demo.phase != 2 || demo.dip < 0 || demo.changed) return kNever;
      const int64_t at = demo.dip + demoDipDown() - demo.clock;
      return at < ns ? std::max<int64_t>(0, at) : kNever;
    };
    for (;;) {
      Event e{};
      while (hi < ne && events->getEvent(hi, e) != kResultOk) hi++;
      const int64_t hostAt = hi < ne ? std::max(0, std::min(ns, e.sampleOffset)) : kNever;
      const int64_t noteAt = demoNoteAt(), changeAt = demoChangeAt();
      const int64_t at = std::min(hostAt, std::min(noteAt, changeAt));
      if (at == kNever) break;
      const int32 off = (int32)at;
      pedalUpTo(off);
      if (L && off > pos) { engine.process(L + pos, R + pos, off - pos); pos = off; }
      if (changeAt == at) { demoApply(demo.scene + 1); demo.changed = true; continue; }   // (at the same sample: the preset first, then the notes)
      if (noteAt == at) {   // the same pitch can be held by two voices of the score: counted, released at its last note off (as the web app's sequencer)
        const DemoEvent& d = kDemoEvents[demo.ev++];
        if (d.on) { demo.count[d.note]++; engine.noteOn(d.note, d.vel); }
        else if (demo.count[d.note] > 0 && --demo.count[d.note] == 0) engine.noteOff(d.note);
        continue;
      }
      if (e.type == Event::kNoteOnEvent) engine.keyOn(e.noteOn.pitch, e.noteOn.velocity);   // Okto MultiWave Synth: the chord layer
      else if (e.type == Event::kNoteOffEvent) engine.keyOff(e.noteOff.pitch);
      hi++;
    }
    pedalUpTo(ns);
    if (L && pos < ns) engine.process(L + pos, R + pos, ns - pos);
    if (demo.phase != 0) {
      // the dip: down in demoDipDown() samples, silent while the change is made (demoDipHold()), up again in demoDipUp() (version 1.0.8 of the web app: a preset change under sounding notes
      // was a burst of noise)
      if (L && demo.dip >= 0) {
        const int64_t D = demoDipDown(), H = demoDipHold(), U = demoDipUp();
        for (int32 i = 0; i < ns; i++) {
          const int64_t t = demo.clock + i - demo.dip;
          const float g = t < 0 ? 1.0f : t < D ? 1.0f - (float)t / (float)D : t < D + H ? 0.0f : t < D + H + U ? (float)(t - D - H) / (float)U : 1.0f;
          L[i] *= g; R[i] *= g;
        }
      }
      demo.clock += ns;
      if (demo.dip >= 0 && demo.clock >= demo.dip + demoDipLen()) demo.dip = -1;
    }
    if (shared) shared->demoScene.store(demo.phase == 0 ? -1 : demo.phase == 1 ? -2 : demo.scene);
    if (L) data.outputs[0].silenceFlags = 0;
    // Okto MultiWave Synth: a key of the selector octave chose a chord type: the parameter follows, the host and its controller are
    // told through the output parameter changes (and the editor through the shared state, for hosts that do not forward)
    if (engine.chordTypeChanged) {
      engine.chordTypeChanged = false;
      const double ct = engine.p[P_CHORD_TYPE];
      plain[P_CHORD_TYPE].store(ct);
      if (data.outputParameterChanges) {
        int32 qi = 0;
        IParamValueQueue* q = data.outputParameterChanges->addParameterData((ParamID)P_CHORD_TYPE, qi);
        int32 pi = 0;
        if (q) q->addPoint(0, toNorm(kParams[P_CHORD_TYPE], ct), pi);
      }
      if (shared) shared->chordTypeEdits.fetch_add(1);
    }

    // 5. recycle tables that are no longer referenced
    for (int k = 0; k < engine.nReleased; k++)
      for (int s = 0; s < kSets; s++) if (engine.released[k] == &sets[s]) setState_[s].store(kFree);
    engine.nReleased = 0;

    // 6. publish display data
    if (shared) {
      const Display& d = engine.disp;
      for (int b = 0; b < NB; b++) shared->gains[b].store(d.gains[b], std::memory_order_relaxed);
      for (int s = 0; s < NS; s++) { for (int b = 0; b < NB; b++) shared->sg[s][b].store(d.sg[s][b], std::memory_order_relaxed); for (int q = 0; q < 3; q++) shared->swin[s][q].store(d.swin[s][q], std::memory_order_relaxed); }
      shared->smask.store(d.mask);
      shared->center.store(d.center); shared->width.store(d.width); shared->depth.store(d.depth);
      shared->note.store(d.note); shared->mode.store(d.mode); shared->view.store(d.view); shared->slotLive.store(d.slotLive); shared->voices.store(d.voices);
      float o = shared->peakL.load(); while (d.peakL > o && !shared->peakL.compare_exchange_weak(o, d.peakL)) {}
      o = shared->peakR.load(); while (d.peakR > o && !shared->peakR.compare_exchange_weak(o, d.peakR)) {}
      engine.disp.peakL = 0; engine.disp.peakR = 0;
      for (int w = 0; w < 4; w++) {
        uint32_t bits = 0;
        for (int k = 0; k < 32; k++) if (engine.keys[w * 32 + k] || engine.selHeld[w * 32 + k]) bits |= 1u << k;   // (the selector keys of CHORD MODE make no sound: lit while held)
        shared->keys[w].store(bits);
      }
      // Okto MultiWave Synth: the chord sounding for the panel (its name, its notes, the strum plate)
      uint32_t cb[4] = {0, 0, 0, 0};
      for (int k = 0; k < engine.chordN; k++) if (engine.chordOn[k]) cb[engine.chordNote[k] >> 5] |= 1u << (engine.chordNote[k] & 31);
      for (int w = 0; w < 4; w++) shared->chordBits[w].store(cb[w]);
      shared->chordRoot.store(engine.chordRoot); shared->chordLast.store(engine.chordLastRoot);
      shared->chordType.store((int)jsRound(engine.p[P_CHORD_TYPE]));
      shared->blocks.fetch_add(1);
    }
    return kResultOk;
  }

  // IConnectionPoint
  tresult PLUGIN_API connect(IConnectionPoint* other) override {
    if (!other) return kInvalidArgument;
    if (peer) return kResultFalse;
    peer = other; peer->addRef();
    sendShared();
    return kResultOk;
  }
  tresult PLUGIN_API disconnect(IConnectionPoint* other) override {
    if (peer && other == peer) { peer->release(); peer = nullptr; return kResultOk; }
    return kResultFalse;
  }
  tresult PLUGIN_API notify(IMessage* msg) override {
    if (msg && msg->getMessageID() && std::strcmp(msg->getMessageID(), "ws.hello") == 0) { sendShared(); return kResultOk; }
    return kResultFalse;
  }

 private:
  enum { kFree = 0, kBuilding = 1, kPending = 2, kActive = 3 };
  static constexpr int kSets = 4;
  Engine engine{48000};
  std::atomic<double> plain[kNumParams];
  std::atomic<bool> stateDirty{true};
  std::atomic<uint32_t> structVersion{1}, builtVersion{0};
  bool lastMorph = false; int lastVarSig = 0;   // the morph / variants the tables in use were built for (audio thread)
  Tables sets[kSets];
  std::atomic<int> setState_[kSets];
  std::atomic<int> pendingIdx{-1};
  std::mutex buildMutex;        // serialises table builds (builder thread, activation, offline rendering)
  // version 1.0.7: the builder thread sleeps until a structural edit (it used to wake every 3 ms for the life of the instance: 0.2 % of a core per instance).
  // kick() is the only call added to the audio thread, once per structural edit: it takes no lock (a wake-up that falls between the thread's check and its wait
  // is caught by the 50 ms time-out)
  std::mutex wakeMutex; std::condition_variable wake;
  void kick() { wake.notify_one(); }
  bool offline = false;
  std::thread worker;
  std::atomic<bool> quit{false};
  std::vector<float> scratch;
  // version 1.0.12: the sustain pedal, the MIDI panic messages and the transport state (see process). A pedal left down, or a stop whose note offs never came, used to
  // leave the notes sounding (the pedal holds the notes that are released, the engine's all-notes-off was not reachable from a VST3 host)
  struct PedalPt { int32 off; double v; };
  static constexpr int kMaxPedal = 64;
  PedalPt pedal[kMaxPedal]; int nPedal = 0;   // the pedal changes of the block, by sample offset (audio thread)
  bool wasPlaying = false;                    // the transport was playing at the last block that told (audio thread)
  void setPedal(double v) { if (plain[P_HOLD].load() != v) { plain[P_HOLD].store(v); engine.setParam(P_HOLD, v); } }   // (the engine lets go of the held notes when it goes up)
  void liftPedal() { setPedal(kParams[P_HOLD].def); }
  void releaseAll() { engine.allNotesOff(); std::memset(demo.count, 0, sizeof demo.count); liftPedal(); }   // every note released, held ones too, and the pedal up (and the demo's count of its notes)

  // version 1.0.13: the demo (PLAY DEMO in the editor): the web app's demo, Beethoven's Appassionata (III) as a tour of the presets (kDemoEvents / kDemoScenes, written by tools/gen_spec.js from
  // web/js/demo.js), played by the audio thread. The notes of the piece go to the engine through noteOn / noteOff (as the web app's sequencer: not the chord layer), every phrase the engine takes
  // the next preset of the tour with the demo's rules, its tables built ahead by the builder thread (the scene after the one playing, 3.6 s ahead). The host's parameters are not touched: the
  // demo plays its own values and the player's come back when it stops. A change of preset is made in a short dip of the output that ends at the note it goes with (the web app's worklet does so
  // since version 1.0.8: a change under sounding notes was a burst of noise).
  struct DemoRun {
    int phase = 0;          // 0 off, 1 waiting for the tables of the first preset, 2 playing
    int64_t clock = 0;      // samples rendered since the start
    int64_t t0 = 0;         // the clock at the piece's time 0
    int ev = 0;             // the next event of kDemoEvents
    int scene = -1;         // the preset of the tour in place
    int64_t dip = -1;       // the clock at which the dip of the next change starts (-1: none)
    bool changed = false;   // the change of that dip is made
    uint8_t count[128] = {};
  } demo;
  int demoGen = 0;   // a new number at every start (audio thread): a set built for an older run is never used
  std::atomic<int> demoWant{-1}, demoReady{-1}, demoIdx{-1};   // the tag (run, scene) whose tables the audio thread wants; the tag of the set built; that set (kPending)
  int demoTag(int scene) const { return ((demoGen & 0x7fffff) << 8) | scene; }
  int64_t demoChordAt(int k) const { return demo.t0 + (int64_t)std::llround(kDemoScenes[k].chord * engine.sr); }
  int64_t demoDipDown() const { return std::max<int64_t>(1, std::llround(0.0053 * engine.sr)); }   // (the web app's 2 + 4 + 8 render quanta of 128 samples at 48 kHz)
  int64_t demoDipHold() const { return std::max<int64_t>(1, std::llround(0.0107 * engine.sr)); }
  int64_t demoDipUp() const { return std::max<int64_t>(1, std::llround(0.0213 * engine.sr)); }
  int64_t demoDipLen() const { return demoDipDown() + demoDipHold() + demoDipUp(); }
  void demoStart() {   // audio thread (or a deactivation)
    demoStop();
    engine.allNotesOff(); liftPedal();
    demo = DemoRun{}; demo.phase = 1;
    demoGen++;
    demoWant.store(demoTag(0)); kick();
  }
  void demoStop() {
    if (demo.phase == 0) return;
    demo = DemoRun{};
    demoWant.store(-1);
    const int s = demoIdx.exchange(-1);
    if (s >= 0) setState_[s].store(kFree);
    engine.allNotesOff();
    for (int i = 0; i < kNumParams; i++) engine.setParam(i, plain[i].load());   // the player's sound again, and its tables
    lastMorph = morphNeeded(engine.p); lastVarSig = variantSig(engine.p);
    structVersion.fetch_add(1); kick();
  }
  void demoApply(int k) {   // the preset of scene k (its tables if they are built), and the next scene's tables wanted
    int idx = -1;
    if (demoReady.load() == demoTag(k)) idx = demoIdx.exchange(-1);
    for (int i = 0; i < kNumParams; i++) if (kDemoScenes[k].v[i] != kDemoKeep) engine.setParam(i, kDemoScenes[k].v[i]);
    if (idx >= 0) { setState_[idx].store(kActive); engine.setTables(tableRef(sets[idx])); }
    demo.scene = k;
    demoWant.store(k + 1 < kNumDemoScenes ? demoTag(k + 1) : -1); kick();
  }
  // builder thread: the tables of a scene of the demo (the player's values where the scene keeps them)
  void demoBuild(int tag) {
    std::unique_lock<std::mutex> lk(buildMutex);
    const int idx = claimFree();
    if (idx < 0) { lk.unlock(); std::this_thread::sleep_for(std::chrono::milliseconds(2)); return; }
    double v[kNumParams];
    const DemoScene& sc = kDemoScenes[tag & 0xff];
    for (int i = 0; i < kNumParams; i++) v[i] = sc.v[i] != kDemoKeep ? sc.v[i] : plain[i].load();
    try {
      buildTables(v, true, sets[idx], buildThreads());
    } catch (...) {   // out of memory: the scene plays on the tables in use
      setState_[idx].store(kFree);
      demoReady.store(tag);
      return;
    }
    setState_[idx].store(kPending);
    const int old = demoIdx.exchange(idx);
    if (old >= 0) setState_[old].store(kFree);
    demoReady.store(tag);
    if (demoWant.load() < 0) { const int s = demoIdx.exchange(-1); if (s >= 0) setState_[s].store(kFree); }   // the demo stopped meanwhile
  }
  void resetControllers() {   // MIDI "reset all controllers": the pedal up, the pitch bend and the mod wheel at rest (the notes sounding are not touched)
    liftPedal();
    for (const int id : {P_BEND, P_MODWHEEL}) { const double d = kParams[id].def; if (plain[id].load() != d) { plain[id].store(d); engine.setParam(id, d); } }
  }
  FUnknown* hostContext = nullptr;
  IConnectionPoint* peer = nullptr;
  std::shared_ptr<SharedState> shared;
  int64_t sharedId = 0;

  int claimFree() {
    for (int s = 0; s < kSets; s++) { int f = kFree; if (setState_[s].compare_exchange_strong(f, kBuilding)) return s; }
    return -1;
  }
  void startWorker() {
    quit.store(false);
    worker = std::thread([this] {
      while (!quit.load()) {
        const int dw = demoWant.load();   // version 1.0.13: a scene of the demo first (it has a time to meet)
        if (dw >= 0 && dw != demoReady.load()) { demoBuild(dw); continue; }
        uint32_t v = structVersion.load();
        if (v != builtVersion.load()) {
          std::unique_lock<std::mutex> lk(buildMutex);
          v = structVersion.load();
          if (v == builtVersion.load()) continue;
          int idx = claimFree();
          if (idx < 0) { lk.unlock(); std::this_thread::sleep_for(std::chrono::milliseconds(2)); continue; }
          double snap[kNumParams]; for (int i = 0; i < kNumParams; i++) snap[i] = plain[i].load();
          try {
            buildTables(snap, true, sets[idx], buildThreads());
          } catch (...) {   // out of memory: the sound keeps its tables, this state is given up (the next change tries again)
            setState_[idx].store(kFree);
            builtVersion.store(v);
            lk.unlock();
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            continue;
          }
          builtVersion.store(v);
          setState_[idx].store(kPending);
          int old = pendingIdx.exchange(idx);
          if (old >= 0) setState_[old].store(kFree);
        } else {
          std::unique_lock<std::mutex> wl(wakeMutex);
          wake.wait_for(wl, std::chrono::milliseconds(50), [this] {
            const int dw = demoWant.load();
            return quit.load() || structVersion.load() != builtVersion.load() || (dw >= 0 && dw != demoReady.load());
          });
        }
      }
    });
  }
  void stopWorker() { quit.store(true); kick(); if (worker.joinable()) worker.join(); }
  void sendShared() {
    if (!peer || !sharedId) return;
    IMessage* m = makeMessage(hostContext, "ws.shared");
    m->getAttributes()->setInt("id", sharedId);
    peer->notify(m);
    m->release();
  }
  // version 1.0.15: the latency changed with the sample rate (setupProcessing); the controller passes it on to the host (Controller::notify)
  void sendLatencyChanged() {
    if (!peer) return;   // not connected yet: the host asks getLatencySamples after its first setActive(true) anyway
    IMessage* m = makeMessage(hostContext, "ws.latency");
    m->getAttributes()->setInt("samples", engine.latency());
    peer->notify(m);
    m->release();
  }
};

// ================================================================== controller
class Controller : public IEditController, public IConnectionPoint, public IMidiMapping, public EditorHost {
 public:
  WS_REFCOUNT

  Controller() {
    double v[kNumParams];
    Library::get().values(kDefaultPreset, v);
    for (int i = 0; i < kNumParams; i++) norm[i] = toNorm(kParams[i], v[i]);
  }
  virtual ~Controller() { if (handler) handler->release(); if (peer) peer->release(); if (hostContext) hostContext->release(); }

  tresult PLUGIN_API queryInterface(const TUID _iid, void** obj) override {
    WS_QI(IEditController) WS_QI(IConnectionPoint) WS_QI(IMidiMapping)
    if (FUnknownPrivate::iidEqual(_iid, IPluginBase::iid)) { addRef(); *obj = static_cast<IPluginBase*>(static_cast<IEditController*>(this)); return kResultOk; }
    if (FUnknownPrivate::iidEqual(_iid, FUnknown::iid)) { addRef(); *obj = static_cast<FUnknown*>(static_cast<IEditController*>(this)); return kResultOk; }
    *obj = nullptr; return kNoInterface;
  }

  tresult PLUGIN_API initialize(FUnknown* context) override {
    hostContext = context; if (hostContext) hostContext->addRef();
    return kResultOk;
  }
  tresult PLUGIN_API terminate() override {
    if (handler) { handler->release(); handler = nullptr; }
    if (hostContext) { hostContext->release(); hostContext = nullptr; }
    shared.reset();
    return kResultOk;
  }

  tresult PLUGIN_API setComponentState(IBStream* state) override {
    if (!state) return kInvalidArgument;
    double v[kNumParams]; for (int i = 0; i < kNumParams; i++) v[i] = toPlain(kParams[i], norm[i]);
    if (!readState(state, v)) return kResultFalse;
    for (int i = 0; i < kNumParams; i++) norm[i] = toNorm(kParams[i], v[i]);
    // the preset shown in the browser: the factory preset with exactly these values, else the current one, modified
    // (the host then calls setState, which restores the saved preset name and flag)
    const int k = exactPreset();
    if (k >= 0) { presetIdx = k; dirty = false; userName.clear(); formerName.clear(); } else dirty = true;
    version++;
    return kResultOk;
  }
  // Editor state: zoom, and the preset shown in the browser with its "modified" flag. The preset is stored by name
  // ("WSC2") so that a new factory order keeps saved Live Sets right.
  tresult PLUGIN_API setState(IBStream* state) override {
    if (!state) return kInvalidArgument;
    uint32_t magic = 0; float z = 1; int32_t dt = 0;
    if (readAll(state, &magic, 4) && magic == kCtlMagic2 && readAll(state, &z, 4)) {
      // beta 0.3.2: 0 = fit the window to the screen. A state saved by an earlier beta holds 1 (its default, before the fit existed): it is the fit too
      if (std::isfinite(z)) zoomFactor = (z <= 0 || z == 1.0f) ? 0.0f : std::min(2.0f, std::max(0.5f, z));
      int k = -1;
      uint32_t len = 0; char name[512];
      if (readAll(state, &dt, 4) && readAll(state, &len, 4) && len < sizeof name && (len == 0 || readAll(state, name, (int32)len))) {
        name[len] = 0;
        // a stored name never holds a NUL byte (a padded or hostile state is ignored, as with the old 128-byte limit)
        if (std::strlen(name) == len) {
          k = findPreset(name);
          // a sound of the user bank (beta 0.3): its name only, the sound itself is in the processor state
          if (k < 0 && std::strncmp(name, kUserPrefix, std::strlen(kUserPrefix)) == 0 && len > std::strlen(kUserPrefix)) {
            userName = name; formerName.clear(); dirty = dt != 0;
          }
          int32_t closed = 0;
          browserOpen_ = !(readAll(state, &closed, 4) && closed == 1);
        }
      }
      if (k >= 0) { presetIdx = k; dirty = dt != 0; userName.clear(); formerName.clear(); }
    }
    version++;
    return kResultOk;
  }
  tresult PLUGIN_API getState(IBStream* state) override {
    if (!state) return kInvalidArgument;
    uint32_t magic = kCtlMagic2; float z = zoomFactor; int32_t dt = dirty ? 1 : 0;
    const std::string name = !userName.empty() ? userName : !formerName.empty() ? formerName :
                             presetIdx >= 0 && presetIdx < kNumPresets ? Library::get().name(presetIdx) : "";
    uint32_t len = (uint32_t)name.size();
    if (!writeAll(state, &magic, 4) || !writeAll(state, &z, 4) || !writeAll(state, &dt, 4) || !writeAll(state, &len, 4) ||
        (len && !writeAll(state, name.c_str(), (int32)len)))
      return kResultFalse;
    const int32_t closed = 1;   // beta 0.3: the preset browser was closed (absent = open)
    if (!browserOpen_ && !writeAll(state, &closed, 4)) return kResultFalse;
    return kResultOk;
  }

  int32 PLUGIN_API getParameterCount() override { return kNumParams; }
  tresult PLUGIN_API getParameterInfo(int32 index, ParameterInfo& info) override {
    if (index < 0 || index >= kNumParams) return kInvalidArgument;
    const ParamDef& p = kParams[index];
    std::memset(&info, 0, sizeof info);
    info.id = (ParamID)index;
    copyU16(info.title, p.name, 128);
    copyU16(info.shortTitle, p.shortName, 128);
    copyU16(info.units, "", 128);
    info.stepCount = (p.curve == CURVE_INT || p.curve == CURVE_CHOICE) ? (int32)(p.max - p.min) : 0;
    info.defaultNormalizedValue = toNorm(p, p.def);
    info.unitId = 0;  // root unit
    info.flags = ParameterInfo::kCanAutomate;
    if (p.curve == CURVE_CHOICE) info.flags |= ParameterInfo::kIsList;
    if (p.hidden) info.flags |= ParameterInfo::kIsHidden;
    return kResultOk;
  }
  tresult PLUGIN_API getParamStringByValue(ParamID id, ParamValue v, String128 string) override {
    if (id >= (ParamID)kNumParams) return kInvalidArgument;
    copyU16(string, formatValue(kParams[id], toPlain(kParams[id], v)), 128);
    return kResultOk;
  }
  tresult PLUGIN_API getParamValueByString(ParamID id, TChar* string, ParamValue& v) override {
    if (id >= (ParamID)kNumParams || !string) return kInvalidArgument;
    double pv;
    if (!parseValue(kParams[id], fromU16((const char16_t*)string), pv)) return kResultFalse;
    v = toNorm(kParams[id], pv);
    return kResultOk;
  }
  ParamValue PLUGIN_API normalizedParamToPlain(ParamID id, ParamValue v) override {
    return id < (ParamID)kNumParams ? toPlain(kParams[id], v) : v;
  }
  ParamValue PLUGIN_API plainParamToNormalized(ParamID id, ParamValue v) override {
    return id < (ParamID)kNumParams ? toNorm(kParams[id], v) : v;
  }
  ParamValue PLUGIN_API getParamNormalized(ParamID id) override { return id < (ParamID)kNumParams ? norm[id] : 0; }
  tresult PLUGIN_API setParamNormalized(ParamID id, ParamValue v) override {
    if (id >= (ParamID)kNumParams) return kInvalidArgument;
    v = std::min(1.0, std::max(0.0, v));
    if (norm[id] != v) { norm[id] = v; version++; }
    return kResultOk;
  }
  tresult PLUGIN_API setComponentHandler(IComponentHandler* h) override {
    if (h == handler) return kResultOk;
    if (handler) handler->release();
    handler = h; if (handler) handler->addRef();
    return kResultOk;
  }
  IPlugView* PLUGIN_API createView(FIDString name) override {
    if (name && std::strcmp(name, ViewType::kEditor) == 0) return createEditor(this, static_cast<IEditController*>(this));
    return nullptr;
  }

  // IMidiMapping: pitch bend, mod wheel and sustain pedal arrive as parameters in VST3; version 1.0.12: so do the three MIDI panic messages (all sound off, reset all
  // controllers, all notes off), which a VST3 host only gives to a plug-in that maps them (the processor treats these three parameters as triggers)
  tresult PLUGIN_API getMidiControllerAssignment(int32 busIndex, int16, CtrlNumber ctrl, ParamID& id) override {
    if (busIndex != 0) return kResultFalse;
    switch (ctrl) {
      case kCtrlAllSoundsOff: id = P_MIDI_ASOFF; return kResultTrue;
      case kCtrlResetAllCtrlers: id = P_MIDI_RSTCTL; return kResultTrue;
      case kCtrlAllNotesOff: id = P_MIDI_ANOFF; return kResultTrue;
      case kPitchBend: id = P_BEND; return kResultTrue;
      case kCtrlModWheel: id = P_MODWHEEL; return kResultTrue;
      case kCtrlSustainOnOff: id = P_HOLD; return kResultTrue;
      default: return kResultFalse;
    }
  }

  // IConnectionPoint
  tresult PLUGIN_API connect(IConnectionPoint* other) override {
    if (!other) return kInvalidArgument;
    if (peer) return kResultFalse;
    peer = other; peer->addRef();
    IMessage* m = makeMessage(hostContext, "ws.hello");
    peer->notify(m);
    m->release();
    return kResultOk;
  }
  tresult PLUGIN_API disconnect(IConnectionPoint* other) override {
    if (peer && other == peer) { peer->release(); peer = nullptr; shared.reset(); return kResultOk; }
    return kResultFalse;
  }
  tresult PLUGIN_API notify(IMessage* msg) override {
    if (!msg || !msg->getMessageID()) return kInvalidArgument;
    if (std::strcmp(msg->getMessageID(), "ws.shared") == 0) {
      int64 id = 0;
      if (msg->getAttributes() && msg->getAttributes()->getInt("id", id) == kResultOk) shared = findShared(id);
      return kResultOk;
    }
    // version 1.0.15: the processor's latency changed with the sample rate (its look-ahead limiter, Processor::setupProcessing). The processor has no component handler, so
    // the controller tells the host, on the thread the host gave this message on (no thread of ours: the host keeps its own rules for restartComponent)
    if (std::strcmp(msg->getMessageID(), "ws.latency") == 0) {
      if (handler) handler->restartComponent(kLatencyChanged);
      return kResultOk;
    }
    return kResultFalse;
  }

  // EditorHost
  double getPlain(int id) override { return toPlain(kParams[id], norm[id]); }
  void beginEdit(int id) override { if (handler) handler->beginEdit(id); }
  void performEditPlain(int id, double pv) override {
    double v = toNorm(kParams[id], pv);
    if (norm[id] == v) return;
    norm[id] = v; version++;
    // the OSC tabs only choose the panel shown: switching them does not modify the sound; the chord keyboard's
    // settings (perf) are not a sound either
    if (!kParams[id].hidden && !kParams[id].perf && id != P_OSC_VIEW && !dirty) { dirty = true; }
    if (handler) handler->performEdit(id, v);
  }
  void endEdit(int id) override { if (handler) handler->endEdit(id); }
  uint32_t paramVersion() override { return version.load(); }
  std::shared_ptr<SharedState> sharedState() override { return shared; }
  int presetIndex() override { return presetIdx; }
  bool presetDirty() override { return dirty; }
  void loadPreset(int index) override {
    if (index < 0 || index >= kNumPresets) return;
    double v[kNumParams];
    Library::get().values(index, v);   // as the player may have adjusted it
    applySound(v);
    presetIdx = index; dirty = false; userName.clear(); formerName.clear(); version++;
  }
  void loadUserSound(const double* pv, const std::string& shownName) override {
    applySound(pv);
    dirty = false; userName = shownName; formerName.clear(); version++;   // presetIdx stays: ◀ ▶ go on from the last factory preset
  }
  std::string userPresetName() override { return userName; }
  std::string formerPresetName() override { return formerName; }
  void presetStored(int index) override {
    if (index >= 0 && index < kNumPresets) presetIdx = index;
    dirty = false; userName.clear(); formerName.clear(); version++;
  }
  bool browserOpen() override { return browserOpen_; }
  void setBrowserOpen(bool open) override { browserOpen_ = open; }
  double zoom() override { return zoomFactor; }
  // 0 = fit the window to the screen; a size chosen by the player (100 % is stored as 1.0001 so that it is not taken for the fit)
  void setZoom(double z) override { zoomFactor = z <= 0 ? 0.0f : z == 1.0 ? 1.0001f : (float)z; }
  void editorClosed() override {}

 private:
  double norm[kNumParams];
  IComponentHandler* handler = nullptr;
  IConnectionPoint* peer = nullptr;
  FUnknown* hostContext = nullptr;
  std::shared_ptr<SharedState> shared;
  std::atomic<uint32_t> version{1};
  int presetIdx = kDefaultPreset; bool dirty = false;
  std::string userName;   // the sound of the user bank shown in the browser ("" = the factory preset presetIdx)
  std::string formerName;   // beta 0.5: a factory preset of an older version, no longer in this one (its saved name)
  bool browserOpen_ = true;   // the preset browser panel of the editor (beta 0.3)
  float zoomFactor = 0.0f;   // beta 0.3.2: the window fits the screen until the player chooses a size

  // every non-hidden parameter to these plain values, sent to the host as one group edit (Okto MultiWave Synth: the chord keyboard's
  // settings stay as they are: a preset is a sound, not a playing setup)
  void applySound(const double* pv) {
    IComponentHandler2* h2 = nullptr;
    if (handler) handler->queryInterface(IComponentHandler2::iid, (void**)&h2);
    if (h2) h2->startGroupEdit();
    for (int i = 0; i < kNumParams; i++) {
      if (kParams[i].hidden || kParams[i].perf) continue;
      double v = toNorm(kParams[i], pv[i]);
      if (norm[i] == v) continue;
      norm[i] = v;
      if (handler) { handler->beginEdit(i); handler->performEdit(i, v); handler->endEdit(i); }
    }
    if (h2) { h2->finishGroupEdit(); h2->release(); }
  }

  int exactPreset() const {   // the factory preset whose sound is exactly the current one (OSC = panel shown), or -1
    std::vector<std::array<double, kNumParams>> lib(kNumPresets);   // as the player may have adjusted them
    for (int k = 0; k < kNumPresets; k++) Library::get().values(k, lib[k].data());
    for (int k = 0; k < kNumPresets; k++) {
      bool same = true;
      for (int i = 0; i < kNumParams && same; i++)
        if (!kParams[i].hidden && !kParams[i].perf && i != P_OSC_VIEW && std::fabs(toNorm(kParams[i], lib[k][i]) - norm[i]) > 1e-6) same = false;
      if (same) return k;
    }
    return -1;
  }
  static int findPreset(const char* name) {
    if (*name) return Library::get().find(name);   // its name now, else its built-in name
    return -1;
  }
};

// ================================================================== factory
class Factory : public IPluginFactory3 {
 public:
  tresult PLUGIN_API queryInterface(const TUID _iid, void** obj) override {
    if (FUnknownPrivate::iidEqual(_iid, IPluginFactory3::iid) || FUnknownPrivate::iidEqual(_iid, IPluginFactory2::iid) ||
        FUnknownPrivate::iidEqual(_iid, IPluginFactory::iid) || FUnknownPrivate::iidEqual(_iid, FUnknown::iid)) {
      addRef(); *obj = static_cast<IPluginFactory3*>(this); return kResultOk;
    }
    *obj = nullptr; return kNoInterface;
  }
  uint32 PLUGIN_API addRef() override { return 1; }   // static object
  uint32 PLUGIN_API release() override { return 1; }

  tresult PLUGIN_API getFactoryInfo(PFactoryInfo* info) override {
    if (!info) return kInvalidArgument;
    std::memset(info, 0, sizeof *info);
    copyStr(info->vendor, WS_VENDOR, PFactoryInfo::kNameSize);
    copyStr(info->url, "", PFactoryInfo::kURLSize);
    copyStr(info->email, "", PFactoryInfo::kEmailSize);
    info->flags = PFactoryInfo::kUnicode;
    return kResultOk;
  }
  int32 PLUGIN_API countClasses() override { return 2; }
  tresult PLUGIN_API getClassInfo(int32 index, PClassInfo* info) override {
    if (!info || index < 0 || index > 1) return kInvalidArgument;
    std::memset(info, 0, sizeof *info);
    (index == 0 ? kProcessorUID : kControllerUID).toTUID(info->cid);
    info->cardinality = PClassInfo::kManyInstances;
    copyStr(info->category, index == 0 ? kVstAudioEffectClass : kVstComponentControllerClass, PClassInfo::kCategorySize);
    copyStr(info->name, index == 0 ? WS_NAME : WS_NAME " Controller", PClassInfo::kNameSize);
    return kResultOk;
  }
  tresult PLUGIN_API getClassInfo2(int32 index, PClassInfo2* info) override {
    if (!info || index < 0 || index > 1) return kInvalidArgument;
    std::memset(info, 0, sizeof *info);
    (index == 0 ? kProcessorUID : kControllerUID).toTUID(info->cid);
    info->cardinality = PClassInfo::kManyInstances;
    copyStr(info->category, index == 0 ? kVstAudioEffectClass : kVstComponentControllerClass, PClassInfo::kCategorySize);
    copyStr(info->name, index == 0 ? WS_NAME : WS_NAME " Controller", PClassInfo::kNameSize);
    info->classFlags = 0;
    copyStr(info->subCategories, index == 0 ? "Instrument|Synth" : "", PClassInfo2::kSubCategoriesSize);
    copyStr(info->vendor, WS_VENDOR, PClassInfo2::kVendorSize);
    copyStr(info->version, WS_VERSION, PClassInfo2::kVersionSize);
    copyStr(info->sdkVersion, kVstVersionString, PClassInfo2::kVersionSize);
    return kResultOk;
  }
  tresult PLUGIN_API getClassInfoUnicode(int32 index, PClassInfoW* info) override {
    if (!info || index < 0 || index > 1) return kInvalidArgument;
    std::memset(info, 0, sizeof *info);
    (index == 0 ? kProcessorUID : kControllerUID).toTUID(info->cid);
    info->cardinality = PClassInfo::kManyInstances;
    copyStr(info->category, index == 0 ? kVstAudioEffectClass : kVstComponentControllerClass, PClassInfo::kCategorySize);
    copyU16(info->name, index == 0 ? WS_NAME : WS_NAME " Controller", PClassInfo::kNameSize);
    info->classFlags = 0;
    copyStr(info->subCategories, index == 0 ? "Instrument|Synth" : "", PClassInfoW::kSubCategoriesSize);
    copyU16(info->vendor, WS_VENDOR, PClassInfoW::kVendorSize);
    copyU16(info->version, WS_VERSION, PClassInfoW::kVersionSize);
    copyU16(info->sdkVersion, kVstVersionString, PClassInfoW::kVersionSize);
    return kResultOk;
  }
  tresult PLUGIN_API setHostContext(FUnknown*) override { return kResultOk; }

  tresult PLUGIN_API createInstance(FIDString cid, FIDString _iid, void** obj) override {
    if (!cid || !_iid || !obj) return kInvalidArgument;
    *obj = nullptr;
    FUnknown* inst = nullptr;
    if (FUnknownPrivate::iidEqual(cid, kProcessorUID.toTUID())) inst = static_cast<IComponent*>(new Processor());
    else if (FUnknownPrivate::iidEqual(cid, kControllerUID.toTUID())) inst = static_cast<IEditController*>(new Controller());
    if (!inst) return kNoInterface;
    tresult r = inst->queryInterface(_iid, obj);
    inst->release();
    return r;
  }
};

static Factory gFactory;

IComponent* newProcessor() { return new Processor(); }
IEditController* newController() { return new Controller(); }
EditorHost* editorHostOf(IEditController* controller) { return static_cast<Controller*>(controller); }

}  // namespace ws

#ifdef _WIN32
extern "C" {
__declspec(dllexport) bool InitDll() { return true; }
__declspec(dllexport) bool ExitDll() { return true; }
__declspec(dllexport) Steinberg::IPluginFactory* PLUGIN_API GetPluginFactory() { return &ws::gFactory; }
}
#else
// macOS: the host calls bundleEntry before GetPluginFactory and bundleExit before unloading the bundle
extern "C" {
__attribute__((visibility("default"))) bool bundleEntry(CFBundleRef) { return true; }
__attribute__((visibility("default"))) bool bundleExit() { return true; }
__attribute__((visibility("default"))) Steinberg::IPluginFactory* PLUGIN_API GetPluginFactory() { return &ws::gFactory; }
}
#endif
