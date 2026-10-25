// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// dummysynth.cpp - a tiny reference VST3 instrument used ONLY to self-test
// vst3host (tests/vst3host). It is NOT the product. It follows the Wavelet
// Synthesizer contract the host expects (1 event in, 1 stereo out, parameters
// titled Engine / Wavelet / Cutoff ..., an HWND editor laid out like the spec at
// 1100x720 with knobs where the host's default drag points are).
//
// Deliberate defects can be switched on with the environment variable
// DUMMYSYNTH_BUGS (comma separated) to prove that the host detects them:
//   nan        write a NaN once per second
//   noclear    leave the output buffer untouched when no voice is playing
//   stuck      ignore note-off for MIDI note 72
//   audiothread send an IMessage (host createInstance) from process()
//   crash      access violation in process() after 3 s of audio
//   leakview   do not destroy the editor window in removed()
//   noscale    refuse IPlugViewContentScaleSupport
//   shared     all instances share one voice pool (global state)
//   noedit     editor changes values without beginEdit/performEdit/endEdit
//   srbug      assume 48 kHz regardless of setupProcessing
//   hang       hang forever in setActive(false) the 3rd time (watchdog test)

#define NOMINMAX
#include <windows.h>

#define INIT_CLASS_IID
#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivsthostapplication.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstmidicontrollers.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "pluginterfaces/vst/ivstunits.h"
#include "pluginterfaces/vst/vstspeaker.h"

#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

using namespace Steinberg;
using namespace Steinberg::Vst;

static HINSTANCE g_hinst = nullptr;
static std::string g_bugs;
static bool bug (const char* n) { return g_bugs.find (n) != std::string::npos; }

static const FUID kProcCID (0x5E1F7E57, 0xD0A11111, 0x8A5D0C0D, 0x00000001);
static const FUID kCtrlCID (0x5E1F7E57, 0xD0A11111, 0x8A5D0C0D, 0x00000002);

#define REFCOUNT                                                                                              \
	std::atomic<int32> refs {1};                                                                              \
	uint32 PLUGIN_API addRef () override { return ++refs; }                                                   \
	uint32 PLUGIN_API release () override                                                                     \
	{                                                                                                         \
		int32 r = --refs;                                                                                     \
		if (r == 0)                                                                                           \
			delete this;                                                                                      \
		return r;                                                                                             \
	}
#define QI(I)                                                                                                 \
	if (FUnknownPrivate::iidEqual (iid, I::iid))                                                              \
	{                                                                                                         \
		addRef ();                                                                                            \
		*obj = static_cast<I*> (this);                                                                        \
		return kResultOk;                                                                                     \
	}

static void toStr16 (const char* utf8, char16* dst, int max)
{
	int n = MultiByteToWideChar (CP_UTF8, 0, utf8, -1, (wchar_t*)dst, max);
	if (n <= 0)
		dst[0] = 0;
	dst[max - 1] = 0;
}
static std::string fromStr16 (const char16* s)
{
	char buf[512];
	int n = WideCharToMultiByte (CP_UTF8, 0, (const wchar_t*)s, -1, buf, sizeof buf, nullptr, nullptr);
	return n > 0 ? std::string (buf) : std::string ();
}

//==============================================================================
// Parameters
//==============================================================================
enum
{
	pEngine,
	pWavelet,
	pCutoff,
	pAttack,
	pRelease,
	pRevMix,
	pMaster,
	pBend,
	pMod,
	kNumParams
};
static const char* kEngines[] = {"A \xC2\xB7 Subtractive", "B \xC2\xB7 Additive"};
static const char* kWavelets[] = {"Haar", "Daubechies 2", "Daubechies 4", "Daubechies 8", "Symlet 8", "Coiflet 3", "Daubechies 20"};
struct PDef
{
	const char* title;
	const char* shortTitle;
	const char* units;
	int steps;
	double min, max, def; // plain
	bool expo;
	int32 flags;
	const char* const* choices;
};
static const PDef kP[kNumParams] = {
    {"Engine", "ENGINE", "", 1, 0, 1, 0, false, ParameterInfo::kCanAutomate | ParameterInfo::kIsList, kEngines},
    {"Wavelet", "WAVELET", "", 6, 0, 6, 2, false, ParameterInfo::kCanAutomate | ParameterInfo::kIsList, kWavelets},
    {"Cutoff", "CUTOFF", "band", 0, 0, 11, 11, false, ParameterInfo::kCanAutomate, nullptr},
    {"Amp Attack", "ATTACK", "s", 0, 0.001, 10, 0.003, true, ParameterInfo::kCanAutomate, nullptr},
    {"Amp Release", "RELEASE", "s", 0, 0.001, 10, 0.3, true, ParameterInfo::kCanAutomate, nullptr},
    {"Reverb Mix", "REV MIX", "%", 0, 0, 100, 0, false, ParameterInfo::kCanAutomate, nullptr},
    {"Master Volume", "VOLUME", "dB", 0, -36, 6, -6, false, ParameterInfo::kCanAutomate, nullptr},
    {"Pitch Bend", "BEND", "", 0, -1, 1, 0, false, ParameterInfo::kIsHidden, nullptr},
    {"Mod Wheel", "MOD", "", 0, 0, 1, 0, false, ParameterInfo::kIsHidden, nullptr},
};
static double clamp01 (double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
static double toPlain (int i, double n)
{
	const PDef& p = kP[i];
	n = clamp01 (n);
	if (p.steps > 0)
		return p.min + std::round (n * p.steps) * (p.max - p.min) / p.steps;
	if (p.expo)
		return p.min * std::pow (p.max / p.min, n);
	return p.min + n * (p.max - p.min);
}
static double toNorm (int i, double v)
{
	const PDef& p = kP[i];
	if (p.expo)
		return clamp01 (std::log (std::max (v, p.min) / p.min) / std::log (p.max / p.min));
	double n = clamp01 ((v - p.min) / (p.max - p.min));
	return p.steps > 0 ? std::round (n * p.steps) / p.steps : n;
}
static std::string toText (int i, double n)
{
	const PDef& p = kP[i];
	char b[64];
	if (p.choices)
		return p.choices[(int)std::round (clamp01 (n) * p.steps)];
	double v = toPlain (i, n);
	if (p.expo)
		snprintf (b, sizeof b, "%.4f", v);
	else if (i == pRevMix)
		snprintf (b, sizeof b, "%.1f", v);
	else
		snprintf (b, sizeof b, "%.3f", v);
	return b;
}
static bool fromText (int i, const std::string& s, double& n)
{
	const PDef& p = kP[i];
	if (p.choices)
	{
		for (int k = 0; k <= p.steps; k++)
			if (s == p.choices[k])
			{
				n = (double)k / p.steps;
				return true;
			}
		return false;
	}
	char* end = nullptr;
	double v = strtod (s.c_str (), &end);
	if (end == s.c_str ())
		return false;
	n = toNorm (i, v);
	return true;
}

//==============================================================================
// State format: 'DMY1' + kNumParams doubles (normalized)
//==============================================================================
static bool readState (IBStream* s, double* out)
{
	if (!s)
		return false;
	char tag[4];
	int32 got = 0;
	if (s->read (tag, 4, &got) != kResultOk || got != 4 || memcmp (tag, "DMY1", 4) != 0)
		return false;
	double tmp[kNumParams];
	if (s->read (tmp, sizeof tmp, &got) != kResultOk || got != (int32)sizeof tmp)
		return false;
	for (int i = 0; i < kNumParams; i++)
		out[i] = std::isfinite (tmp[i]) ? clamp01 (tmp[i]) : toNorm (i, kP[i].def); // validate
	return true;
}
static bool writeState (IBStream* s, const double* in)
{
	if (!s)
		return false;
	int32 w = 0;
	s->write ((void*)"DMY1", 4, &w);
	s->write ((void*)in, sizeof (double) * kNumParams, &w);
	return w == (int32)(sizeof (double) * kNumParams);
}

//==============================================================================
// Processor
//==============================================================================
struct Voice
{
	bool on = false, releasing = false;
	int pitch = 0;
	float vel = 0;
	double phase = 0, env = 0, lp = 0;
};
static Voice g_sharedVoices[16]; // used only with DUMMYSYNTH_BUGS=shared

class Processor final : public IComponent, public IAudioProcessor, public IConnectionPoint
{
public:
	double p[kNumParams];
	Voice ownVoices[16];
	Voice* voices = ownVoices;
	double sr = 48000;
	std::vector<float> delayL, delayR;
	size_t dpos = 0;
	int64 processed = 0;
	FUnknown* host = nullptr;
	IConnectionPoint* peer = nullptr;
	int deactivations = 0;

	Processor ()
	{
		for (int i = 0; i < kNumParams; i++)
			p[i] = toNorm (i, kP[i].def);
		if (bug ("shared"))
			voices = g_sharedVoices;
	}
	~Processor ()
	{
		if (host)
			host->release ();
	}

	// IPluginBase
	tresult PLUGIN_API initialize (FUnknown* ctx) override
	{
		if (host)
			return kResultFalse;
		host = ctx;
		if (host)
			host->addRef ();
		return kResultOk;
	}
	tresult PLUGIN_API terminate () override
	{
		if (host)
			host->release ();
		host = nullptr;
		return kResultOk;
	}
	// IComponent
	tresult PLUGIN_API getControllerClassId (TUID cid) override
	{
		memcpy (cid, kCtrlCID.toTUID (), sizeof (TUID));
		return kResultOk;
	}
	tresult PLUGIN_API setIoMode (IoMode) override { return kResultOk; }
	int32 PLUGIN_API getBusCount (MediaType t, BusDirection d) override
	{
		if (t == kAudio && d == kOutput)
			return 1;
		if (t == kEvent && d == kInput)
			return 1;
		return 0;
	}
	tresult PLUGIN_API getBusInfo (MediaType t, BusDirection d, int32 i, BusInfo& bi) override
	{
		if (i != 0 || getBusCount (t, d) == 0)
			return kInvalidArgument;
		bi.mediaType = t;
		bi.direction = d;
		bi.channelCount = t == kAudio ? 2 : 16;
		toStr16 (t == kAudio ? "Stereo Out" : "Event In", bi.name, 128);
		bi.busType = kMain;
		bi.flags = BusInfo::kDefaultActive;
		return kResultOk;
	}
	tresult PLUGIN_API getRoutingInfo (RoutingInfo&, RoutingInfo&) override { return kNotImplemented; }
	tresult PLUGIN_API activateBus (MediaType, BusDirection, int32, TBool) override { return kResultOk; }
	tresult PLUGIN_API setActive (TBool state) override
	{
		if (!state && bug ("hang") && ++deactivations == 3)
			for (;;)
				Sleep (100);
		double effSr = bug ("srbug") ? 48000.0 : sr;
		delayL.assign (state ? (size_t)(effSr * 0.25) : 0, 0.f);
		delayR.assign (state ? (size_t)(effSr * 0.31) : 0, 0.f);
		dpos = 0;
		for (int v = 0; v < 16; v++)
			voices[v] = Voice ();
		return kResultOk;
	}
	tresult PLUGIN_API setState (IBStream* s) override { return readState (s, p) ? kResultOk : kResultFalse; }
	tresult PLUGIN_API getState (IBStream* s) override { return writeState (s, p) ? kResultOk : kResultFalse; }
	// IAudioProcessor
	tresult PLUGIN_API setBusArrangements (SpeakerArrangement*, int32 nIn, SpeakerArrangement* out, int32 nOut) override
	{
		return (nIn == 0 && nOut == 1 && out && out[0] == SpeakerArr::kStereo) ? kResultTrue : kResultFalse;
	}
	tresult PLUGIN_API getBusArrangement (BusDirection d, int32 i, SpeakerArrangement& a) override
	{
		if (d != kOutput || i != 0)
			return kInvalidArgument;
		a = SpeakerArr::kStereo;
		return kResultOk;
	}
	tresult PLUGIN_API canProcessSampleSize (int32 s) override { return s == kSample32 ? kResultTrue : kResultFalse; }
	uint32 PLUGIN_API getLatencySamples () override { return 0; }
	tresult PLUGIN_API setupProcessing (ProcessSetup& s) override
	{
		sr = s.sampleRate;
		return kResultOk;
	}
	tresult PLUGIN_API setProcessing (TBool) override { return kResultOk; }
	uint32 PLUGIN_API getTailSamples () override { return (uint32)(sr * 3); }

	void noteOn (int pitch, float vel)
	{
		int slot = -1;
		for (int v = 0; v < 16 && slot < 0; v++)
			if (!voices[v].on)
				slot = v;
		if (slot < 0)
			slot = pitch % 16; // steal
		Voice& vo = voices[slot];
		vo = Voice ();
		vo.on = true;
		vo.pitch = pitch;
		vo.vel = vel;
	}
	void noteOff (int pitch)
	{
		if (bug ("stuck") && pitch == 72)
			return;
		for (int v = 0; v < 16; v++)
			if (voices[v].on && voices[v].pitch == pitch)
				voices[v].releasing = true;
	}
	void render (float* L, float* R, int32 from, int32 to)
	{
		double effSr = bug ("srbug") ? 48000.0 : sr;
		double bendSemis = toPlain (pBend, p[pBend]) * 2.0;
		double atk = toPlain (pAttack, p[pAttack]), rel = toPlain (pRelease, p[pRelease]);
		double cutHz = 40.0 * std::pow (2.0, toPlain (pCutoff, p[pCutoff]));
		double a = 1.0 - std::exp (-2.0 * 3.14159265 * std::min (cutHz, effSr * 0.45) / effSr);
		double gain = std::pow (10.0, toPlain (pMaster, p[pMaster]) / 20.0) * 0.25;
		double mix = toPlain (pRevMix, p[pRevMix]) / 100.0;
		bool engineB = p[pEngine] > 0.5;
		double vib = p[pMod];
		for (int32 i = from; i < to; i++)
		{
			double s = 0;
			for (int v = 0; v < 16; v++)
			{
				Voice& vo = voices[v];
				if (!vo.on)
					continue;
				if (vo.releasing)
				{
					vo.env -= 1.0 / (rel * effSr);
					if (vo.env <= 0)
					{
						vo = Voice ();
						continue;
					}
				}
				else if (vo.env < 1.0)
					vo.env = std::min (1.0, vo.env + 1.0 / (atk * effSr));
				double f = 440.0 * std::pow (2.0, (vo.pitch - 69 + bendSemis) / 12.0) *
				           (1.0 + 0.01 * vib * std::sin (processed * 6.28 * 5 / effSr));
				vo.phase += f / effSr;
				vo.phase -= std::floor (vo.phase);
				double osc = engineB ? (std::sin (6.2831853 * vo.phase) + 0.5 * std::sin (4 * 3.14159265 * vo.phase))
				                     : (2.0 * vo.phase - 1.0);
				vo.lp += a * (osc - vo.lp);
				s += vo.lp * vo.env * vo.vel;
			}
			double l = s, r = s;
			if (!delayL.empty ())
			{
				float dl = delayL[dpos % delayL.size ()], dr = delayR[dpos % delayR.size ()];
				delayL[dpos % delayL.size ()] = (float)(s + dr * 0.5);
				delayR[dpos % delayR.size ()] = (float)(s + dl * 0.5);
				dpos++;
				l += mix * dl;
				r += mix * dr;
			}
			L[i] = (float)(l * gain);
			R[i] = (float)(r * gain);
			processed++;
		}
	}
	tresult PLUGIN_API process (ProcessData& d) override
	{
		if (auto* pc = d.inputParameterChanges)
			for (int32 q = 0; q < pc->getParameterCount (); q++)
				if (auto* qq = pc->getParameterData (q))
				{
					int32 off;
					ParamValue v;
					ParamID id = qq->getParameterId ();
					if (id < kNumParams && qq->getPointCount () > 0 && qq->getPoint (qq->getPointCount () - 1, off, v) == kResultOk)
						p[id] = clamp01 (v);
				}
		if (d.numSamples <= 0 || d.numOutputs < 1 || !d.outputs || d.outputs[0].numChannels < 2)
			return kResultOk;
		float* L = d.outputs[0].channelBuffers32[0];
		float* R = d.outputs[0].channelBuffers32[1];
		d.outputs[0].silenceFlags = 0;
		bool any = false;
		for (int v = 0; v < 16; v++)
			any |= voices[v].on;
		int32 nev = d.inputEvents ? d.inputEvents->getEventCount () : 0;
		if (bug ("noclear") && !any && nev == 0)
			return kResultOk;
		int32 cur = 0;
		for (int32 e = 0; e < nev; e++)
		{
			Event ev;
			if (d.inputEvents->getEvent (e, ev) != kResultOk)
				continue;
			int32 off = std::min (std::max (ev.sampleOffset, (int32)0), d.numSamples);
			if (off > cur)
			{
				render (L, R, cur, off);
				cur = off;
			}
			if (ev.type == Event::kNoteOnEvent)
			{
				if (ev.noteOn.velocity > 0)
					noteOn (ev.noteOn.pitch, ev.noteOn.velocity);
				else
					noteOff (ev.noteOn.pitch);
				if (bug ("audiothread") && host)
				{
					IHostApplication* ha = nullptr;
					if (host->queryInterface (IHostApplication::iid, (void**)&ha) == kResultOk)
					{
						IMessage* m = nullptr;
						TUID mid;
						memcpy (mid, IMessage::iid.toTUID (), sizeof (TUID));
						if (ha->createInstance (mid, mid, (void**)&m) == kResultOk && m)
						{
							m->setMessageID ("noteFromAudioThread");
							if (peer)
								peer->notify (m);
							m->release ();
						}
						ha->release ();
					}
				}
			}
			else if (ev.type == Event::kNoteOffEvent)
				noteOff (ev.noteOff.pitch);
		}
		render (L, R, cur, d.numSamples);
		if (bug ("nan") && (processed / (int64)sr) != ((processed - d.numSamples) / (int64)sr))
			L[0] = NAN;
		if (bug ("crash") && processed > (int64)(sr * 3))
			*(volatile int*)nullptr = 1;
		return kResultOk;
	}
	// IConnectionPoint
	tresult PLUGIN_API connect (IConnectionPoint* other) override
	{
		if (!other || peer)
			return kResultFalse;
		peer = other;
		peer->addRef ();
		// say hello through a host-created IMessage (exercises IHostApplication::createInstance)
		IHostApplication* ha = nullptr;
		if (host && host->queryInterface (IHostApplication::iid, (void**)&ha) == kResultOk)
		{
			IMessage* m = nullptr;
			TUID mid;
			memcpy (mid, IMessage::iid.toTUID (), sizeof (TUID));
			if (ha->createInstance (mid, mid, (void**)&m) == kResultOk && m)
			{
				m->setMessageID ("hello");
				if (auto* at = m->getAttributes ())
				{
					at->setInt ("value", 42);
					at->setFloat ("sr", sr);
					char16 txt[32];
					toStr16 ("from processor", txt, 32);
					at->setString ("text", txt);
				}
				peer->notify (m);
				m->release ();
			}
			ha->release ();
		}
		return kResultOk;
	}
	tresult PLUGIN_API disconnect (IConnectionPoint* other) override
	{
		if (peer && other == peer)
		{
			peer->release ();
			peer = nullptr;
			return kResultOk;
		}
		return kResultFalse;
	}
	tresult PLUGIN_API notify (IMessage*) override { return kResultOk; }

	tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override
	{
		QI (IComponent)
		QI (IPluginBase)
		QI (IAudioProcessor)
		QI (IConnectionPoint)
		if (FUnknownPrivate::iidEqual (iid, FUnknown::iid))
		{
			addRef ();
			*obj = static_cast<IComponent*> (this);
			return kResultOk;
		}
		*obj = nullptr;
		return kNoInterface;
	}
	REFCOUNT
};

//==============================================================================
// Controller + editor
//==============================================================================
class Controller;
static LRESULT CALLBACK viewProc (HWND, UINT, WPARAM, LPARAM);
static const wchar_t* kViewClass = L"DummySynthEditorWindow";
static bool g_classRegistered = false;

struct Knob
{
	int param;
	int cx, cy, r; // 1x coordinates (spec layout)
	const char* label;
};
static const Knob kKnobs[] = {{pCutoff, 50, 418, 22, "CUTOFF"},
                              {pAttack, 582, 418, 22, "ATTACK"},
                              {pRelease, 738, 418, 22, "RELEASE"},
                              {pRevMix, 960, 566, 22, "REV MIX"},
                              {pMaster, 1046, 24, 16, "VOL"}};

class Controller final : public IEditController, public IMidiMapping, public IConnectionPoint
{
public:
	double p[kNumParams];
	IComponentHandler* handler = nullptr;
	FUnknown* host = nullptr;
	IConnectionPoint* peer = nullptr;
	int helloValue = 0;
	HWND editorWnd = nullptr;

	Controller ()
	{
		for (int i = 0; i < kNumParams; i++)
			p[i] = toNorm (i, kP[i].def);
	}
	~Controller ()
	{
		if (handler)
			handler->release ();
		if (host)
			host->release ();
	}
	tresult PLUGIN_API initialize (FUnknown* ctx) override
	{
		host = ctx;
		if (host)
			host->addRef ();
		return kResultOk;
	}
	tresult PLUGIN_API terminate () override
	{
		if (handler)
			handler->release ();
		handler = nullptr;
		if (host)
			host->release ();
		host = nullptr;
		return kResultOk;
	}
	tresult PLUGIN_API setComponentState (IBStream* s) override
	{
		double tmp[kNumParams];
		if (!readState (s, tmp))
			return kResultFalse;
		memcpy (p, tmp, sizeof p);
		if (editorWnd)
			InvalidateRect (editorWnd, nullptr, FALSE);
		return kResultOk;
	}
	tresult PLUGIN_API setState (IBStream* s) override
	{
		char b[4];
		int32 got = 0;
		return (s && s->read (b, 4, &got) == kResultOk) ? kResultOk : kResultFalse;
	}
	tresult PLUGIN_API getState (IBStream* s) override
	{
		int32 w = 0;
		return s && s->write ((void*)"CTL1", 4, &w) == kResultOk ? kResultOk : kResultFalse;
	}
	int32 PLUGIN_API getParameterCount () override { return kNumParams; }
	tresult PLUGIN_API getParameterInfo (int32 i, ParameterInfo& info) override
	{
		if (i < 0 || i >= kNumParams)
			return kInvalidArgument;
		info.id = (ParamID)i;
		toStr16 (kP[i].title, info.title, 128);
		toStr16 (kP[i].shortTitle, info.shortTitle, 128);
		toStr16 (kP[i].units, info.units, 128);
		info.stepCount = kP[i].steps;
		info.defaultNormalizedValue = toNorm (i, kP[i].def);
		info.unitId = kRootUnitId;
		info.flags = kP[i].flags;
		return kResultOk;
	}
	tresult PLUGIN_API getParamStringByValue (ParamID id, ParamValue v, String128 s) override
	{
		if (id >= kNumParams)
			return kInvalidArgument;
		toStr16 (toText ((int)id, v).c_str (), s, 128);
		return kResultOk;
	}
	tresult PLUGIN_API getParamValueByString (ParamID id, TChar* s, ParamValue& v) override
	{
		if (id >= kNumParams || !s)
			return kInvalidArgument;
		return fromText ((int)id, fromStr16 (s), v) ? kResultOk : kResultFalse;
	}
	ParamValue PLUGIN_API normalizedParamToPlain (ParamID id, ParamValue v) override
	{
		return id < kNumParams ? toPlain ((int)id, v) : v;
	}
	ParamValue PLUGIN_API plainParamToNormalized (ParamID id, ParamValue v) override
	{
		return id < kNumParams ? toNorm ((int)id, v) : v;
	}
	ParamValue PLUGIN_API getParamNormalized (ParamID id) override { return id < kNumParams ? p[id] : 0; }
	tresult PLUGIN_API setParamNormalized (ParamID id, ParamValue v) override
	{
		if (id >= kNumParams)
			return kInvalidArgument;
		p[id] = clamp01 (v);
		if (editorWnd)
			InvalidateRect (editorWnd, nullptr, FALSE);
		return kResultOk;
	}
	tresult PLUGIN_API setComponentHandler (IComponentHandler* h) override
	{
		if (h)
			h->addRef ();
		if (handler)
			handler->release ();
		handler = h;
		return kResultOk;
	}
	IPlugView* PLUGIN_API createView (FIDString name) override;
	// IMidiMapping
	tresult PLUGIN_API getMidiControllerAssignment (int32 bus, int16, CtrlNumber cc, ParamID& id) override
	{
		if (bus != 0)
			return kResultFalse;
		if (cc == kPitchBend)
		{
			id = pBend;
			return kResultTrue;
		}
		if (cc == kCtrlModWheel)
		{
			id = pMod;
			return kResultTrue;
		}
		return kResultFalse;
	}
	// IConnectionPoint
	tresult PLUGIN_API connect (IConnectionPoint* other) override
	{
		if (!other || peer)
			return kResultFalse;
		peer = other;
		peer->addRef ();
		return kResultOk;
	}
	tresult PLUGIN_API disconnect (IConnectionPoint* other) override
	{
		if (peer && other == peer)
		{
			peer->release ();
			peer = nullptr;
			return kResultOk;
		}
		return kResultFalse;
	}
	tresult PLUGIN_API notify (IMessage* m) override
	{
		if (m && m->getMessageID () && strcmp (m->getMessageID (), "hello") == 0)
		{
			int64 v = 0;
			if (m->getAttributes () && m->getAttributes ()->getInt ("value", v) == kResultTrue)
				helloValue = (int)v;
		}
		return kResultOk;
	}
	// edits from the editor
	void edit (int id, double v, int phase /*0 begin, 1 perform, 2 end, 3 all*/)
	{
		v = clamp01 (v);
		if (bug ("noedit"))
		{
			p[id] = v;
			return;
		}
		if (!handler)
			return;
		if (phase == 0 || phase == 3)
			handler->beginEdit ((ParamID)id);
		if (phase == 1 || phase == 3)
		{
			p[id] = kP[id].steps ? std::round (v * kP[id].steps) / kP[id].steps : v;
			handler->performEdit ((ParamID)id, p[id]);
		}
		if (phase == 2 || phase == 3)
			handler->endEdit ((ParamID)id);
	}

	tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override
	{
		QI (IEditController)
		QI (IPluginBase)
		QI (IMidiMapping)
		QI (IConnectionPoint)
		if (FUnknownPrivate::iidEqual (iid, FUnknown::iid))
		{
			addRef ();
			*obj = static_cast<IEditController*> (this);
			return kResultOk;
		}
		*obj = nullptr;
		return kNoInterface;
	}
	REFCOUNT
};

class View final : public IPlugView, public IPlugViewContentScaleSupport
{
public:
	Controller* ctrl;
	IPlugFrame* frame = nullptr;
	HWND wnd = nullptr;
	float scale = 1.f;
	int dragKnob = -1, dragY = 0;
	double dragStart = 0;
	int tick = 0;

	explicit View (Controller* c) : ctrl (c) { ctrl->addRef (); }
	~View ()
	{
		if (wnd && !bug ("leakview"))
			DestroyWindow (wnd);
		ctrl->editorWnd = nullptr;
		ctrl->release ();
	}
	int W () const { return (int)std::lround (1100 * scale); }
	int H () const { return (int)std::lround (720 * scale); }

	tresult PLUGIN_API isPlatformTypeSupported (FIDString t) override
	{
		return (t && strcmp (t, kPlatformTypeHWND) == 0) ? kResultTrue : kResultFalse;
	}
	tresult PLUGIN_API attached (void* parent, FIDString t) override
	{
		if (!parent || isPlatformTypeSupported (t) != kResultTrue)
			return kResultFalse;
		if (!g_classRegistered)
		{
			WNDCLASSEXW wc {};
			wc.cbSize = sizeof wc;
			wc.lpfnWndProc = viewProc;
			wc.hInstance = g_hinst;
			wc.hCursor = LoadCursor (nullptr, IDC_ARROW);
			wc.lpszClassName = kViewClass;
			wc.style = CS_DBLCLKS;
			RegisterClassExW (&wc);
			g_classRegistered = true;
		}
		wnd = CreateWindowExW (0, kViewClass, L"", WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS, 0, 0, W (), H (), (HWND)parent,
		                       nullptr, g_hinst, nullptr);
		if (!wnd)
			return kResultFalse;
		SetWindowLongPtrW (wnd, GWLP_USERDATA, (LONG_PTR)this);
		SetTimer (wnd, 1, 40, nullptr);
		ctrl->editorWnd = wnd;
		return kResultOk;
	}
	tresult PLUGIN_API removed () override
	{
		if (wnd)
		{
			KillTimer (wnd, 1);
			SetWindowLongPtrW (wnd, GWLP_USERDATA, 0);
			if (!bug ("leakview"))
				DestroyWindow (wnd);
			wnd = nullptr;
		}
		ctrl->editorWnd = nullptr;
		return kResultOk;
	}
	tresult PLUGIN_API onWheel (float) override { return kResultFalse; }
	tresult PLUGIN_API onKeyDown (char16, int16, int16) override { return kResultFalse; }
	tresult PLUGIN_API onKeyUp (char16, int16, int16) override { return kResultFalse; }
	tresult PLUGIN_API getSize (ViewRect* r) override
	{
		if (!r)
			return kInvalidArgument;
		*r = ViewRect (0, 0, W (), H ());
		return kResultOk;
	}
	tresult PLUGIN_API onSize (ViewRect* r) override
	{
		if (wnd && r)
			MoveWindow (wnd, 0, 0, r->getWidth (), r->getHeight (), TRUE);
		return kResultOk;
	}
	tresult PLUGIN_API onFocus (TBool) override { return kResultOk; }
	tresult PLUGIN_API setFrame (IPlugFrame* f) override
	{
		frame = f;
		return kResultOk;
	}
	tresult PLUGIN_API canResize () override { return kResultFalse; }
	tresult PLUGIN_API checkSizeConstraint (ViewRect* r) override
	{
		if (r)
			*r = ViewRect (0, 0, W (), H ());
		return kResultOk;
	}
	tresult PLUGIN_API setContentScaleFactor (ScaleFactor f) override
	{
		if (bug ("noscale"))
			return kResultFalse;
		scale = f;
		if (wnd && frame)
		{
			ViewRect r (0, 0, W (), H ());
			frame->resizeView (this, &r);
		}
		return kResultOk;
	}

	int knobAt (int x, int y) const
	{
		for (int k = 0; k < (int)(sizeof kKnobs / sizeof kKnobs[0]); k++)
		{
			int dx = x - kKnobs[k].cx, dy = y - kKnobs[k].cy, r = kKnobs[k].r + 6;
			if (dx * dx + dy * dy <= r * r)
				return k;
		}
		return -1;
	}
	void paint (HDC dc)
	{
		RECT rc;
		GetClientRect (wnd, &rc);
		HBRUSH bg = CreateSolidBrush (RGB (24, 26, 32));
		FillRect (dc, &rc, bg);
		DeleteObject (bg);
		auto S = [&] (int v) { return (int)std::lround (v * scale); };
		SetBkMode (dc, TRANSPARENT);
		HFONT font = CreateFontW (S (13), 0, 0, 0, FW_SEMIBOLD, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
		HGDIOBJ oldF = SelectObject (dc, font);
		// header + engine segment
		RECT hdr {0, 0, rc.right, S (48)};
		HBRUSH hb = CreateSolidBrush (RGB (36, 40, 52));
		FillRect (dc, &hdr, hb);
		DeleteObject (hb);
		SetTextColor (dc, RGB (120, 200, 255));
		TextOutW (dc, S (16), S (16), L"DUMMY SYNTH (vst3host self-test)", 33);
		for (int seg = 0; seg < 2; seg++)
		{
			RECT r {S (290 + seg * 132), S (9), S (290 + seg * 132 + 132), S (39)};
			bool sel = (p ()[pEngine] > 0.5) == (seg == 1);
			HBRUSH b = CreateSolidBrush (sel ? RGB (70, 140, 220) : RGB (50, 54, 66));
			FillRect (dc, &r, b);
			DeleteObject (b);
			SetTextColor (dc, RGB (230, 230, 230));
			DrawTextW (dc, seg ? L"B · ADDITIVE" : L"A · SUBTRACTIVE", -1, &r, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
		}
		// section frames
		HPEN pen = CreatePen (PS_SOLID, 1, RGB (70, 74, 90));
		HGDIOBJ oldP = SelectObject (dc, pen);
		HGDIOBJ oldB = SelectObject (dc, GetStockObject (NULL_BRUSH));
		int secs[][4] = {{12, 56, 544, 260}, {564, 56, 524, 260}, {12, 324, 336, 140}, {544, 324, 284, 140}, {700, 472, 388, 140}};
		for (auto& s : secs)
			Rectangle (dc, S (s[0]), S (s[1]), S (s[0] + s[2]), S (s[1] + s[3]));
		// a moving "scope"
		MoveToEx (dc, S (576), S (186), nullptr);
		for (int x = 0; x < 500; x += 4)
			LineTo (dc, S (576 + x), S (186 + (int)(60 * std::sin ((x + tick * 8) * 0.03))));
		// knobs
		for (auto& k : kKnobs)
		{
			double v = p ()[k.param];
			HBRUSH kb = CreateSolidBrush (RGB (60, 64, 80));
			HGDIOBJ ob = SelectObject (dc, kb);
			Ellipse (dc, S (k.cx - k.r), S (k.cy - k.r), S (k.cx + k.r), S (k.cy + k.r));
			SelectObject (dc, ob);
			DeleteObject (kb);
			double ang = (-135 + 270 * v) * 3.14159265 / 180.0;
			HPEN vp = CreatePen (PS_SOLID, std::max (1, S (3)), RGB (120, 200, 255));
			HGDIOBJ op = SelectObject (dc, vp);
			MoveToEx (dc, S (k.cx), S (k.cy), nullptr);
			LineTo (dc, S (k.cx) + (int)(S (k.r) * std::sin (ang)), S (k.cy) - (int)(S (k.r) * std::cos (ang)));
			SelectObject (dc, op);
			DeleteObject (vp);
			SetTextColor (dc, RGB (200, 200, 210));
			RECT lr {S (k.cx - 40), S (k.cy + k.r + 2), S (k.cx + 40), S (k.cy + k.r + 18)};
			DrawTextA (dc, k.label, -1, &lr, DT_CENTER | DT_SINGLELINE);
		}
		SelectObject (dc, oldB);
		SelectObject (dc, oldP);
		DeleteObject (pen);
		SelectObject (dc, oldF);
		DeleteObject (font);
	}
	const double* p () const { return ctrl->p; }
	LRESULT proc (UINT msg, WPARAM wp, LPARAM lp)
	{
		int x = (int)(short)LOWORD (lp), y = (int)(short)HIWORD (lp);
		int ux = (int)std::lround (x / scale), uy = (int)std::lround (y / scale);
		switch (msg)
		{
			case WM_PAINT:
			{
				PAINTSTRUCT ps;
				HDC dc = BeginPaint (wnd, &ps);
				paint (dc);
				EndPaint (wnd, &ps);
				return 0;
			}
			case WM_ERASEBKGND: return 1;
			case WM_TIMER:
				tick++;
				InvalidateRect (wnd, nullptr, FALSE);
				return 0;
			case WM_LBUTTONDOWN:
			{
				if (uy >= 9 && uy < 39 && ux >= 290 && ux < 554)
				{
					ctrl->edit (pEngine, ux < 422 ? 0.0 : 1.0, 3);
					InvalidateRect (wnd, nullptr, FALSE);
					return 0;
				}
				int k = knobAt (ux, uy);
				if (k >= 0)
				{
					dragKnob = k;
					dragY = y;
					dragStart = p ()[kKnobs[k].param];
					SetCapture (wnd);
					ctrl->edit (kKnobs[k].param, dragStart, 0);
				}
				return 0;
			}
			case WM_MOUSEMOVE:
				if (dragKnob >= 0 && (wp & MK_LBUTTON))
				{
					double v = clamp01 (dragStart + (dragY - y) / (200.0 * scale));
					ctrl->edit (kKnobs[dragKnob].param, v, 1);
					InvalidateRect (wnd, nullptr, FALSE);
				}
				return 0;
			case WM_LBUTTONUP:
				if (dragKnob >= 0)
				{
					ctrl->edit (kKnobs[dragKnob].param, 0, 2);
					dragKnob = -1;
					ReleaseCapture ();
				}
				return 0;
		}
		return DefWindowProcW (wnd, msg, wp, lp);
	}

	tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override
	{
		QI (IPlugView)
		if (!bug ("noscale"))
			QI (IPlugViewContentScaleSupport)
		if (FUnknownPrivate::iidEqual (iid, FUnknown::iid))
		{
			addRef ();
			*obj = static_cast<IPlugView*> (this);
			return kResultOk;
		}
		*obj = nullptr;
		return kNoInterface;
	}
	REFCOUNT
};

static LRESULT CALLBACK viewProc (HWND h, UINT msg, WPARAM wp, LPARAM lp)
{
	auto* v = (View*)GetWindowLongPtrW (h, GWLP_USERDATA);
	if (v && v->wnd == h)
		return v->proc (msg, wp, lp);
	return DefWindowProcW (h, msg, wp, lp);
}

IPlugView* PLUGIN_API Controller::createView (FIDString name)
{
	if (!name || strcmp (name, ViewType::kEditor) != 0)
		return nullptr;
	return new View (this);
}

//==============================================================================
// Factory and module entry points
//==============================================================================
class Factory final : public IPluginFactory3
{
public:
	tresult PLUGIN_API getFactoryInfo (PFactoryInfo* info) override
	{
		*info = PFactoryInfo ("vst3host selftest", "https://example.invalid", "", PFactoryInfo::kUnicode);
		return kResultOk;
	}
	int32 PLUGIN_API countClasses () override { return 2; }
	tresult PLUGIN_API getClassInfo (int32 i, PClassInfo* ci) override
	{
		if (i == 0)
			*ci = PClassInfo (kProcCID.toTUID (), PClassInfo::kManyInstances, kVstAudioEffectClass, "DummySynth");
		else if (i == 1)
			*ci = PClassInfo (kCtrlCID.toTUID (), PClassInfo::kManyInstances, kVstComponentControllerClass, "DummySynth Controller");
		else
			return kInvalidArgument;
		return kResultOk;
	}
	tresult PLUGIN_API getClassInfo2 (int32 i, PClassInfo2* ci) override
	{
		PClassInfo c;
		if (getClassInfo (i, &c) != kResultOk)
			return kInvalidArgument;
		*ci = PClassInfo2 (c.cid, c.cardinality, c.category, c.name, 0, i == 0 ? "Instrument|Synth" : "", "vst3host selftest",
		                   "1.0.0", "VST 3.8.1");
		return kResultOk;
	}
	tresult PLUGIN_API getClassInfoUnicode (int32 i, PClassInfoW* ci) override
	{
		PClassInfo2 c2;
		if (getClassInfo2 (i, &c2) != kResultOk)
			return kInvalidArgument;
		ci->fromAscii (c2);
		return kResultOk;
	}
	tresult PLUGIN_API setHostContext (FUnknown*) override { return kResultOk; }
	tresult PLUGIN_API createInstance (FIDString cid, FIDString iid, void** obj) override
	{
		*obj = nullptr;
		FUnknown* o = nullptr;
		if (FUnknownPrivate::iidEqual (cid, kProcCID.toTUID ()))
			o = static_cast<IComponent*> (new Processor ());
		else if (FUnknownPrivate::iidEqual (cid, kCtrlCID.toTUID ()))
			o = static_cast<IEditController*> (new Controller ());
		if (!o)
			return kNoInterface;
		tresult r = o->queryInterface (iid, obj);
		o->release ();
		return r;
	}
	tresult PLUGIN_API queryInterface (const TUID iid, void** obj) override
	{
		QI (IPluginFactory3)
		QI (IPluginFactory2)
		QI (IPluginFactory)
		if (FUnknownPrivate::iidEqual (iid, FUnknown::iid))
		{
			addRef ();
			*obj = static_cast<IPluginFactory*> (this);
			return kResultOk;
		}
		*obj = nullptr;
		return kNoInterface;
	}
	uint32 PLUGIN_API addRef () override { return 1; }
	uint32 PLUGIN_API release () override { return 1; }
};
static Factory g_factory;

extern "C" {
__declspec (dllexport) IPluginFactory* PLUGIN_API GetPluginFactory () { return &g_factory; }
__declspec (dllexport) bool InitDll ()
{
	const char* b = getenv ("DUMMYSYNTH_BUGS");
	g_bugs = b ? b : "";
	return true;
}
__declspec (dllexport) bool ExitDll ()
{
	if (g_classRegistered)
		UnregisterClassW (kViewClass, g_hinst);
	g_classRegistered = false;
	return true;
}
}

BOOL WINAPI DllMain (HINSTANCE h, DWORD reason, LPVOID)
{
	if (reason == DLL_PROCESS_ATTACH)
		g_hinst = h;
	return TRUE;
}
