// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
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
#endif
#include <chrono>
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

static const FUID kProcessorUID(0x2EF18A52, 0xA3A44A9E, 0x8C2C40AC, 0xE9D6925E);
static const FUID kControllerUID(0xF2AA9A30, 0xE06A4D4E, 0xABE441AC, 0xA7CBFEB3);
static constexpr uint32_t kStateMagic = 0x31595357;  // "WSY1"
static constexpr uint32_t kCtlMagic = 0x31435357;    // "WSC1" (beta 0.1): zoom, preset index, modified flag
static constexpr uint32_t kCtlMagic2 = 0x32435357;   // "WSC2": zoom, modified flag, preset name
// Factory order of the first beta 0.1 build: its "WSC1" states store an index into this list.
static const char* const kBeta01Order[] = {
    "A · Warm Pad", "B · Mirror Sub Bass", "A · Square Mod", "B · Init",
    "A · Square Mod 2", "B · Octave Organ", "A · Init", "B · Chip Walsh",
    "A · Wavelet Lead", "B · Walsh Bells", "A · Haar Bass", "B · Impulse Pluck",
    "A · Edge Pluck", "B · Random Glass", "A · Sparse Keys", "B · Mirror Pad",
    "A · Glass Pad", "B · Focus Sweep", "A · Noise Brass", "B · Soft Flute",
    "A · Scanning Edge", "B · Music Box", "A · Clean Keys", "B · Space Choir",
    "A · Infra Sub Bass", "B · Chip Echo", "A · Dub Echo Lead", "B · Distorted Organ",
    "A · Fuzz Bass", "B · Alien Texture", "A · Cathedral Saw", "A · Laser Sweep",
};

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
// A state saved before beta 0.2 has no A/B MIX: it gets A/B MIX = ENGINE, so it plays the engine it was made for.
// A state saved before beta 0.4 has no SOURCE PHASE: it gets 0, the source it was made with.
static bool readState(IBStream* s, double* plain) {
  uint32_t magic = 0, version = 0, count = 0;
  if (!readAll(s, &magic, 4) || magic != kStateMagic) return false;
  if (!readAll(s, &version, 4) || !readAll(s, &count, 4) || count > 4096) return false;
  bool sawMix = false, sawPhase = false;
  for (uint32_t k = 0; k < count; k++) {
    uint32_t id; double v;
    if (!readAll(s, &id, 4) || !readAll(s, &v, 8)) return false;
    if (id < (uint32_t)kNumParams && std::isfinite(v) && !kParams[id].hidden) {
      plain[id] = std::min(kParams[id].max, std::max(kParams[id].min, v));
      if (id == (uint32_t)P_AB_MIX) sawMix = true;
      if (id == (uint32_t)P_A_PHASE) sawPhase = true;
    }
  }
  if (!sawMix) plain[P_AB_MIX] = plain[P_ENGINE];
  if (!sawPhase) plain[P_A_PHASE] = kParams[P_A_PHASE].def;
  return true;
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
          buildTables(snap, true, sets[idx]);
          setState_[idx].store(kActive);
          engine.setTables(tableRef(sets[idx]));
          builtVersion.store(v);
        }
      }
      stateDirty.store(true);
    } else {
      engine.reset();
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
    return kResultOk;
  }
  tresult PLUGIN_API getState(IBStream* state) override {
    if (!state) return kInvalidArgument;
    uint32_t count = 0; for (int i = 0; i < kNumParams; i++) if (!kParams[i].hidden) count++;
    uint32_t head[3] = {kStateMagic, 1, count};
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
  uint32 PLUGIN_API getLatencySamples() override { return 0; }
  tresult PLUGIN_API setupProcessing(ProcessSetup& setup) override {
    if (setup.symbolicSampleSize != kSample32) return kResultFalse;
    // beta 0.6 (security review): only real rates; an absurd one would overflow the 4 s delay line's size
    if (setup.sampleRate >= kMinRate && setup.sampleRate <= kMaxRate && setup.sampleRate != engine.sr) engine.setSampleRate(setup.sampleRate);
    offline = setup.processMode == kOffline;
    return kResultOk;
  }
  tresult PLUGIN_API setProcessing(TBool) override { return kResultOk; }
  uint32 PLUGIN_API getTailSamples() override { return kInfiniteTail; }
  // beta 0.6: the tempo, for the tempo sync of the delay and the LFOs
  uint32 PLUGIN_API getProcessContextRequirements() override { return IProcessContextRequirements::kNeedTempo; }

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
    // 1. parameter changes (last value of each queue, applied at block start)
    if (data.inputParameterChanges) {
      int32 nq = data.inputParameterChanges->getParameterCount();
      for (int32 q = 0; q < nq; q++) {
        IParamValueQueue* queue = data.inputParameterChanges->getParameterData(q);
        if (!queue) continue;
        ParamID id = queue->getParameterId();
        int32 np = queue->getPointCount();
        int32 off = 0; ParamValue v = 0;
        if (id < (ParamID)kNumParams && np > 0 && queue->getPoint(np - 1, off, v) == kResultOk) {
          double pv = toPlain(kParams[id], v);
          if (plain[id].load() != pv) {
            const double old = plain[id].load();
            plain[id].store(pv);
            engine.setParam((int)id, pv);
            // A/B MIX rebuilds the tables only when it reaches or leaves one end (engine A or B alone)
            const bool mixEnds = id == (ParamID)P_AB_MIX && ((old < 1) != (pv < 1) || (old > 0) != (pv > 0));
            // WAVELET MORPH needs (or no longer needs) the WAVELET 2 tables when one of its amounts leaves 0
            const bool morphEnds = (id == (ParamID)P_WMORPH || id == (ParamID)P_LFO_WAV || id == (ParamID)P_ENV_WAV) && ((old == 0) != (pv == 0));
            // SOURCE PHASE moved by LFO 2 (beta 0.4): the phase tables become needed or are no longer needed
            const bool phaseEnds = (id == (ParamID)P_LFO2_AMT && (old == 0) != (pv == 0)) ||
                                   (id == (ParamID)P_LFO2_TARGET && (kLfo2Targets[(int)jsRound(old)] == P_A_PHASE) != (kLfo2Targets[(int)jsRound(pv)] == P_A_PHASE));
            if (kParams[id].structural || mixEnds || morphEnds || phaseEnds) structVersion.fetch_add(1);
          }
        }
      }
    }
    if (stateDirty.exchange(false)) for (int i = 0; i < kNumParams; i++) engine.setParam(i, plain[i].load());

    // 2. new tables from the builder thread
    int pend = pendingIdx.exchange(-1);
    if (pend >= 0) {
      setState_[pend].store(kActive);
      engine.setTables(tableRef(sets[pend]));
    }
    // Offline rendering (export / freeze) must not depend on the builder thread's timing:
    // rebuild structural changes synchronously, which is allowed when not running in real time.
    if (offline && structVersion.load() != builtVersion.load()) {
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

    // 3. notes from the on-screen keyboard
    if (shared) {
      SharedState::Ev e;
      while (shared->pop(e)) {
        if (e.vel < 0) engine.allNotesOff();
        else if (e.vel == 0) engine.noteOff(e.note);
        else engine.noteOn(e.note, e.vel / 127.0);
      }
    }

    // 4. audio with sample-accurate note events
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
    int32 pos = 0;
    for (int32 i = 0; i < ne; i++) {
      Event e{};
      if (events->getEvent(i, e) != kResultOk) continue;
      int32 off = std::max(0, std::min(ns, e.sampleOffset));
      if (L && off > pos) { engine.process(L + pos, R + pos, off - pos); pos = off; }
      if (e.type == Event::kNoteOnEvent) engine.noteOn(e.noteOn.pitch, e.noteOn.velocity);
      else if (e.type == Event::kNoteOffEvent) engine.noteOff(e.noteOff.pitch);
    }
    if (L && pos < ns) engine.process(L + pos, R + pos, ns - pos);
    if (L) data.outputs[0].silenceFlags = 0;

    // 5. recycle tables that are no longer referenced
    for (int k = 0; k < engine.nReleased; k++)
      for (int s = 0; s < kSets; s++) if (engine.released[k] == &sets[s]) setState_[s].store(kFree);
    engine.nReleased = 0;

    // 6. publish display data
    if (shared) {
      const Display& d = engine.disp;
      for (int b = 0; b < NB; b++) shared->gains[b].store(d.gains[b], std::memory_order_relaxed);
      shared->center.store(d.center); shared->width.store(d.width); shared->depth.store(d.depth);
      shared->note.store(d.note); shared->mode.store(d.mode); shared->voices.store(d.voices);
      float o = shared->peakL.load(); while (d.peakL > o && !shared->peakL.compare_exchange_weak(o, d.peakL)) {}
      o = shared->peakR.load(); while (d.peakR > o && !shared->peakR.compare_exchange_weak(o, d.peakR)) {}
      engine.disp.peakL = 0; engine.disp.peakR = 0;
      for (int w = 0; w < 4; w++) {
        uint32_t bits = 0;
        for (int k = 0; k < 32; k++) if (engine.keys[w * 32 + k]) bits |= 1u << k;
        shared->keys[w].store(bits);
      }
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
  Tables sets[kSets];
  std::atomic<int> setState_[kSets];
  std::atomic<int> pendingIdx{-1};
  std::mutex buildMutex;        // serialises table builds (builder thread, activation, offline rendering)
  bool offline = false;
  std::thread worker;
  std::atomic<bool> quit{false};
  std::vector<float> scratch;
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
        uint32_t v = structVersion.load();
        if (v != builtVersion.load()) {
          std::unique_lock<std::mutex> lk(buildMutex);
          v = structVersion.load();
          if (v == builtVersion.load()) continue;
          int idx = claimFree();
          if (idx < 0) { lk.unlock(); std::this_thread::sleep_for(std::chrono::milliseconds(2)); continue; }
          double snap[kNumParams]; for (int i = 0; i < kNumParams; i++) snap[i] = plain[i].load();
          buildTables(snap, true, sets[idx]);
          builtVersion.store(v);
          setState_[idx].store(kPending);
          int old = pendingIdx.exchange(idx);
          if (old >= 0) setState_[old].store(kFree);
        } else std::this_thread::sleep_for(std::chrono::milliseconds(3));
      }
    });
  }
  void stopWorker() { quit.store(true); if (worker.joinable()) worker.join(); }
  void sendShared() {
    if (!peer || !sharedId) return;
    IMessage* m = makeMessage(hostContext, "ws.shared");
    m->getAttributes()->setInt("id", sharedId);
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
  // ("WSC2") so that a new factory order keeps saved Live Sets right; "WSC1" states (index into the beta 0.1 order)
  // are translated through kBeta01Order.
  tresult PLUGIN_API setState(IBStream* state) override {
    if (!state) return kInvalidArgument;
    uint32_t magic = 0; float z = 1; int32_t dt = 0;
    if (readAll(state, &magic, 4) && (magic == kCtlMagic || magic == kCtlMagic2) && readAll(state, &z, 4)) {
      if (std::isfinite(z)) zoomFactor = std::min(2.0f, std::max(0.5f, z));
      int k = -1;
      if (magic == kCtlMagic2) {
        uint32_t len = 0; char name[512];
        if (readAll(state, &dt, 4) && readAll(state, &len, 4) && len < sizeof name && (len == 0 || readAll(state, name, (int32)len))) {
          name[len] = 0;
          // a stored name never holds a NUL byte (a padded or hostile state is ignored, as with the old 128-byte limit)
          if (std::strlen(name) == len) {
            k = findPreset(name);
            // a sound of the user bank (beta 0.3): its name only, the sound itself is in the processor state
            if (k < 0 && std::strncmp(name, kUserPrefix, std::strlen(kUserPrefix)) == 0 && len > std::strlen(kUserPrefix)) {
              userName = name; formerName.clear(); dirty = dt != 0;
            } else if (k < 0 && leftOut(name)) {   // beta 0.5: a factory preset of an older version, left out since
              formerName = name; userName.clear(); dirty = dt != 0;
            }
            int32_t closed = 0;
            browserOpen_ = !(readAll(state, &closed, 4) && closed == 1);
          }
        }
      } else {
        int32_t pi = -1;
        if (readAll(state, &pi, 4) && readAll(state, &dt, 4) && pi >= 0 && pi < (int32_t)(sizeof kBeta01Order / sizeof *kBeta01Order)) {
          k = findPreset(kBeta01Order[pi]);
          if (k < 0 && leftOut(kBeta01Order[pi])) { formerName = kBeta01Order[pi]; userName.clear(); dirty = dt != 0; }   // beta 0.5
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

  // IMidiMapping: pitch bend, mod wheel and sustain pedal arrive as parameters in VST3
  tresult PLUGIN_API getMidiControllerAssignment(int32 busIndex, int16, CtrlNumber ctrl, ParamID& id) override {
    if (busIndex != 0) return kResultFalse;
    switch (ctrl) {
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
    return kResultFalse;
  }

  // EditorHost
  double getPlain(int id) override { return toPlain(kParams[id], norm[id]); }
  void beginEdit(int id) override { if (handler) handler->beginEdit(id); }
  void performEditPlain(int id, double pv) override {
    double v = toNorm(kParams[id], pv);
    if (norm[id] == v) return;
    norm[id] = v; version++;
    // the ENGINE tabs only choose the panel shown: switching them does not modify the sound
    if (!kParams[id].hidden && id != P_ENGINE && !dirty) { dirty = true; }
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
  void setZoom(double z) override { zoomFactor = (float)z; }
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
  float zoomFactor = 1.0f;

  // every non-hidden parameter to these plain values, sent to the host as one group edit
  void applySound(const double* pv) {
    IComponentHandler2* h2 = nullptr;
    if (handler) handler->queryInterface(IComponentHandler2::iid, (void**)&h2);
    if (h2) h2->startGroupEdit();
    for (int i = 0; i < kNumParams; i++) {
      if (kParams[i].hidden) continue;
      double v = toNorm(kParams[i], pv[i]);
      if (norm[i] == v) continue;
      norm[i] = v;
      if (handler) { handler->beginEdit(i); handler->performEdit(i, v); handler->endEdit(i); }
    }
    if (h2) { h2->finishGroupEdit(); h2->release(); }
  }

  int exactPreset() const {   // the factory preset whose sound is exactly the current one (ENGINE = panel shown), or -1
    std::vector<std::array<double, kNumParams>> lib(kNumPresets);   // as the player may have adjusted them
    for (int k = 0; k < kNumPresets; k++) Library::get().values(k, lib[k].data());
    for (int k = 0; k < kNumPresets; k++) {
      bool same = true;
      for (int i = 0; i < kNumParams && same; i++)
        if (!kParams[i].hidden && i != P_ENGINE && std::fabs(toNorm(kParams[i], lib[k][i]) - norm[i]) > 1e-6) same = false;
      if (same) return k;
    }
    return -1;
  }
  static int findPreset(const char* name) {
    if (*name) return Library::get().find(name);   // its name now, else its built-in name
    return -1;
  }
  static bool leftOut(const char* name) {   // beta 0.5: a factory preset of an earlier version
    for (int i = 0; i < kNumLeftOut; i++) if (std::strcmp(name, kLeftOutPresets[i]) == 0) return true;
    return false;
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
