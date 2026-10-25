// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// host.cpp - vst3host: a minimal but faithful VST3 host that validates the
// Wavelet Synthesizer instrument the way a DAW (modelled on Ableton Live on
// Windows) drives it.
//
//   Usage: vst3host.exe <path-to-.vst3-bundle-or-dll> <outdir> [options]
//     --sr <hz>          sample rate for the main renders (default 48000)
//     --block <n>        block size for the main renders (default 512)
//     --quick            shorter stress tests (skips block size 1)
//     --skip-editor      do not open the editor
//     --real-input       drive the editor with real mouse input (SendInput)
//                        instead of window messages (moves the cursor!)
//     --drag x,y         editor point to drag (1x editor pixels, repeatable)
//     --click x,y        editor point to click (1x editor pixels, repeatable)
//     --no-reload        skip the unload/reload cycle at the end
//     --timeout <s>      hang watchdog timeout (default 90 s)
//
// Everything is in one translation unit (host.cpp + host_util.h +
// host_objects.h); host.cpp defines INIT_CLASS_IID so the interface IDs of all
// included VST3 headers are instantiated here. pluginterfaces/base/funknown.cpp
// (FUID implementation) is compiled alongside. See build.bat.
//
// Exit code: 0 = no FAIL (warnings allowed), 1 = at least one FAIL,
//            2 = plug-in could not be loaded, 3 = crash/abort, 4 = hang, 64 = usage.

#define NOMINMAX
#include <windows.h>
#include <windowsx.h>
#include <objbase.h>
#include <ole2.h>
#include <psapi.h>
#include <dbghelp.h>
#include <tlhelp32.h>
#include <shellapi.h>
#include <gdiplus.h>
#include <xmmintrin.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <csignal>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <functional>
#include <map>
#include <numeric>
#include <memory>
#include <mutex>
#include <random>
#include <set>
#include <string>
#include <thread>
#include <type_traits>
#include <vector>

// ---- VST3 interfaces (this TU instantiates their IIDs) -----------------------
#define INIT_CLASS_IID
#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/base/ipluginbase.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/gui/iplugviewcontentscalesupport.h"
#include "pluginterfaces/vst/ivstattributes.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstautomationstate.h"
#include "pluginterfaces/vst/ivstchannelcontextinfo.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivstcontextmenu.h"
#include "pluginterfaces/vst/ivstdataexchange.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivsthostapplication.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstmidicontrollers.h"
#include "pluginterfaces/vst/ivstmidilearn.h"
#include "pluginterfaces/vst/ivstnoteexpression.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstparameterfunctionname.h"
#include "pluginterfaces/vst/ivstphysicalui.h"
#include "pluginterfaces/vst/ivstpluginterfacesupport.h"
#include "pluginterfaces/vst/ivstprefetchablesupport.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "pluginterfaces/vst/ivstremapparamid.h"
#include "pluginterfaces/vst/ivstunits.h"
#include "pluginterfaces/vst/vstspeaker.h"

#include "host_util.h"
#include "host_objects.h"

#ifndef PW_RENDERFULLCONTENT
#define PW_RENDERFULLCONTENT 0x00000002
#endif

//==============================================================================
// Options
//==============================================================================
struct Options
{
	std::wstring pluginPath, outDir;
	double sr = 48000;
	int32 block = 512;
	bool quick = false, skipEditor = false, realInput = false, noReload = false;
	bool pace = false;              // pace every render at real time (like DAW playback)
	std::wstring presetsFile;       // --presets (default: presets_spec.txt next to the exe)
	std::set<std::string> only;     // run only these sections (empty = all)
	std::vector<POINT> drags, clicks; // 1x editor coordinates; empty = defaults
	double timeoutSec = 90;
};
static Options g_opt;
static bool want (const char* sec) { return g_opt.only.empty () || g_opt.only.count (sec) > 0; }

static std::wstring outPath (const std::string& name) { return g_opt.outDir + L"\\" + u2w (name); }

//==============================================================================
// Main-thread message pump (a DAW's UI thread keeps pumping while audio runs)
//==============================================================================
static void pumpOnce ()
{
	MSG msg;
	int n = 0;
	while (n++ < 200 && PeekMessageW (&msg, nullptr, 0, 0, PM_REMOVE))
	{
		std::string err = tryCall ([&] {
			TranslateMessage (&msg);
			DispatchMessageW (&msg);
		});
		if (!err.empty ())
			fail ("crash while dispatching a window message (editor/timer code)",
			      strf ("msg 0x%04X to hwnd %p: %s", msg.message, (void*)msg.hwnd, err.c_str ()));
	}
}

static void pump (int ms)
{
	double end = nowMs () + ms;
	do
	{
		pumpOnce ();
		beat ();
		Sleep (1);
	} while (nowMs () < end);
}

//==============================================================================
// Scenario: notes and parameter automation at absolute sample positions
//==============================================================================
struct NoteEv
{
	int64 t;
	bool on;
	int16 pitch;
	float vel;
	int32 noteId;
};
struct ParamEv
{
	int64 t;
	ParamID id;
	double v;
};
struct NoteSpan
{
	int pitch;
	int64 on, off;
};
struct Scenario
{
	std::string name;
	int64 length = 0;
	std::vector<NoteEv> notes;
	std::vector<ParamEv> params;
	std::vector<NoteSpan> spans;

	void noteOn (int64 t, int pitch, float vel, int32 id = -1) { notes.push_back ({t, true, (int16)pitch, vel, id}); }
	void noteOff (int64 t, int pitch, int32 id = -1) { notes.push_back ({t, false, (int16)pitch, 0.f, id}); }
	void note (int64 on, int64 off, int pitch, float vel, int32 id = -1)
	{
		noteOn (on, pitch, vel, id);
		noteOff (off, pitch, id);
		spans.push_back ({pitch, on, off});
	}
	void param (int64 t, ParamID id, double v) { params.push_back ({t, id, v}); }
	void finish (int64 len)
	{
		// stable: at equal times keep insertion order (note-off before a re-trigger note-on)
		std::stable_sort (notes.begin (), notes.end (), [] (const NoteEv& a, const NoteEv& b) { return a.t < b.t; });
		std::stable_sort (params.begin (), params.end (), [] (const ParamEv& a, const ParamEv& b) { return a.t < b.t; });
		length = len;
	}
};

//==============================================================================
// Instance: one plug-in instance (component + controller) plus host plumbing
//==============================================================================
static const float kSentinel = 1.0e30f; // written into output buffers before process()
// process() calls that returned with a different MXCSR (FTZ/DAZ/rounding) than they were entered with
static std::atomic<int> g_mxcsrChanged {0};
static std::atomic<unsigned> g_mxcsrBefore {0}, g_mxcsrAfter {0};

struct RenderOptions
{
	int32 block = 512;
	bool randomBlocks = false;   // vary block size 1..block
	uint32 seed = 1;
	bool reset = true;           // setProcessing(false)/setActive(false/true)/setProcessing(true) first
	bool forwardUIEdits = true;  // send IComponentHandler::performEdit values to the processor
	bool realtime = g_opt.pace;  // pace blocks to the wall clock (--pace)
	bool loop = false;           // loop the scenario until *stop (background audio)
	std::atomic<bool>* stop = nullptr;
	std::function<void (int64, int32)> perBlock; // audio thread, before process()
	std::function<void ()> mainTask;             // main thread, repeatedly while rendering
};

struct RenderResult
{
	std::vector<float> L, R;
	int64 frames = 0, nan = 0, inf = 0, unclearedNoFlag = 0, unclearedWithFlag = 0, silenceFlagLies = 0;
	int calls = 0, errors = 0;
	tresult firstError = kResultOk;
	bool crashed = false;
	std::string crash;
	double totalUs = 0, maxUs = 0, maxLoad = 0;
	int overruns = 0;
	std::vector<std::pair<int64, float>> blockUs; // (block start, microseconds)
	int outParamPoints = 0;
	double peak = 0; // tracked even when samples are not kept (background renders)
};

struct ParamRec
{
	ParameterInfo info {};
	std::string title, shortTitle, units;
};

struct Instance
{
	std::string label; // "" for the main instance, " #2" etc.
	IComponent* comp = nullptr;
	IAudioProcessor* proc = nullptr;
	IEditController* ctrl = nullptr;
	bool singleComponent = false;
	IConnectionPoint* compCP = nullptr;
	IConnectionPoint* ctrlCP = nullptr;
	bool connected = false;
	// optional: connect through wrappers (e.g. a pass-through proxy) instead of directly
	std::function<IConnectionPoint* (IConnectionPoint*)> connectWrap;
	IConnectionPoint* compPeer = nullptr; // what the component was connected to
	IConnectionPoint* ctrlPeer = nullptr; // what the controller was connected to
	ComponentHandler* handler = nullptr;
	std::vector<ParamRec> params;

	double sr = 48000;
	int32 maxBlock = 512;
	int32 processMode = kRealtime; // kRealtime or kOffline (export / freeze)
	bool active = false, processing = false;

	// processing plumbing (used on the audio thread)
	std::vector<float> bufL, bufR;
	float* chans[2] = {nullptr, nullptr};
	AudioBusBuffers outBus;
	ParameterChanges inParams, outParams;
	EventList inEvents, outEvents;
	ProcessContext ctx {};
	int64 pos = 0; // project position in samples
	std::mutex outMx;
	std::map<ParamID, double> outParamLast; // last values reported by the processor

	Instance ()
	{
		bufL.assign (8192, 0.f);
		bufR.assign (8192, 0.f);
		chans[0] = bufL.data ();
		chans[1] = bufR.data ();
	}

	std::string nm (const std::string& s) const { return s + label; }

	// ---------------------------------------------------------------- params
	void readParams ()
	{
		params.clear ();
		int32 n = 0;
		tryCall ([&] { n = ctrl->getParameterCount (); });
		for (int32 i = 0; i < n; i++)
		{
			ParamRec r;
			tresult res = kResultFalse;
			tryCall ([&] { res = ctrl->getParameterInfo (i, r.info); });
			if (res != kResultOk)
				continue;
			r.title = s16 (r.info.title);
			r.shortTitle = s16 (r.info.shortTitle);
			r.units = s16 (r.info.units);
			params.push_back (r);
		}
	}
	int findParam (const char* title) const
	{
		std::string t = lower (title);
		for (size_t i = 0; i < params.size (); i++)
			if (lower (params[i].title) == t)
				return (int)i;
		for (size_t i = 0; i < params.size (); i++)
			if (lower (params[i].shortTitle) == t)
				return (int)i;
		for (size_t i = 0; i < params.size (); i++)
			if (lower (params[i].title).find (t) != std::string::npos)
				return (int)i;
		return -1;
	}
	std::string paramName (ParamID id) const
	{
		for (auto& p : params)
			if (p.info.id == id)
				return strf ("'%s'(id %u)", p.title.c_str (), id);
		return strf ("id %u", id);
	}
	const ParamRec* paramById (ParamID id) const
	{
		for (auto& p : params)
			if (p.info.id == id)
				return &p;
		return nullptr;
	}

	// ---------------------------------------------------------------- state
	bool getState (std::vector<uint8_t>& out)
	{
		MemoryStream* s = new MemoryStream ();
		tresult r = kResultFalse;
		std::string err = tryCall ([&] { r = comp->getState (s); });
		out = s->data;
		s->release ();
		if (!err.empty ())
			fail (nm ("IComponent::getState crashed"), err);
		return err.empty () && r == kResultOk;
	}
	tresult setState (const std::vector<uint8_t>& d, std::string* crash = nullptr)
	{
		MemoryStream* s = new MemoryStream (d);
		tresult r = kResultFalse;
		std::string err = tryCall ([&] { r = comp->setState (s); });
		s->release ();
		if (crash)
			*crash = err;
		else if (!err.empty ())
			fail (nm ("IComponent::setState crashed"), err);
		return err.empty () ? r : kInternalError;
	}
	tresult setComponentStateOnController (const std::vector<uint8_t>& d, std::string* crash = nullptr)
	{
		MemoryStream* s = new MemoryStream (d);
		tresult r = kResultFalse;
		std::string err = tryCall ([&] { r = ctrl->setComponentState (s); });
		s->release ();
		if (crash)
			*crash = err;
		else if (!err.empty ())
			fail (nm ("IEditController::setComponentState crashed"), err);
		return err.empty () ? r : kInternalError;
	}
	// DAW "load state": component setState + controller setComponentState
	bool loadState (const std::vector<uint8_t>& d)
	{
		tresult a = setState (d);
		tresult b = setComponentStateOnController (d);
		return a == kResultOk && b == kResultOk;
	}

	// ---------------------------------------------------------------- activation
	bool setProcessingState (bool on)
	{
		tresult r = kResultFalse;
		setStep (nm (strf ("IAudioProcessor::setProcessing(%s)", on ? "true" : "false")));
		std::string err = tryCall ([&] { r = proc->setProcessing (on); });
		if (!err.empty ())
		{
			fail (nm (strf ("IAudioProcessor::setProcessing(%s) crashed", on ? "true" : "false")), err);
			return false;
		}
		processing = on;
		// kNotImplemented is accepted (the SDK base class returns it)
		return r == kResultOk || r == kNotImplemented;
	}
	bool setActiveState (bool on)
	{
		tresult r = kResultFalse;
		setStep (nm (strf ("IComponent::setActive(%s)", on ? "true" : "false")));
		std::string err = tryCall ([&] { r = comp->setActive (on); });
		if (!err.empty ())
		{
			fail (nm (strf ("IComponent::setActive(%s) crashed", on ? "true" : "false")), err);
			return false;
		}
		active = on;
		return r == kResultOk;
	}
	// Full DAW reconfiguration: stop, deactivate, setupProcessing, activate, start.
	bool configure (double newSr, int32 newMaxBlock, bool verbose)
	{
		bool ok = true;
		if (processing)
			ok &= setProcessingState (false);
		if (active)
			ok &= setActiveState (false);
		ProcessSetup setup {processMode, kSample32, newMaxBlock, newSr};
		tresult r = kResultFalse;
		std::string err = tryCall ([&] { r = proc->setupProcessing (setup); });
		if (!err.empty ())
			fail (nm ("IAudioProcessor::setupProcessing crashed"), err);
		if (verbose)
			check (r == kResultOk, nm (strf ("setupProcessing(%s, 32-bit, %.0f Hz, max %d)", processMode == kOffline ? "offline" : "realtime", newSr, newMaxBlock)),
			       strf ("returned %d", r));
		ok &= (r == kResultOk);
		sr = newSr;
		maxBlock = newMaxBlock;
		if ((int32)bufL.size () < newMaxBlock)
		{
			bufL.assign ((size_t)newMaxBlock, 0.f);
			bufR.assign ((size_t)newMaxBlock, 0.f);
			chans[0] = bufL.data ();
			chans[1] = bufR.data ();
		}
		bool a = setActiveState (true);
		if (verbose)
			check (a, nm ("setActive(true)"));
		bool p = setProcessingState (true);
		if (verbose)
			check (p, nm ("setProcessing(true)"), "kResultOk or kNotImplemented expected");
		return ok && a && p;
	}
	// What a DAW does on transport reset: stop + deactivate + activate + start.
	bool resetProcessing ()
	{
		bool ok = true;
		if (processing)
			ok &= setProcessingState (false);
		if (active)
			ok &= setActiveState (false);
		ok &= setActiveState (true);
		ok &= setProcessingState (true);
		pos = 0;
		return ok;
	}

	// ---------------------------------------------------------------- processing
	void fillContext ()
	{
		ctx = ProcessContext {};
		ctx.state = ProcessContext::kPlaying | ProcessContext::kTempoValid | ProcessContext::kTimeSigValid |
		            ProcessContext::kProjectTimeMusicValid | ProcessContext::kBarPositionValid |
		            ProcessContext::kSystemTimeValid | ProcessContext::kContTimeValid;
		ctx.sampleRate = sr;
		ctx.projectTimeSamples = pos;
		ctx.continousTimeSamples = pos;
		ctx.systemTime = (int64)(nowUs () * 1000.0);
		ctx.tempo = 120.0;
		ctx.timeSigNumerator = 4;
		ctx.timeSigDenominator = 4;
		ctx.projectTimeMusic = (double)pos / sr * ctx.tempo / 60.0;
		ctx.barPositionMusic = std::floor (ctx.projectTimeMusic / 4.0) * 4.0;
	}

	struct BlockOutcome
	{
		std::string crash;
		tresult r = kResultOk;
		double us = 0;
	};

	// One process() call of n samples with whatever is in inEvents/inParams.
	BlockOutcome processBlock (int32 n, bool withOutputs = true)
	{
		BlockOutcome o;
		for (int32 i = 0; i < n; i++)
			bufL[(size_t)i] = bufR[(size_t)i] = kSentinel;
		outBus.numChannels = 2;
		outBus.silenceFlags = 0;
		outBus.channelBuffers32 = chans;
		ProcessData d;
		d.processMode = processMode;
		d.symbolicSampleSize = kSample32;
		d.numSamples = n;
		d.numInputs = 0;
		d.inputs = nullptr;
		d.numOutputs = withOutputs ? 1 : 0;
		d.outputs = withOutputs ? &outBus : nullptr;
		d.inputParameterChanges = &inParams;
		d.outputParameterChanges = &outParams;
		d.inputEvents = &inEvents;
		d.outputEvents = &outEvents;
		fillContext ();
		d.processContext = &ctx;
		double t0 = nowUs ();
		const unsigned csr0 = _mm_getcsr ();
		o.crash = tryCall ([&] { o.r = proc->process (d); });
		const unsigned csr1 = _mm_getcsr ();
		o.us = nowUs () - t0;
		if (csr1 != csr0)
		{
			if (g_mxcsrChanged++ == 0)
			{
				g_mxcsrBefore = csr0;
				g_mxcsrAfter = csr1;
			}
			_mm_setcsr (csr0); // keep the host's FPU mode for the rest of the test
		}
		pos += n;
		return o;
	}

	void addNoteEvent (const NoteEv& ne, int32 offset)
	{
		Event e {};
		e.busIndex = 0;
		e.sampleOffset = offset;
		e.ppqPosition = (double)(pos + offset) / sr * 2.0; // 120 BPM
		e.flags = 0;
		if (ne.on)
		{
			e.type = Event::kNoteOnEvent;
			e.noteOn.channel = 0;
			e.noteOn.pitch = ne.pitch;
			e.noteOn.tuning = 0.f;
			e.noteOn.velocity = ne.vel;
			e.noteOn.length = 0;
			e.noteOn.noteId = ne.noteId;
		}
		else
		{
			e.type = Event::kNoteOffEvent;
			e.noteOff.channel = 0;
			e.noteOff.pitch = ne.pitch;
			e.noteOff.velocity = 0.f;
			e.noteOff.noteId = ne.noteId;
			e.noteOff.tuning = 0.f;
		}
		inEvents.addEvent (e);
	}

	// Feeds a scenario block by block.
	struct Cursor
	{
		const Scenario* s = nullptr;
		size_t ni = 0, pi = 0;
		void fill (Instance& in, int64 start, int32 n)
		{
			while (ni < s->notes.size () && s->notes[ni].t < start + n)
			{
				in.addNoteEvent (s->notes[ni], (int32)std::max<int64> (0, s->notes[ni].t - start));
				ni++;
			}
			while (pi < s->params.size () && s->params[pi].t < start + n)
			{
				in.inParams.add (s->params[pi].id, (int32)std::max<int64> (0, s->params[pi].t - start), s->params[pi].v);
				pi++;
			}
		}
	};

	void collectBlock (RenderResult& res, int32 n, int64 at, bool keep)
	{
		for (int ch = 0; ch < 2; ch++)
		{
			float* b = ch ? bufR.data () : bufL.data ();
			bool flag = (outBus.silenceFlags >> ch) & 1;
			for (int32 i = 0; i < n; i++)
			{
				float x = b[i];
				if (std::isnan (x))
				{
					res.nan++;
					x = 0;
				}
				else if (std::isinf (x))
				{
					res.inf++;
					x = 0;
				}
				else if (std::fabs (x) >= 1e29f)
				{
					(flag ? res.unclearedWithFlag : res.unclearedNoFlag)++;
					x = 0;
				}
				else if (flag && x != 0.f)
					res.silenceFlagLies++;
				res.peak = std::max (res.peak, (double)std::fabs (x));
				if (keep && at + i < (int64)res.L.size ())
					(ch ? res.R : res.L)[(size_t)(at + i)] = x;
			}
		}
		// output parameter changes (e.g. meters): a DAW forwards them to the controller
		if (outParams.used)
		{
			std::lock_guard<std::mutex> lk (outMx);
			for (int32 q = 0; q < outParams.used; q++)
			{
				auto* qq = outParams.queues[(size_t)q].get ();
				res.outParamPoints += (int)qq->points.size ();
				if (!qq->points.empty ())
					outParamLast[qq->id] = qq->points.back ().value;
			}
		}
	}

	void audioLoop (const Scenario& s, const RenderOptions& opt, RenderResult& res)
	{
		g_audioThreadId = GetCurrentThreadId ();
		// Like a DAW audio thread: MMCSS "Pro Audio" class (no FTZ/DAZ set by the host).
		HANDLE mmcss = nullptr;
		typedef HANDLE (WINAPI * AvSet) (LPCWSTR, LPDWORD);
		typedef BOOL (WINAPI * AvRevert) (HANDLE);
		HMODULE avrt = LoadLibraryW (L"avrt.dll");
		if (avrt)
		{
			DWORD idx = 0;
			if (auto f = (AvSet)(void*)GetProcAddress (avrt, "AvSetMmThreadCharacteristicsW"))
				mmcss = f (L"Pro Audio", &idx);
		}
		Cursor cur {&s};
		std::mt19937 rng (opt.seed);
		int64 p = 0, rendered = 0;
		const double t0 = nowMs ();
		const bool keep = !opt.loop;
		for (;;)
		{
			if (opt.stop && opt.stop->load ())
				break;
			if (p >= s.length)
			{
				if (!opt.loop)
					break;
				p = 0;
				cur = Cursor {&s};
			}
			int32 n = opt.randomBlocks ? (int32)(1 + rng () % (uint32)opt.block) : opt.block;
			n = (int32)std::min<int64> (n, s.length - p);
			n = std::min (n, maxBlock);
			inEvents.clear ();
			inParams.clear ();
			outParams.clear ();
			outEvents.clear ();
			if (opt.forwardUIEdits && handler)
				handler->drainPending ([&] (ParamID id, double v) { inParams.add (id, 0, v); });
			cur.fill (*this, p, n);
			if (opt.perBlock)
				opt.perBlock (p, n);
			BlockOutcome o = processBlock (n);
			res.calls++;
			if (!o.crash.empty ())
			{
				res.crashed = true;
				res.crash = strf ("at sample %lld (block of %d): %s", (long long)p, n, o.crash.c_str ());
				break;
			}
			if (o.r != kResultOk)
			{
				if (!res.errors)
					res.firstError = o.r;
				res.errors++;
			}
			collectBlock (res, n, p, keep);
			res.totalUs += o.us;
			res.maxUs = std::max (res.maxUs, o.us);
			double budget = n / sr * 1e6;
			res.maxLoad = std::max (res.maxLoad, o.us / budget);
			if (o.us > budget && n >= 32)
				res.overruns++;
			if (keep)
				res.blockUs.push_back ({p, (float)o.us});
			p += n;
			rendered += n;
			res.frames += n;
			beat ();
			if (opt.realtime)
			{
				double target = t0 + rendered / sr * 1000.0;
				while (nowMs () < target - 0.5 && !(opt.stop && opt.stop->load ()))
					Sleep (1);
			}
		}
		if (mmcss && avrt)
			if (auto f = (AvRevert)(void*)GetProcAddress (avrt, "AvRevertMmThreadCharacteristics"))
				f (mmcss);
		if (avrt)
			FreeLibrary (avrt);
		g_audioThreadId = 0;
	}

	RenderResult render (const Scenario& s, const RenderOptions& opt)
	{
		RenderResult res;
		if (opt.reset)
			resetProcessing ();
		setStep (nm ("render '" + s.name + "'"));
		if (!opt.loop)
		{
			res.L.assign ((size_t)s.length, 0.f);
			res.R.assign ((size_t)s.length, 0.f);
		}
		std::atomic<bool> done {false};
		std::thread th ([&] {
			audioLoop (s, opt, res);
			done = true;
		});
		while (!done.load ())
		{
			pumpOnce ();
			if (opt.mainTask)
				opt.mainTask ();
			else
				Sleep (1);
			beat ();
		}
		th.join ();
		applyOutputParams ();
		return res;
	}

	// background audio (used while the editor is open)
	std::thread bgThread;
	std::atomic<bool> bgStop {false};
	RenderResult bgResult;
	Scenario bgScenario;
	void startBackground (const Scenario& s)
	{
		bgScenario = s;
		bgStop = false;
		bgResult = RenderResult ();
		RenderOptions o;
		o.block = std::min<int32> (g_opt.block, maxBlock);
		o.realtime = true;
		o.loop = true;
		o.stop = &bgStop;
		bgThread = std::thread ([this, o] { audioLoop (bgScenario, o, bgResult); });
	}
	void stopBackground ()
	{
		if (!bgThread.joinable ())
			return;
		bgStop = true;
		while (g_audioThreadId.load () != 0 && bgThread.joinable ())
		{
			pumpOnce ();
			Sleep (1);
			if (g_audioThreadId.load () == 0)
				break;
		}
		bgThread.join ();
		applyOutputParams ();
	}

	void applyOutputParams ()
	{
		std::map<ParamID, double> m;
		{
			std::lock_guard<std::mutex> lk (outMx);
			m.swap (outParamLast);
		}
		for (auto& kv : m)
			tryCall ([&] { ctrl->setParamNormalized (kv.first, kv.second); });
	}

	// ---------------------------------------------------------------- teardown
	void destroy ()
	{
		setStep (nm ("teardown"));
		if (proc && processing)
			setProcessingState (false);
		if (comp && active)
			setActiveState (false);
		if (connected)
		{
			guarded (nm ("component IConnectionPoint::disconnect"), [&] { compCP->disconnect (compPeer ? compPeer : ctrlCP); });
			guarded (nm ("controller IConnectionPoint::disconnect"), [&] { ctrlCP->disconnect (ctrlPeer ? ctrlPeer : compCP); });
			connected = false;
			if (connectWrap)
			{
				if (compPeer)
					compPeer->release ();
				if (ctrlPeer)
					ctrlPeer->release ();
			}
			compPeer = ctrlPeer = nullptr;
		}
		if (ctrl && !singleComponent)
			guarded (nm ("IEditController::terminate"), [&] { ctrl->terminate (); });
		if (comp)
			guarded (nm ("IComponent::terminate"), [&] { comp->terminate (); });
		auto rel = [&] (FUnknown*& u, const char* what) {
			if (!u)
				return;
			uint32 rc = 0;
			guarded (nm (strf ("release %s", what)), [&] { rc = u->release (); });
			if (std::string (what) == "component" || std::string (what) == "controller")
				LOG ("  %s%s released (refcount returned: %u)", what, label.c_str (), rc);
			u = nullptr;
		};
		FUnknown* u;
		u = compCP;
		rel (u, "component IConnectionPoint");
		compCP = nullptr;
		u = ctrlCP;
		rel (u, "controller IConnectionPoint");
		ctrlCP = nullptr;
		u = proc;
		rel (u, "IAudioProcessor");
		proc = nullptr;
		u = ctrl;
		rel (u, "controller");
		ctrl = nullptr;
		u = comp;
		rel (u, "component");
		comp = nullptr;
	}
};

//==============================================================================
// Module loading (bundle layout, PE checks, LoadLibrary, InitDll, factory)
//==============================================================================
typedef IPluginFactory* (PLUGIN_API* GetFactoryProc) ();
typedef bool (PLUGIN_API* ModuleProc) ();

struct Module
{
	std::wstring dll;
	HMODULE h = nullptr;
	IPluginFactory* factory = nullptr;
	IPluginFactory2* f2 = nullptr;
	IPluginFactory3* f3 = nullptr;
	ModuleProc exitDll = nullptr;
	PClassInfo procClass {};
	std::string pluginName;
	bool haveProc = false;
};

// Resolve "X.vst3" bundle folder -> X.vst3/Contents/x86_64-win/X.vst3
static bool resolveDll (const std::wstring& path, std::wstring& dll, bool verbose)
{
	std::wstring p = path;
	while (!p.empty () && (p.back () == L'\\' || p.back () == L'/'))
		p.pop_back ();
	if (dirExists (p))
	{
		std::wstring name = p.substr (p.find_last_of (L"/\\") + 1);
		if (verbose)
		{
			LOG ("  bundle folder: %s", w2u (p).c_str ());
			check (lower (w2u (name)).size () > 5 && lower (w2u (name)).substr (lower (w2u (name)).size () - 5) == ".vst3",
			       "bundle folder name ends with .vst3", w2u (name));
			check (dirExists (p + L"\\Contents\\x86_64-win"), "bundle has Contents\\x86_64-win");
			bool mi = fileExists (p + L"\\Contents\\Resources\\moduleinfo.json");
			if (mi)
				LOG ("  Contents\\Resources\\moduleinfo.json present");
			else
				LOG ("  (info) no Contents\\Resources\\moduleinfo.json (optional, VST 3.7.5+ hosts use it for fast scanning)");
		}
		dll = p + L"\\Contents\\x86_64-win\\" + name;
		if (!fileExists (dll))
		{
			// list what is there to make the failure actionable
			std::string found;
			WIN32_FIND_DATAW fd;
			HANDLE hf = FindFirstFileW ((p + L"\\Contents\\x86_64-win\\*").c_str (), &fd);
			if (hf != INVALID_HANDLE_VALUE)
			{
				do
					if (fd.cFileName[0] != L'.')
						found += " " + w2u (fd.cFileName);
				while (FindNextFileW (hf, &fd));
				FindClose (hf);
			}
			if (verbose)
				fail ("plugin binary present at Contents\\x86_64-win\\" + w2u (name),
				      found.empty () ? "folder missing or empty" : "found instead:" + found);
			return false;
		}
		return true;
	}
	if (fileExists (p))
	{
		if (verbose)
			LOG ("  (info) single-file .vst3 (legacy layout, VST 3.6.10+ hosts expect the bundle folder)");
		dll = p;
		return true;
	}
	if (verbose)
		fail ("plugin path exists", w2u (p) + " not found");
	return false;
}

static std::map<std::string, std::string> g_verInfo; // DLL version resource strings

static void readVersionResource (const std::wstring& dll)
{
	DWORD h = 0, n = GetFileVersionInfoSizeW (dll.c_str (), &h);
	if (!n)
		return;
	std::vector<uint8_t> buf (n);
	if (!GetFileVersionInfoW (dll.c_str (), 0, n, buf.data ()))
		return;
	VS_FIXEDFILEINFO* ffi = nullptr;
	UINT len = 0;
	if (VerQueryValueW (buf.data (), L"\\", (void**)&ffi, &len) && ffi)
		g_verInfo["(fixed) FileVersion"] = strf ("%u.%u.%u.%u", HIWORD (ffi->dwFileVersionMS), LOWORD (ffi->dwFileVersionMS),
		                                        HIWORD (ffi->dwFileVersionLS), LOWORD (ffi->dwFileVersionLS));
	struct LangCp
	{
		WORD lang, cp;
	}* tr = nullptr;
	if (!VerQueryValueW (buf.data (), L"\\VarFileInfo\\Translation", (void**)&tr, &len) || !tr || len < sizeof (LangCp))
		return;
	for (const wchar_t* key : {L"CompanyName", L"ProductName", L"FileDescription", L"FileVersion", L"ProductVersion", L"LegalCopyright"})
	{
		wchar_t q[128];
		swprintf (q, 128, L"\\StringFileInfo\\%04x%04x\\%s", tr->lang, tr->cp, key);
		wchar_t* v = nullptr;
		if (VerQueryValueW (buf.data (), q, (void**)&v, &len) && v && len)
			g_verInfo[w2u (key)] = w2u (v);
	}
}

static bool loadModule (Module& m, const std::wstring& path, HostApplication* host, bool verbose)
{
	if (!resolveDll (path, m.dll, verbose))
		return false;
	std::wstring dllDir = m.dll.substr (0, m.dll.find_last_of (L"/\\"));
	if (verbose)
		LOG ("  plugin DLL: %s", w2u (m.dll).c_str ());
	PeInfo pe = verbose ? inspectPe (m.dll) : PeInfo ();
	// (when the file is not a valid PE image, LoadLibrary below reports the OS error)
	if (verbose && check (pe.ok && pe.error.empty (), "DLL is a valid 64-bit PE image", pe.error))
	{
		check (pe.machine == IMAGE_FILE_MACHINE_AMD64, "DLL machine type is x64 (AMD64)", strf ("0x%04X", pe.machine));
		check (pe.isDll, "PE image is a DLL");
		readVersionResource (m.dll);
		check (!g_verInfo.empty (), "DLL has a version resource", "", Sev::Warn);
		for (auto& kv : g_verInfo)
			LOG ("  version resource %s: %s", kv.first.c_str (), kv.second.c_str ());
		std::string exps;
		for (auto& e : pe.exports)
			exps += " " + e;
		LOG ("  exports:%s", exps.c_str ());
		auto has = [&] (const char* n) { return std::find (pe.exports.begin (), pe.exports.end (), n) != pe.exports.end (); };
		check (has ("GetPluginFactory"), "exports GetPluginFactory (unmangled)", exps);
		check (has ("InitDll") && has ("ExitDll"), "exports InitDll and ExitDll (recommended on Windows)", exps,
		       Sev::Warn);
		int worst = 0;
		std::string bad;
		for (int dl = 0; dl < 2; dl++)
			for (auto& imp : dl ? pe.delayImports : pe.imports)
			{
				std::string why;
				int c = classifyDependency (imp, dllDir, why);
				LOG ("  imports %s%s: %s", imp.c_str (), dl ? " (delay-load)" : "", why.c_str ());
				if (c > 0 && !dl)
				{
					worst = std::max (worst, c);
					bad += " " + imp;
				}
			}
		if (worst == 2)
			fail ("DLL depends only on system DLLs", "non-system dependencies:" + bad +
			                                            " -> plugin will fail to load in Ableton on a machine without them");
		else if (worst == 1)
			warn ("DLL depends only on system DLLs", "dependencies not guaranteed on user machines:" + bad);
		else
			pass ("DLL depends only on system DLLs");
	}

	// Load like a clean end-user machine: application dir + System32 only (no PATH).
	setStep ("LoadLibrary");
	std::string err = tryCall ([&] { m.h = LoadLibraryExW (m.dll.c_str (), nullptr, LOAD_LIBRARY_SEARCH_DEFAULT_DIRS); });
	DWORD le = GetLastError ();
	if (!err.empty ())
	{
		fail ("LoadLibrary (DllMain / static initializers) crashed", err);
		return false;
	}
	if (verbose)
		check (m.h != nullptr, "LoadLibrary with clean-machine DLL search path (no PATH)",
		       m.h ? "" : winErr (le) + " (see non-system dependencies above)");
	if (!m.h)
	{
		// Retry with the normal search order (incl. PATH) so the remaining tests can still run.
		m.h = LoadLibraryW (m.dll.c_str ());
		if (!m.h)
		{
			if (verbose)
				fail ("LoadLibrary", winErr (GetLastError ()));
			return false;
		}
		if (verbose)
			LOG ("  (loaded with the default search path incl. PATH; continuing)");
	}
	auto initDll = (ModuleProc)(void*)GetProcAddress (m.h, "InitDll");
	m.exitDll = (ModuleProc)(void*)GetProcAddress (m.h, "ExitDll");
	if (initDll)
	{
		bool ok = false;
		if (guarded ("InitDll()", [&] { ok = initDll (); }) && verbose)
			check (ok, "InitDll() returns true");
	}
	auto gpf = (GetFactoryProc)(void*)GetProcAddress (m.h, "GetPluginFactory");
	if (!gpf)
	{
		fail ("GetProcAddress(GetPluginFactory)", "symbol not found");
		return false;
	}
	guarded ("GetPluginFactory()", [&] { m.factory = gpf (); });
	if (verbose)
		check (m.factory != nullptr, "GetPluginFactory() returns a factory");
	if (!m.factory)
		return false;
	m.factory->queryInterface (IPluginFactory2::iid, (void**)&m.f2);
	m.factory->queryInterface (IPluginFactory3::iid, (void**)&m.f3);
	if (m.f3)
	{
		tresult r = kResultFalse;
		guarded ("IPluginFactory3::setHostContext", [&] { r = m.f3->setHostContext (static_cast<IHostApplication*> (host)); });
		if (verbose)
			LOG ("  IPluginFactory3::setHostContext -> %d", r);
	}
	return true;
}

static void listFactory (Module& m)
{
	beginSection ("Factory");
	PFactoryInfo fi;
	tresult r = kResultFalse;
	guarded ("IPluginFactory::getFactoryInfo", [&] { r = m.factory->getFactoryInfo (&fi); });
	check (r == kResultOk, "getFactoryInfo");
	LOG ("  vendor '%s'  url '%s'  email '%s'  flags 0x%X%s", fi.vendor, fi.url, fi.email, fi.flags,
	     (fi.flags & PFactoryInfo::kUnicode) ? " (kUnicode)" : "");
	check ((fi.flags & PFactoryInfo::kUnicode) != 0, "factory flags include kUnicode", "", Sev::Warn);
	if (g_verInfo.count ("CompanyName"))
		check (g_verInfo["CompanyName"] == fi.vendor, "factory vendor equals the DLL CompanyName",
		       strf ("'%s' vs '%s'", fi.vendor, g_verInfo["CompanyName"].c_str ()), Sev::Warn);
	LOG ("  IPluginFactory2: %s, IPluginFactory3: %s", m.f2 ? "yes" : "no", m.f3 ? "yes" : "no");
	int32 n = 0;
	guarded ("IPluginFactory::countClasses", [&] { n = m.factory->countClasses (); });
	LOG ("  %d class(es):", n);
	int procCount = 0;
	for (int32 i = 0; i < n; i++)
	{
		PClassInfo ci;
		if (m.factory->getClassInfo (i, &ci) != kResultOk)
		{
			fail (strf ("getClassInfo(%d)", i));
			continue;
		}
		LOG ("  [%d] cid %s  category '%s'  name '%s'  cardinality 0x%X", i, tuidHex (ci.cid).c_str (), ci.category,
		     ci.name, ci.cardinality);
		std::string subcats;
		if (m.f2)
		{
			PClassInfo2 c2;
			if (m.f2->getClassInfo2 (i, &c2) == kResultOk)
			{
				subcats = c2.subCategories;
				if (std::string (ci.category) == kVstAudioEffectClass && g_verInfo.count ("FileVersion"))
				{
					std::string fv = g_verInfo["FileVersion"], cv = c2.version;
					check (fv.rfind (cv, 0) == 0 || cv.rfind (fv, 0) == 0, "class version matches the DLL FileVersion",
					       strf ("class '%s' vs file '%s'", cv.c_str (), fv.c_str ()), Sev::Warn);
					if (g_verInfo.count ("CompanyName"))
						check (g_verInfo["CompanyName"] == c2.vendor, "class vendor equals the DLL CompanyName",
						       strf ("'%s' vs '%s'", c2.vendor, g_verInfo["CompanyName"].c_str ()), Sev::Warn);
				}
				LOG ("       subCategories '%s'  vendor '%s'  version '%s'  sdk '%s'  classFlags 0x%X", c2.subCategories,
				     c2.vendor, c2.version, c2.sdkVersion, c2.classFlags);
			}
		}
		if (m.f3)
		{
			PClassInfoW cw;
			if (m.f3->getClassInfoUnicode (i, &cw) == kResultOk)
				LOG ("       (unicode) name '%s'  vendor '%s'  version '%s'", s16 (cw.name, 64).c_str (),
				     s16 (cw.vendor, 64).c_str (), s16 (cw.version, 64).c_str ());
		}
		if (std::string (ci.category) == kVstAudioEffectClass)
		{
			if (!m.haveProc)
			{
				m.procClass = ci;
				m.pluginName = ci.name;
				m.haveProc = true;
			}
			procCount++;
			check (ci.cardinality == PClassInfo::kManyInstances, "audio module cardinality is kManyInstances", "",
			       Sev::Warn);
			if (m.f2)
				check (subcats.find ("Instrument") != std::string::npos,
				       "audio module subCategories contain 'Instrument' (Ableton lists it under Instruments)",
				       "subCategories='" + subcats + "'");
			else
				fail ("factory implements IPluginFactory2 (needed to report the Instrument sub-category)");
		}
	}
	check (procCount >= 1, "factory exports an 'Audio Module Class'");
	if (procCount > 1)
		LOG ("  (info) %d audio module classes; testing the first one", procCount);
}

//==============================================================================
// Instance creation (component, controller, connection, state sync, handler)
//==============================================================================
static void listInterfaces (FUnknown* obj, const char* what)
{
	std::string s;
	for (auto& k : kKnownIids)
	{
		if (k.iid == &FUnknown::iid)
			continue;
		void* p = nullptr;
		tresult r = kNoInterface;
		tryCall ([&] { r = obj->queryInterface (k.iid->toTUID (), &p); });
		if (r == kResultOk && p)
		{
			s += std::string (" ") + k.name;
			static_cast<FUnknown*> (p)->release ();
		}
	}
	LOG ("  %s implements:%s", what, s.c_str ());
}

static bool createInstance (Instance& in, Module& m, HostApplication* host, bool verbose)
{
	auto ck = [&] (bool ok, const std::string& name, const std::string& detail = {}, Sev s = Sev::Fail) {
		if (verbose || !ok)
			check (ok, in.nm (name), detail, s);
		return ok;
	};
	in.handler = new ComponentHandler ();
	in.handler->label = in.label;
	in.handler->nameOf = [&in] (ParamID id) { return in.paramName (id); };

	void* obj = nullptr;
	tresult r = kResultFalse;
	guarded (in.nm ("IPluginFactory::createInstance(component)"),
	         [&] { r = m.factory->createInstance ((FIDString)m.procClass.cid, (FIDString)IComponent::iid.toTUID (), &obj); });
	in.comp = (IComponent*)obj;
	if (!ck (r == kResultOk && in.comp, "create component (IComponent)", strf ("returned %d", r)))
		return false;
	r = kResultFalse;
	guarded (in.nm ("IComponent::initialize"), [&] { r = in.comp->initialize (static_cast<IHostApplication*> (host)); });
	if (!ck (r == kResultOk, "IComponent::initialize(hostContext)", strf ("returned %d", r)))
		return false;
	in.comp->queryInterface (IAudioProcessor::iid, (void**)&in.proc);
	if (!ck (in.proc != nullptr, "component implements IAudioProcessor"))
		return false;

	TUID ccid = {};
	r = kResultFalse;
	guarded (in.nm ("IComponent::getControllerClassId"), [&] { r = in.comp->getControllerClassId (ccid); });
	bool haveCcid = (r == kResultOk) && FUID::fromTUID (ccid).isValid ();
	if (haveCcid)
	{
		if (verbose)
			LOG ("  controller class id: %s", tuidHex (ccid).c_str ());
		obj = nullptr;
		tresult rc = kResultFalse;
		guarded (in.nm ("IPluginFactory::createInstance(controller)"),
		         [&] { rc = m.factory->createInstance ((FIDString)ccid, (FIDString)IEditController::iid.toTUID (), &obj); });
		in.ctrl = (IEditController*)obj;
		if (!ck (rc == kResultOk && in.ctrl, "create separate edit controller", strf ("returned %d", rc)))
			return false;
		rc = kResultFalse;
		guarded (in.nm ("IEditController::initialize"), [&] { rc = in.ctrl->initialize (static_cast<IHostApplication*> (host)); });
		if (!ck (rc == kResultOk, "IEditController::initialize(hostContext)", strf ("returned %d", rc)))
			return false;
	}
	else
	{
		in.comp->queryInterface (IEditController::iid, (void**)&in.ctrl);
		in.singleComponent = in.ctrl != nullptr;
		if (verbose)
			LOG ("  no separate controller class id; single-component plug-in: %s", in.singleComponent ? "yes" : "no");
		if (!ck (in.ctrl != nullptr, "plug-in provides an IEditController"))
			return false;
	}

	if (!in.singleComponent)
	{
		in.comp->queryInterface (IConnectionPoint::iid, (void**)&in.compCP);
		in.ctrl->queryInterface (IConnectionPoint::iid, (void**)&in.ctrlCP);
		if (in.compCP && in.ctrlCP)
		{
			tresult a = kResultFalse, b = kResultFalse;
			in.compPeer = in.connectWrap ? in.connectWrap (in.ctrlCP) : in.ctrlCP;
			in.ctrlPeer = in.connectWrap ? in.connectWrap (in.compCP) : in.compCP;
			guarded (in.nm ("component IConnectionPoint::connect"), [&] { a = in.compCP->connect (in.compPeer); });
			guarded (in.nm ("controller IConnectionPoint::connect"), [&] { b = in.ctrlCP->connect (in.ctrlPeer); });
			in.connected = true;
			ck (a == kResultOk && b == kResultOk, "IConnectionPoint connect (component <-> controller, direct)",
			    strf ("component->connect %d, controller->connect %d", a, b));
		}
		else if (verbose)
			warn ("component and controller both implement IConnectionPoint",
			      strf ("component %s, controller %s (fine only if no messaging is needed)", in.compCP ? "yes" : "no",
			            in.ctrlCP ? "yes" : "no"));
	}

	// state synchronisation component -> controller (as every host does after creation)
	std::vector<uint8_t> st;
	bool gs = in.getState (st);
	ck (gs, "IComponent::getState after initialize", strf ("%zu bytes", st.size ()));
	if (verbose)
		LOG ("  initial component state: %zu bytes", st.size ());
	size_t m0 = in.handler->mark ();
	tresult scs = in.setComponentStateOnController (st);
	ck (scs == kResultOk, "IEditController::setComponentState(component state)", strf ("returned %d", scs));

	r = kResultFalse;
	guarded (in.nm ("IEditController::setComponentHandler"),
	         [&] { r = in.ctrl->setComponentHandler (static_cast<IComponentHandler*> (in.handler)); });
	ck (r == kResultOk, "IEditController::setComponentHandler", strf ("returned %d", r));
	(void)m0;

	in.readParams ();
	if (verbose)
	{
		listInterfaces (in.comp, "component");
		if (!in.singleComponent)
			listInterfaces (in.ctrl, "controller");
	}
	return true;
}

//==============================================================================
// Bus checks and processing setup
//==============================================================================
static void testBuses (Instance& in)
{
	beginSection ("Buses and processing setup");
	auto busCount = [&] (MediaType t, BusDirection d) {
		int32 n = -1;
		guarded ("IComponent::getBusCount", [&] { n = in.comp->getBusCount (t, d); });
		return n;
	};
	int32 evIn = busCount (kEvent, kInput), evOut = busCount (kEvent, kOutput);
	int32 auIn = busCount (kAudio, kInput), auOut = busCount (kAudio, kOutput);
	LOG ("  buses: event in %d, event out %d, audio in %d, audio out %d", evIn, evOut, auIn, auOut);
	check (evIn == 1, "exactly 1 event input bus", strf ("%d", evIn));
	check (auIn == 0, "no audio input bus", strf ("%d", auIn));
	check (auOut == 1, "exactly 1 audio output bus", strf ("%d", auOut));
	for (int t = 0; t < 2; t++)
		for (int d = 0; d < 2; d++)
		{
			int32 n = busCount (t, d);
			for (int32 i = 0; i < n; i++)
			{
				BusInfo bi {};
				tresult r = kResultFalse;
				guarded ("IComponent::getBusInfo", [&] { r = in.comp->getBusInfo (t, d, i, bi); });
				LOG ("  %s %s bus %d: '%s' channels %d type %s flags 0x%X (r=%d)", t == kAudio ? "audio" : "event",
				     d == kInput ? "in" : "out", i, s16 (bi.name).c_str (), bi.channelCount,
				     bi.busType == kMain ? "main" : "aux", bi.flags, r);
				if (t == kAudio && d == kOutput && i == 0)
				{
					check (bi.channelCount == 2, "audio output bus 0 is stereo (2 channels)", strf ("%d", bi.channelCount));
					check (bi.busType == kMain, "audio output bus 0 is a main bus", "", Sev::Warn);
					check ((bi.flags & BusInfo::kDefaultActive) != 0, "audio output bus 0 has kDefaultActive", "",
					       Sev::Warn);
				}
				if (t == kEvent && d == kInput && i == 0)
					check (bi.channelCount >= 1, "event input bus has >= 1 channel", strf ("%d", bi.channelCount));
			}
		}

	SpeakerArrangement stereo = SpeakerArr::kStereo, mono = SpeakerArr::kMono;
	tresult r = kResultFalse;
	guarded ("setBusArrangements(mono)", [&] { r = in.proc->setBusArrangements (nullptr, 0, &mono, 1); });
	LOG ("  (info) setBusArrangements(no inputs, mono out) -> %d (plug-in may refuse)", r);
	r = kResultFalse;
	guarded ("setBusArrangements(stereo)", [&] { r = in.proc->setBusArrangements (nullptr, 0, &stereo, 1); });
	check (r == kResultTrue, "setBusArrangements(no inputs, {stereo}) accepted", strf ("returned %d", r));
	SpeakerArrangement got = 0;
	guarded ("getBusArrangement", [&] { r = in.proc->getBusArrangement (kOutput, 0, got); });
	check (r == kResultOk && got == SpeakerArr::kStereo, "getBusArrangement(output 0) == stereo",
	       strf ("returned %d, arrangement 0x%llX", r, (unsigned long long)got));

	tresult a = kResultFalse, b = kResultFalse;
	guarded ("activateBus(event in)", [&] { a = in.comp->activateBus (kEvent, kInput, 0, true); });
	guarded ("activateBus(audio out)", [&] { b = in.comp->activateBus (kAudio, kOutput, 0, true); });
	check (a == kResultOk, "activateBus(event, input, 0, true)", strf ("returned %d", a));
	check (b == kResultOk, "activateBus(audio, output, 0, true)", strf ("returned %d", b));

	tresult s32 = kResultFalse, s64 = kResultFalse;
	guarded ("canProcessSampleSize", [&] {
		s32 = in.proc->canProcessSampleSize (kSample32);
		s64 = in.proc->canProcessSampleSize (kSample64);
	});
	check (s32 == kResultTrue, "canProcessSampleSize(kSample32)", strf ("returned %d", s32));
	LOG ("  (info) canProcessSampleSize(kSample64) -> %d", s64);

	IProcessContextRequirements* pcr = nullptr;
	in.comp->queryInterface (IProcessContextRequirements::iid, (void**)&pcr);
	if (pcr)
	{
		uint32 f = 0;
		guarded ("getProcessContextRequirements", [&] { f = pcr->getProcessContextRequirements (); });
		LOG ("  (info) IProcessContextRequirements flags 0x%X", f);
		pcr->release ();
	}

	in.configure (g_opt.sr, g_opt.block, true);
	uint32 lat = 0, tail = 0;
	guarded ("getLatencySamples/getTailSamples", [&] {
		lat = in.proc->getLatencySamples ();
		tail = in.proc->getTailSamples ();
	});
	LOG ("  latency %u samples, tail %s", lat,
	     tail == kInfiniteTail ? "infinite" : tail == kNoTail ? "none (0)" : strf ("%u samples", tail).c_str ());
	check (lat < (uint32)g_opt.sr, "latency below 1 second", strf ("%u samples", lat), Sev::Warn);
}

//==============================================================================
// Parameters
//==============================================================================
static std::string flagNames (int32 f)
{
	std::string s;
	auto add = [&] (int32 bit, const char* n) {
		if (f & bit)
			s += std::string (s.empty () ? "" : "|") + n;
	};
	add (ParameterInfo::kCanAutomate, "automate");
	add (ParameterInfo::kIsReadOnly, "readonly");
	add (ParameterInfo::kIsWrapAround, "wrap");
	add (ParameterInfo::kIsList, "list");
	add (ParameterInfo::kIsHidden, "hidden");
	add (ParameterInfo::kIsProgramChange, "program");
	add (ParameterInfo::kIsBypass, "bypass");
	return s.empty () ? "-" : s;
}

static std::string csvq (const std::string& s)
{
	std::string o = "\"";
	for (char c : s)
		o += c == '"' ? std::string ("\"\"") : std::string (1, c);
	return o + "\"";
}

static double quantize (double v, int32 steps) { return steps > 0 ? std::round (v * steps) / steps : v; }

static void testParameters (Instance& in)
{
	beginSection ("Parameters");
	IEditController* c = in.ctrl;
	in.readParams ();
	int32 count = 0;
	guarded ("getParameterCount", [&] { count = c->getParameterCount (); });
	LOG ("  %d parameters (getParameterInfo succeeded for %zu)", count, in.params.size ());
	check (count > 0, "plug-in exposes parameters");
	check ((int32)in.params.size () == count, "getParameterInfo succeeds for every index");

	FILE* csv = _wfopen (outPath ("params.csv").c_str (), L"wb");
	if (csv)
		fprintf (csv, "index,id,title,shortTitle,units,stepCount,defaultNormalized,flags,flagNames,unitId,plainAt0,"
		              "plainAt1,plainAtDefault,stringAt0,stringAtDefault,stringAt1\n");

	LOG ("  %-4s %-6s %-26s %-12s %-6s %5s %8s %s", "idx", "id", "title", "short", "units", "steps", "default", "flags");
	std::set<ParamID> ids;
	std::vector<std::string> badDefault, badTitle, dupId, highId, strFail, strRoundTrip, strTol, plainFail, plainMono,
	    setGetFail, defaultMismatch, listNoSteps;
	size_t mark = in.handler->mark ();
	for (size_t i = 0; i < in.params.size (); i++)
	{
		const ParamRec& p = in.params[i];
		const ParameterInfo& pi = p.info;
		const ParamID id = pi.id;
		const int32 steps = pi.stepCount;
		LOG ("  %-4zu %-6u %-26s %-12s %-6s %5d %8.4f %s (unit %d)", i, id, p.title.c_str (), p.shortTitle.c_str (),
		     p.units.c_str (), steps, pi.defaultNormalizedValue, flagNames (pi.flags).c_str (), pi.unitId);
		if (!ids.insert (id).second)
			dupId.push_back (p.title);
		if (id >= 0x80000000u)
			highId.push_back (p.title);
		if (!(pi.defaultNormalizedValue >= 0 && pi.defaultNormalizedValue <= 1))
			badDefault.push_back (strf ("%s=%g", p.title.c_str (), pi.defaultNormalizedValue));
		if (p.title.empty ())
			badTitle.push_back (strf ("id %u", id));
		if ((pi.flags & ParameterInfo::kIsList) && steps <= 0)
			listNoSteps.push_back (p.title);

		// current value == default after initialization?
		double cur = 0;
		tryCall ([&] { cur = c->getParamNormalized (id); });
		if (std::fabs (cur - pi.defaultNormalizedValue) > 1e-6 &&
		    std::fabs (cur - quantize (pi.defaultNormalizedValue, steps)) > 1e-6)
			defaultMismatch.push_back (strf ("%s: value %.6f vs default %.6f", p.title.c_str (), cur, pi.defaultNormalizedValue));

		// ---- string <-> value
		auto toStr = [&] (double v, std::string& out) {
			String128 s {};
			tresult r = kResultFalse;
			std::string err = tryCall ([&] { r = c->getParamStringByValue (id, v, s); });
			if (!err.empty ())
			{
				fail ("getParamStringByValue crashed", p.title + ": " + err);
				return false;
			}
			out = s16 (s);
			return r == kResultOk;
		};
		std::vector<double> probes = {0.0, 0.25, 0.5, 0.75, 1.0, pi.defaultNormalizedValue};
		if (steps > 0)
			for (int32 k = 0; k <= std::min (steps, 32); k++)
				probes.push_back ((double)k / steps);
		std::string sAt0, sAt1, sAtDef;
		for (double v : probes)
		{
			std::string s;
			if (!toStr (v, s) || s.empty ())
			{
				strFail.push_back (strf ("%s @%.3f", p.title.c_str (), v));
				continue;
			}
			if (v == 0.0)
				sAt0 = s;
			if (v == 1.0)
				sAt1 = s;
			if (v == pi.defaultNormalizedValue)
				sAtDef = s;
			String128 s16buf {};
			toS16 (s, s16buf, 128);
			ParamValue back = -1;
			tresult r = kResultFalse;
			std::string err = tryCall ([&] { r = c->getParamValueByString (id, s16buf, back); });
			if (!err.empty ())
			{
				fail ("getParamValueByString crashed", p.title + ": " + err);
				continue;
			}
			if (r != kResultOk)
			{
				strRoundTrip.push_back (strf ("%s: cannot parse its own string '%s'", p.title.c_str (), s.c_str ()));
				continue;
			}
			std::string s2;
			toStr (back, s2);
			if (s2 != s)
				strRoundTrip.push_back (strf ("%s: '%s' -> %.6f -> '%s'", p.title.c_str (), s.c_str (), back, s2.c_str ()));
			double expect = quantize (v, steps);
			double tol = steps > 0 ? 1e-6 : 0.02;
			if (!(std::fabs (back - expect) <= tol))
				strTol.push_back (strf ("%s: %.4f -> '%s' -> %.4f", p.title.c_str (), v, s.c_str (), back));
		}

		// ---- normalized <-> plain
		double plain0 = 0, plain1 = 0, plainDef = 0;
		double prevPlain = 0;
		int dir = 0;
		bool mono = true;
		for (int k = 0; k <= 20; k++)
		{
			double v = k / 20.0;
			double pl = 0, back = 0;
			std::string err = tryCall ([&] {
				pl = c->normalizedParamToPlain (id, v);
				back = c->plainParamToNormalized (id, pl);
			});
			if (!err.empty ())
			{
				fail ("normalizedParamToPlain/plainParamToNormalized crashed", p.title + ": " + err);
				break;
			}
			if (k == 0)
				plain0 = pl;
			if (k == 20)
				plain1 = pl;
			double expect = quantize (v, steps);
			if (!std::isfinite (pl) || !(std::fabs (back - expect) <= (steps > 0 ? 1e-6 : 1e-5)))
				if (!(steps > 0 && std::fabs (back - v) <= 1e-6))
					plainFail.push_back (strf ("%s: %.3f -> plain %g -> %.6f", p.title.c_str (), v, pl, back));
			if (k > 0)
			{
				int d = pl > prevPlain ? 1 : pl < prevPlain ? -1 : 0;
				if (d && dir && d != dir)
					mono = false;
				if (d)
					dir = d;
			}
			prevPlain = pl;
		}
		tryCall ([&] { plainDef = c->normalizedParamToPlain (id, pi.defaultNormalizedValue); });
		if (!mono)
			plainMono.push_back (p.title);

		// ---- setParamNormalized / getParamNormalized
		if (!(pi.flags & ParameterInfo::kIsReadOnly))
		{
			double orig = cur;
			for (double v : {0.0, 0.37, 1.0, pi.defaultNormalizedValue})
			{
				tresult r = kResultFalse;
				double got = -1;
				std::string err = tryCall ([&] {
					r = c->setParamNormalized (id, v);
					got = c->getParamNormalized (id);
				});
				if (!err.empty ())
				{
					fail ("setParamNormalized/getParamNormalized crashed", p.title + ": " + err);
					break;
				}
				bool ok = r == kResultOk && (std::fabs (got - v) <= 1e-6 || std::fabs (got - quantize (v, steps)) <= 1e-6);
				if (!ok)
					setGetFail.push_back (strf ("%s: set %.4f -> r=%d get %.6f", p.title.c_str (), v, r, got));
			}
			tryCall ([&] { c->setParamNormalized (id, orig); });
		}
		if (csv)
			fprintf (csv, "%zu,%u,%s,%s,%s,%d,%.9g,%d,%s,%d,%.9g,%.9g,%.9g,%s,%s,%s\n", i, id, csvq (p.title).c_str (),
			         csvq (p.shortTitle).c_str (), csvq (p.units).c_str (), steps, pi.defaultNormalizedValue, pi.flags,
			         flagNames (pi.flags).c_str (), pi.unitId, plain0, plain1, plainDef, csvq (sAt0).c_str (),
			         csvq (sAtDef).c_str (), csvq (sAt1).c_str ());
	}
	if (csv)
		fclose (csv);
	LOG ("  parameter table written to params.csv");

	auto join = [] (const std::vector<std::string>& v, size_t max = 12) {
		std::string s;
		for (size_t i = 0; i < v.size () && i < max; i++)
			s += (i ? "; " : "") + v[i];
		if (v.size () > max)
			s += strf ("; ... (%zu total)", v.size ());
		return s;
	};
	for (auto* lst : {&strFail, &strRoundTrip, &strTol, &plainFail, &setGetFail})
		for (auto& x : *lst)
			LOG ("    issue: %s", x.c_str ());
	check (dupId.empty (), "parameter IDs are unique", join (dupId));
	check (highId.empty (), "parameter IDs < 0x80000000 (upper range is reserved)", join (highId), Sev::Warn);
	check (badDefault.empty (), "default normalized values within [0,1]", join (badDefault));
	check (badTitle.empty (), "every parameter has a title", join (badTitle));
	check (listNoSteps.empty (), "kIsList parameters have stepCount > 0", join (listNoSteps), Sev::Warn);
	LOG ("  (info) %zu parameters start at values other than their declared defaults (initial preset)", defaultMismatch.size ());
	check (strFail.empty (), "getParamStringByValue returns a non-empty string", join (strFail));
	check (strRoundTrip.empty (), "getParamValueByString parses getParamStringByValue output (string round-trip)",
	       join (strRoundTrip));
	check (strTol.empty (), "value -> string -> value stays close (discrete exact, continuous +-0.02)", join (strTol),
	       Sev::Warn);
	check (plainFail.empty (), "plainParamToNormalized(normalizedParamToPlain(x)) == x", join (plainFail));
	check (plainMono.empty (), "normalizedParamToPlain is monotonic", join (plainMono), Sev::Warn);
	check (setGetFail.empty (), "setParamNormalized/getParamNormalized round-trip", join (setGetFail));
	auto edits = in.handler->since (mark);
	int perf = 0;
	for (auto& e : edits)
		perf += (e.type == 'p' || e.type == 'b');
	check (perf == 0, "controller does not call beginEdit/performEdit when the HOST sets values",
	       strf ("%d calls (automation feedback loop: Ableton would record bogus automation)", perf), Sev::Warn);
}

static void testUnitsAndMidiMapping (Instance& in, ParamID& bendId, ParamID& modId)
{
	beginSection ("Units, programs and MIDI mapping");
	bendId = modId = kNoParamId;
	IUnitInfo* ui = nullptr;
	in.ctrl->queryInterface (IUnitInfo::iid, (void**)&ui);
	if (ui)
	{
		guarded ("IUnitInfo", [&] {
			int32 nu = ui->getUnitCount ();
			for (int32 i = 0; i < nu; i++)
			{
				UnitInfo u {};
				if (ui->getUnitInfo (i, u) == kResultOk)
					LOG ("  unit %d: '%s' parent %d programList %d", u.id, s16 (u.name).c_str (), u.parentUnitId,
					     u.programListId);
			}
			int32 nl = ui->getProgramListCount ();
			for (int32 i = 0; i < nl; i++)
			{
				ProgramListInfo pl {};
				if (ui->getProgramListInfo (i, pl) == kResultOk)
				{
					LOG ("  program list %d: '%s' with %d programs", pl.id, s16 (pl.name).c_str (), pl.programCount);
					for (int32 k = 0; k < pl.programCount && k < 64; k++)
					{
						String128 n {};
						if (ui->getProgramName (pl.id, k, n) == kResultOk)
							LOG ("    [%d] %s", k, s16 (n).c_str ());
					}
				}
			}
		});
		ui->release ();
	}
	else
		LOG ("  (info) controller does not implement IUnitInfo (no program lists exposed to the host)");

	IMidiMapping* mm = nullptr;
	in.ctrl->queryInterface (IMidiMapping::iid, (void**)&mm);
	if (!mm)
	{
		warn ("controller implements IMidiMapping",
		      "without it Ableton cannot deliver pitch bend / mod wheel to a VST3 instrument");
		return;
	}
	struct Cc
	{
		CtrlNumber cc;
		const char* name;
	} ccs[] = {{kPitchBend, "pitch bend"}, {kCtrlModWheel, "mod wheel (CC1)"}, {kAfterTouch, "channel aftertouch"},
	           {kCtrlSustainOnOff, "sustain (CC64)"}, {kCtrlExpression, "expression (CC11)"}};
	for (auto& c : ccs)
	{
		ParamID id = kNoParamId;
		tresult r = kResultFalse;
		guarded ("IMidiMapping::getMidiControllerAssignment", [&] { r = mm->getMidiControllerAssignment (0, 0, c.cc, id); });
		LOG ("  MIDI %-20s -> %s", c.name, r == kResultTrue ? in.paramName (id).c_str () : "(not mapped)");
		if (r == kResultTrue)
		{
			check (in.paramById (id) != nullptr, strf ("MIDI-mapped %s parameter exists in the parameter list", c.name),
			       strf ("id %u", id));
			if (c.cc == kPitchBend)
				bendId = id;
			if (c.cc == kCtrlModWheel)
				modId = id;
		}
	}
	check (bendId != kNoParamId, "pitch bend mapped via IMidiMapping", "", Sev::Warn);
	check (modId != kNoParamId, "mod wheel mapped via IMidiMapping", "", Sev::Warn);
	mm->release ();
}

//==============================================================================
// Render reporting
//==============================================================================
struct RenderCheck
{
	bool expectSound = true;
	bool writeWav = true;
	bool quiet = false; // only report problems
};

static bool reportRender (Instance& in, const std::string& name, const RenderResult& r, RenderCheck rc = {})
{
	SegStats st = segStats (r.L, r.R, 0, (int64)r.L.size ());
	st.peak = std::max (st.peak, r.peak);
	double avg = r.calls ? r.totalUs / r.calls : 0;
	double cpu = r.frames ? r.totalUs / (r.frames / in.sr * 1e6) * 100.0 : 0;
	double budget = g_opt.block / in.sr * 1e6;
	if (r.L.empty ())
		LOG ("  render '%s': %.2f s @ %.0f Hz, %d process calls | peak %.1f dBFS (%.4f) | (samples not kept)", name.c_str (),
		     r.frames / in.sr, in.sr, r.calls, dbfs (st.peak), st.peak);
	else
		LOG ("  render '%s': %.2f s @ %.0f Hz, %d process calls | peak %.1f dBFS (%.4f) | RMS %.1f dBFS | DC L %+.1e R %+.1e",
		     name.c_str (), r.frames / in.sr, in.sr, r.calls, dbfs (st.peak), st.peak, dbfs (st.rms), st.dcL, st.dcR);
	LOG ("    process(): avg %.1f us, max %.1f us per call (budget %.0f us @ %d) | real-time CPU %.2f %% | over budget: %d",
	     avg, r.maxUs, budget, g_opt.block, cpu, r.overruns);
	if (r.nan || r.inf || r.unclearedNoFlag || r.unclearedWithFlag || r.silenceFlagLies || r.outParamPoints)
		LOG ("    NaN %lld, Inf %lld, unwritten samples %lld (+%lld with silence flag), silence-flag lies %lld, output "
		     "param points %d",
		     (long long)r.nan, (long long)r.inf, (long long)r.unclearedNoFlag, (long long)r.unclearedWithFlag,
		     (long long)r.silenceFlagLies, r.outParamPoints);
	std::string problems;
	if (r.crashed)
		problems += "process() crashed " + r.crash + "; ";
	if (r.errors)
		problems += strf ("process() returned %d (not kResultOk) %d times; ", r.firstError, r.errors);
	if (r.nan || r.inf)
		problems += strf ("%lld NaN and %lld Inf samples; ", (long long)r.nan, (long long)r.inf);
	if (r.unclearedNoFlag)
		problems += strf ("%lld output samples not written by the plug-in (DAW buffers are not pre-cleared -> garbage); ",
		                  (long long)r.unclearedNoFlag);
	if (st.peak >= 64)
		problems += strf ("output blew up: peak %.1f; ", st.peak);
	bool ok = problems.empty ();
	if (!rc.quiet || !ok)
		check (ok, name + ": clean output (no crash/NaN/Inf/unwritten samples, process() == kResultOk)", problems);
	if (rc.expectSound)
	{
		bool snd = st.peak > 1e-4;
		if (!rc.quiet || !snd)
			check (snd, name + ": produces sound", strf ("peak %.2e", st.peak));
	}
	if (r.unclearedWithFlag)
		warn (name + ": silence flag set but buffer not zeroed",
		      strf ("%lld samples (spec: silent buffers must still contain zeros)", (long long)r.unclearedWithFlag));
	if (r.silenceFlagLies)
		warn (name + ": silenceFlags set on a non-silent channel", strf ("%lld samples", (long long)r.silenceFlagLies));
	if (st.peak > 1.0 && st.peak < 64)
		warn (name + ": output exceeds 0 dBFS", strf ("peak %.3f (%+.1f dBFS)", st.peak, dbfs (st.peak)));
	if (std::fabs (st.dcL) > 0.01 || std::fabs (st.dcR) > 0.01)
		warn (name + ": DC offset", strf ("L %+.4f R %+.4f", st.dcL, st.dcR));
	if (r.frames)
	{
		if (!rc.quiet || cpu >= 100)
			check (cpu < 100, name + ": real-time capable (process time < audio time)", strf ("CPU %.1f %%", cpu));
		if (r.overruns)
			warn (name + ": process() calls exceeding the real-time budget",
			      strf ("%d calls (worst %.0f us = %.0f %% of its block) -> audible dropouts in a DAW", r.overruns, r.maxUs,
			            r.maxLoad * 100));
	}
	if (rc.writeWav && !r.L.empty ())
	{
		std::string fn = name + ".wav";
		if (writeWavFloatStereo (outPath (fn), r.L, r.R, (int)in.sr))
			LOG ("    wrote %s", fn.c_str ());
	}
	return ok;
}

static bool sameSound (const Comparison& c, bool deterministic)
{
	return deterministic ? c.maxAbsDiff < 1e-4 : c.maxEnvDiffDb < 3.0;
}

static std::string cmpStr (const Comparison& c)
{
	std::string s = strf ("max |diff| %.2e, diff RMS %.1f dBFS, max envelope diff %.2f dB", c.maxAbsDiff, c.rmsDiffDb,
	                      c.maxEnvDiffDb);
	if (c.firstDiff >= 0)
		s += strf (", first difference at sample %lld (%.3f s)", (long long)c.firstDiff, c.firstDiff / g_opt.sr);
	return s;
}

//==============================================================================
// Scenarios
//==============================================================================
static int64 sec (double s, double sr) { return (int64)std::llround (s * sr); }

// (a) chord C4-E4-G4 then single notes MIDI 24..96, events at odd offsets inside blocks
static Scenario scenarioNotes (double sr, int32 block)
{
	Scenario s;
	s.name = "a_notes";
	int64 t = sec (0.25, sr) + 37; // deliberately not block-aligned
	s.note (t, t + sec (1.0, sr), 60, 0.8f);
	s.note (t + 3, t + sec (1.0, sr) + 5, 64, 0.8f);
	s.note (t + 7, t + sec (1.0, sr) + 11, 67, 0.8f);
	t += sec (1.3, sr);
	for (int p = 24; p <= 96; p += 6)
	{
		int64 on = t + (p * 13) % block;
		s.note (on, on + sec (0.30, sr), p, 0.7f);
		t += sec (0.45, sr);
	}
	s.finish (t + sec (2.0, sr));
	return s;
}

// short variant for block-size comparisons
static Scenario scenarioShort (double sr, int32 block)
{
	Scenario s;
	s.name = "short";
	int64 t = sec (0.1, sr) + 19;
	s.note (t, t + sec (0.6, sr), 60, 0.8f);
	s.note (t, t + sec (0.6, sr), 64, 0.8f);
	s.note (t, t + sec (0.6, sr), 67, 0.8f);
	t += sec (0.8, sr);
	for (int p : {36, 48, 72, 84})
	{
		int64 on = t + (p * 7) % block;
		s.note (on, on + sec (0.25, sr), p, 0.7f);
		t += sec (0.35, sr);
	}
	s.finish (t + sec (0.8, sr));
	return s;
}

static Scenario scenarioSingle (double sr, int pitch, double holdSec, double tailSec, const char* name)
{
	Scenario s;
	s.name = name;
	s.note (sec (0.05, sr), sec (0.05 + holdSec, sr), pitch, 0.8f);
	s.finish (sec (0.05 + holdSec + tailSec, sr));
	return s;
}

//==============================================================================
// Audio tests
//==============================================================================
struct AudioCtx
{
	std::vector<uint8_t> defaultState; // neutral reference: every parameter at its declared default
	std::vector<uint8_t> initialState; // component state right after initialization (initial preset)
	bool deterministic = false;
	RenderResult refA;                 // scenario (a) at default state
	ParamID bendId = kNoParamId, modId = kNoParamId;
};

// Let time pass like in a DAW after loading a state: render silence paced in real time
// (no reset), so background work in the plug-in (e.g. table rebuilds) can complete.
static void settle (Instance& in, double seconds = 0.25)
{
	Scenario s;
	s.name = "settle";
	s.finish (sec (seconds, in.sr));
	RenderOptions o;
	o.block = std::min (g_opt.block, in.maxBlock);
	o.reset = false;
	o.realtime = true;
	in.render (s, o);
}

// DAW "reset all controllers": hidden MIDI-controller parameters (pitch bend, mod wheel,
// sustain...) are performance state, not part of the saved state, so the host resets them.
static void resetControllers (Instance& in)
{
	Scenario s;
	s.name = "reset_controllers";
	for (auto& p : in.params)
		if (p.info.flags & ParameterInfo::kIsHidden)
		{
			s.param (0, p.info.id, p.info.defaultNormalizedValue);
			tryCall ([&] { in.ctrl->setParamNormalized (p.info.id, p.info.defaultNormalizedValue); });
		}
	if (s.params.empty ())
		return;
	s.finish (std::min<int64> (g_opt.block, in.maxBlock));
	RenderOptions o;
	o.block = std::min (g_opt.block, in.maxBlock);
	o.reset = false;
	in.render (s, o);
}

static void restoreDefault (Instance& in, AudioCtx& ac)
{
	if (!ac.defaultState.empty ())
		in.loadState (ac.defaultState);
	resetControllers (in);
	settle (in);
}

// Relative levels (dB re. strongest) of the first nh harmonics of f0 (Goertzel on the mono sum).
static std::vector<double> harmonicProfile (const std::vector<float>& L, const std::vector<float>& R, int64 from,
                                            int64 len, double sr, double f0, int nh)
{
	std::vector<double> mag;
	from = std::max<int64> (0, from);
	len = std::min<int64> (len, (int64)L.size () - from);
	for (int h = 1; h <= nh; h++)
	{
		double w = 2 * 3.14159265358979 * f0 * h / sr, c = 2 * std::cos (w), s1 = 0, s2 = 0;
		for (int64 i = 0; i < len; i++)
		{
			double win = 0.5 - 0.5 * std::cos (2 * 3.14159265358979 * i / (len - 1));
			double x = 0.5 * ((double)L[(size_t)(from + i)] + R[(size_t)(from + i)]) * win;
			double s0 = x + c * s1 - s2;
			s2 = s1;
			s1 = s0;
		}
		mag.push_back (std::sqrt (std::max (0.0, s1 * s1 + s2 * s2 - c * s1 * s2)));
	}
	double mx = *std::max_element (mag.begin (), mag.end ());
	for (auto& m : mag)
		m = dbfs (mx > 0 ? m / mx : 0);
	return mag;
}
static double profileDiffDb (const std::vector<double>& a, const std::vector<double>& b)
{
	double d = 0;
	for (size_t i = 0; i < std::min (a.size (), b.size ()); i++)
		if (a[i] > -40 || b[i] > -40)
			d = std::max (d, std::fabs (std::max (a[i], -60.0) - std::max (b[i], -60.0)));
	return d;
}
static std::string profileStr (const std::vector<double>& p)
{
	std::string s;
	for (size_t i = 0; i < p.size () && i < 8; i++)
		s += strf ("%s%.1f", i ? " " : "", p[i]);
	return "[" + s + "] dB";
}

static void testAudioBasics (Instance& in, AudioCtx& ac)
{
	beginSection ("Audio (a): notes across the range");
	Scenario a = scenarioNotes (in.sr, g_opt.block);
	RenderOptions o;
	o.block = g_opt.block;
	ac.refA = in.render (a, o);
	reportRender (in, "a_notes", ac.refA);

	// per-note analysis
	LOG ("  %-6s %-10s %-10s", "note", "peak dBFS", "RMS dBFS");
	std::vector<std::string> silent;
	for (auto& sp : a.spans)
	{
		SegStats s = segStats (ac.refA.L, ac.refA.R, sp.on, sp.off);
		LOG ("  %-6d %-10.1f %-10.1f", sp.pitch, dbfs (s.peak), dbfs (s.rms));
		if (s.peak < 1e-4)
			silent.push_back (strf ("%d", sp.pitch));
	}
	std::string sl;
	for (auto& x : silent)
		sl += " " + x;
	check (silent.empty (), "every note (MIDI 24..96) produces sound", "silent notes:" + sl);

	// sample-accurate note-on: the chord starts at a non block-aligned offset after silence
	int64 evt = a.spans[0].on;
	SegStats pre = segStats (ac.refA.L, ac.refA.R, 0, evt);
	int64 onset = firstAbove (ac.refA.L, ac.refA.R, 0, 1e-5);
	LOG ("  first note-on at sample %lld (offset %lld in its block); first output above -100 dBFS at sample %lld (delta %+lld)",
	     (long long)evt, (long long)(evt % g_opt.block), (long long)onset, (long long)(onset - evt));
	check (pre.peak < 1e-5, "silence before the first note", strf ("peak %.2e before the first note-on", pre.peak));
	if (onset >= 0)
		check (onset >= evt && onset - evt <= 64, "note-on is sample accurate (honours Event::sampleOffset)",
		       strf ("sound starts %+lld samples relative to the event (block %d)", (long long)(onset - evt), g_opt.block),
		       Sev::Warn);

	// release returns to silence at the end
	SegStats tail = segStats (ac.refA.L, ac.refA.R, ac.refA.L.size () - (size_t)sec (0.25, in.sr), ac.refA.L.size ());
	check (tail.peak < 3.2e-5, "(a) output decays to silence after the last note-off",
	       strf ("last 250 ms peak %.1f dBFS", dbfs (tail.peak)));

	// determinism (needed to interpret the state/instance comparisons)
	setStep ("determinism");
	RenderResult a2 = in.render (a, o);
	Comparison c = compareAudio (ac.refA.L, ac.refA.R, a2.L, a2.R, (int)in.sr);
	ac.deterministic = c.maxAbsDiff < 1e-6;
	LOG ("  determinism: same scenario rendered twice after reset -> %s", cmpStr (c).c_str ());
	LOG ("  (info) output is %s; later comparisons use %s", ac.deterministic ? "bit-deterministic" : "NOT deterministic",
	     ac.deterministic ? "sample differences" : "RMS envelopes (3 dB tolerance)");
	check (sameSound (c, false), "same input after setActive reset gives the same sound",
	       cmpStr (c) + (sameSound (c, false) ? "" : " (voices/FX not reset by setActive(false/true)?)"), Sev::Warn);
}

static void testAudioParams (Instance& in, AudioCtx& ac)
{
	beginSection ("Audio (b): parameter changes via IParameterChanges");
	int iCut = in.findParam ("Cutoff"), iEng = in.findParam ("Engine"), iWav = in.findParam ("Wavelet");
	LOG ("  parameters found: Cutoff %s, Engine %s, Wavelet %s", iCut >= 0 ? in.params[(size_t)iCut].title.c_str () : "-",
	     iEng >= 0 ? in.params[(size_t)iEng].title.c_str () : "-", iWav >= 0 ? in.params[(size_t)iWav].title.c_str () : "-");
	Scenario b = scenarioNotes (in.sr, g_opt.block);
	b.name = "b_params";
	std::map<ParamID, double> finalVals;
	auto setp = [&] (int idx, int64 t, double v) {
		if (idx < 0)
			return;
		ParamID id = in.params[(size_t)idx].info.id;
		v = quantize (v, in.params[(size_t)idx].info.stepCount);
		b.param (t, id, v);
		finalVals[id] = v;
	};
	int64 half = b.length / 2;
	setp (iEng, 0, 1.0);       // engine B
	setp (iWav, 0, 1.0);       // last wavelet
	// cutoff sweep during the chord (automation with many points per block)
	if (iCut >= 0)
		for (int64 t = 0; t < sec (1.6, in.sr); t += 32)
			setp (iCut, t, 1.0 - 0.8 * (double)t / (double)sec (1.6, in.sr));
	setp (iEng, half, 0.0);    // back to engine A half way
	setp (iWav, half, 0.0);
	if (iCut >= 0)
		setp (iCut, half, 0.45);
	b.finish (b.length);
	RenderOptions o;
	o.block = g_opt.block;
	RenderResult r = in.render (b, o);
	reportRender (in, "b_params", r);
	SegStats h1 = segStats (r.L, r.R, 0, half), h2 = segStats (r.L, r.R, half, (int64)r.L.size ());
	LOG ("  first half (engine B): peak %.1f dBFS; second half (engine A, low cutoff): peak %.1f dBFS", dbfs (h1.peak),
	     dbfs (h2.peak));
	check (h1.peak > 1e-4 && h2.peak > 1e-4, "both halves (after parameter changes) produce sound");
	Comparison c = compareAudio (ac.refA.L, ac.refA.R, r.L, r.R, (int)in.sr);
	check (c.maxAbsDiff > 1e-3, "parameter changes audibly change the output (vs. render a)", cmpStr (c), Sev::Warn);

	// a DAW keeps the controller in sync with the automation it plays
	for (auto& kv : finalVals)
		tryCall ([&] { in.ctrl->setParamNormalized (kv.first, kv.second); });

	// per-engine sanity: each engine alone produces sound
	if (iEng >= 0)
	{
		for (int e = 0; e < 2; e++)
		{
			Scenario s = scenarioSingle (in.sr, 57, 0.6, 0.6, e ? "b_engineB" : "b_engineA");
			s.param (0, in.params[(size_t)iEng].info.id, (double)e);
			s.finish (s.length);
			RenderResult re = in.render (s, o);
			reportRender (in, s.name, re, {true, true, true});
			LOG ("  engine %c alone: peak %.1f dBFS", e ? 'B' : 'A', dbfs (segStats (re.L, re.R, 0, (int64)re.L.size ()).peak));
		}
	}

	// pitch bend / mod wheel via their MIDI-mapped parameters (how Ableton delivers them)
	if (ac.bendId != kNoParamId)
	{
		Scenario s0 = scenarioSingle (in.sr, 69, 0.8, 0.3, "b_bend_center");
		s0.param (0, ac.bendId, 0.5);
		Scenario s1 = scenarioSingle (in.sr, 69, 0.8, 0.3, "b_bend_up");
		s1.param (0, ac.bendId, 1.0);
		restoreDefault (in, ac);
		RenderResult r0 = in.render (s0, o);
		RenderResult r1 = in.render (s1, o);
		reportRender (in, "b_bend_center", r0, {true, false, true});
		reportRender (in, "b_bend_up", r1, {true, true, true});
		double f0 = estimatePitchHz (r0.L, r0.R, sec (0.35, in.sr), sec (0.2, in.sr), in.sr);
		double f1 = estimatePitchHz (r1.L, r1.R, sec (0.35, in.sr), sec (0.2, in.sr), in.sr);
		LOG ("  A4 with bend centre: %.1f Hz, bend max: %.1f Hz (%+.2f semitones)", f0, f1,
		     (f0 > 0 && f1 > 0) ? 12 * std::log2 (f1 / f0) : 0.0);
		check (f0 > 0 && f1 > f0 * 1.01, "pitch-bend parameter (max) raises the pitch", strf ("%.1f -> %.1f Hz", f0, f1),
		       Sev::Warn);
		tryCall ([&] { in.ctrl->setParamNormalized (ac.bendId, 0.5); });
	}
	if (ac.modId != kNoParamId)
	{
		Scenario s = scenarioSingle (in.sr, 60, 0.8, 0.4, "b_modwheel");
		for (int64 t = 0; t < s.length; t += 256)
			s.param (t, ac.modId, std::min (1.0, (double)t / (double)sec (0.6, in.sr)));
		s.finish (s.length);
		RenderResult r2 = in.render (s, o);
		reportRender (in, "b_modwheel", r2, {true, false, true});
		tryCall ([&] { in.ctrl->setParamNormalized (ac.modId, 0.0); });
	}
	restoreDefault (in, ac);
}

static void testSilence (Instance& in, AudioCtx& ac)
{
	beginSection ("Audio (c): release and FX tails decay to silence");
	RenderOptions o;
	o.block = g_opt.block;
	restoreDefault (in, ac);
	// plain patch
	{
		Scenario s;
		s.name = "c_silence_default";
		int64 t = sec (0.1, in.sr);
		for (int p : {48, 60, 64, 67, 72})
			s.note (t, t + sec (0.8, in.sr), p, 0.9f);
		s.finish (t + sec (0.8, in.sr) + sec (4.0, in.sr));
		RenderResult r = in.render (s, o);
		reportRender (in, s.name, r);
		SegStats last = segStats (r.L, r.R, (int64)r.L.size () - sec (0.5, in.sr), (int64)r.L.size ());
		check (last.peak < 3.2e-5, "default patch: silent (< -90 dBFS) 3.5 s after all notes off",
		       strf ("last 0.5 s peak %.1f dBFS, DC L %+.1e R %+.1e", dbfs (last.peak), last.dcL, last.dcR));
	}
	// with delay + reverb if available
	{
		Scenario s;
		s.name = "c_silence_fx";
		std::vector<std::string> fxNames;
		for (const char* nmx : {"Reverb Mix", "Delay Mix", "Reverb Size"})
		{
			int i = in.findParam (nmx);
			if (i >= 0)
			{
				s.param (0, in.params[(size_t)i].info.id, 0.6);
				fxNames.push_back (in.params[(size_t)i].title);
			}
		}
		int64 t = sec (0.1, in.sr);
		for (int p : {48, 55, 60, 64, 67})
			s.note (t, t + sec (1.0, in.sr), p, 0.9f);
		int64 offT = t + sec (1.0, in.sr);
		s.finish (offT + sec (12.0, in.sr));
		LOG ("  FX parameters set to 0.6 (normalized): %s", fxNames.empty () ? "(none found)" : "");
		for (auto& f : fxNames)
			LOG ("    %s", f.c_str ());
		RenderResult r = in.render (s, o);
		reportRender (in, s.name, r);
		// time to fall below -90 dBFS
		int win = (int)(in.sr / 10);
		int64 quietAt = -1;
		for (int64 i = offT; i + win <= (int64)r.L.size (); i += win)
		{
			bool q = true;
			for (int64 k = i; k < (int64)r.L.size (); k += win)
				if (segStats (r.L, r.R, k, k + win).peak >= 3.2e-5)
				{
					q = false;
					break;
				}
			if (q)
			{
				quietAt = i;
				break;
			}
		}
		SegStats last = segStats (r.L, r.R, (int64)r.L.size () - sec (1.0, in.sr), (int64)r.L.size ());
		LOG ("  tail below -90 dBFS after %s (getTailSamples reports %s)",
		     quietAt >= 0 ? strf ("%.2f s", (quietAt - offT) / in.sr).c_str () : "never (within 12 s)",
		     [&] {
			     uint32 tl = 0;
			     tryCall ([&] { tl = in.proc->getTailSamples (); });
			     return tl == kInfiniteTail ? std::string ("infinite") : strf ("%u samples = %.2f s", tl, tl / in.sr);
		     }()
		         .c_str ());
		check (last.peak < 3.2e-5, "with FX: silent (< -90 dBFS) 11-12 s after all notes off",
		       strf ("last 1 s peak %.1f dBFS, DC L %+.1e R %+.1e", dbfs (last.peak), last.dcL, last.dcR));
		// denormal check: CPU in the decaying tail vs. while playing
		double act = 0, tl = 0;
		int na = 0, nt = 0;
		for (auto& b : r.blockUs)
		{
			if (b.first > t + sec (0.2, in.sr) && b.first < offT)
			{
				act += b.second;
				na++;
			}
			else if (b.first > offT + sec (2.0, in.sr))
			{
				tl += b.second;
				nt++;
			}
		}
		if (na && nt)
		{
			act /= na;
			tl /= nt;
			LOG ("  process() avg while playing %.1f us, in the decaying/silent tail %.1f us", act, tl);
			check (tl < std::max (1.5 * act, 50.0), "no CPU spike in the decaying tail (denormals)",
			       strf ("tail %.1f us vs playing %.1f us (host does not set FTZ/DAZ)", tl, act), Sev::Warn);
		}
	}
	// note-on twice on the same pitch, single note-off (overlapping clips in a DAW)
	{
		Scenario s;
		s.name = "c_double_noteon";
		int64 t = sec (0.1, in.sr);
		s.noteOn (t, 60, 0.8f);
		s.noteOn (t + sec (0.3, in.sr), 60, 0.8f);
		s.noteOff (t + sec (0.6, in.sr), 60);
		s.finish (t + sec (0.6, in.sr) + sec (3.0, in.sr));
		restoreDefault (in, ac);
		RenderResult r = in.render (s, o);
		reportRender (in, s.name, r, {true, true, true});
		SegStats last = segStats (r.L, r.R, (int64)r.L.size () - sec (0.5, in.sr), (int64)r.L.size ());
		check (last.peak < 3.2e-5, "double note-on + single note-off (same pitch) does not leave a stuck note",
		       strf ("last 0.5 s peak %.1f dBFS", dbfs (last.peak)), Sev::Warn);
	}
	restoreDefault (in, ac);
}

//==============================================================================
// Controller state format (IEditController::getState/setState)
//   "WSC2": magic 0x32435357, float zoom, int32 modified flag, uint32 name length, UTF-8 preset name
//   "WSC1" (beta 0.1, read only): magic 0x31435357, float zoom, int32 preset index (beta 0.1 order), int32 flag
//==============================================================================
static const uint32_t kWSC1 = 0x31435357, kWSC2 = 0x32435357;

struct CtlState
{
	bool parsed = false;
	std::string why; // why it is not a well-formed WSC2 state
	uint32_t magic = 0;
	float zoom = 0;
	int32_t dirty = -1;
	uint32_t nameLen = 0;
	std::string name;
	size_t bytes = 0;
	std::string str () const
	{
		return parsed ? strf ("WSC2 zoom %.4g, modified %d, '%s' (%zu bytes)", zoom, dirty, name.c_str (), bytes)
		              : strf ("not a WSC2 state: %s (%zu bytes)", why.c_str (), bytes);
	}
};

// Strict parser: exactly 16 + name length bytes.
static CtlState parseCtlState (const std::vector<uint8_t>& d)
{
	CtlState c;
	c.bytes = d.size ();
	auto rd = [&] (size_t off, void* p) {
		if (off + 4 > d.size ())
			return false;
		memcpy (p, d.data () + off, 4);
		return true;
	};
	if (!rd (0, &c.magic))
	{
		c.why = "shorter than 4 bytes";
		return c;
	}
	if (c.magic != kWSC2)
	{
		c.why = strf ("magic 0x%08X", c.magic);
		return c;
	}
	if (!rd (4, &c.zoom) || !rd (8, &c.dirty) || !rd (12, &c.nameLen))
	{
		c.why = "header shorter than 16 bytes";
		return c;
	}
	if (d.size () != 16 + (size_t)c.nameLen)
	{
		c.why = strf ("size %zu != 16 + name length %u", d.size (), c.nameLen);
		return c;
	}
	c.name.assign ((const char*)d.data () + 16, c.nameLen);
	c.parsed = true;
	return c;
}

static void put32 (std::vector<uint8_t>& v, uint32_t x)
{
	for (int i = 0; i < 4; i++)
		v.push_back ((uint8_t)(x >> (8 * i)));
}
static void putF32 (std::vector<uint8_t>& v, float f)
{
	uint32_t x;
	memcpy (&x, &f, 4);
	put32 (v, x);
}
static std::vector<uint8_t> makeWSC2 (float zoom, int32_t dirty, const std::string& name)
{
	std::vector<uint8_t> v;
	put32 (v, kWSC2);
	putF32 (v, zoom);
	put32 (v, (uint32_t)dirty);
	put32 (v, (uint32_t)name.size ());
	v.insert (v.end (), name.begin (), name.end ());
	return v;
}
static std::vector<uint8_t> makeWSC1 (float zoom, int32_t index, int32_t dirty)
{
	std::vector<uint8_t> v;
	put32 (v, kWSC1);
	putF32 (v, zoom);
	put32 (v, (uint32_t)index);
	put32 (v, (uint32_t)dirty);
	return v;
}

static bool ctlGet (Instance& x, std::vector<uint8_t>& out, std::string* crash = nullptr)
{
	MemoryStream* s = new MemoryStream ();
	tresult r = kResultFalse;
	std::string err = tryCall ([&] { r = x.ctrl->getState (s); });
	out = s->data;
	s->release ();
	if (crash)
		*crash = err;
	else if (!err.empty ())
		fail (x.nm ("IEditController::getState crashed"), err);
	return err.empty () && r == kResultOk;
}
static tresult ctlSet (Instance& x, const std::vector<uint8_t>& d, std::string* crash = nullptr)
{
	MemoryStream* s = new MemoryStream (d);
	tresult r = kResultFalse;
	std::string err = tryCall ([&] { r = x.ctrl->setState (s); });
	s->release ();
	if (crash)
		*crash = err;
	else if (!err.empty ())
		fail (x.nm ("IEditController::setState crashed"), err);
	return err.empty () ? r : kInternalError;
}
static CtlState ctlNow (Instance& x)
{
	std::vector<uint8_t> d;
	ctlGet (x, d);
	return parseCtlState (d);
}

//==============================================================================
// State tests
//==============================================================================
static void testState (Instance& in, AudioCtx& ac)
{
	beginSection ("State save/restore");
	RenderOptions o;
	o.block = g_opt.block;
	Scenario a = scenarioShort (in.sr, g_opt.block);

	// 1) put the plug-in into a non-default state through the processor (automation)
	int iCut = in.findParam ("Cutoff"), iEng = in.findParam ("Engine"), iWav = in.findParam ("Wavelet");
	std::map<ParamID, double> expected;
	Scenario setter;
	setter.name = "state_setter";
	auto put = [&] (int idx, double v) {
		if (idx < 0)
			return;
		const auto& p = in.params[(size_t)idx];
		v = quantize (v, p.info.stepCount);
		setter.param (0, p.info.id, v);
		expected[p.info.id] = v;
	};
	put (iEng, 1.0);
	put (iWav, 0.5);
	put (iCut, 0.42);
	// a few more automatable parameters with "odd" values
	int extra = 0;
	for (size_t i = 0; i < in.params.size () && extra < 6; i++)
	{
		const auto& p = in.params[i];
		if ((int)i == iCut || (int)i == iEng || (int)i == iWav)
			continue;
		if ((p.info.flags & ParameterInfo::kCanAutomate) && !(p.info.flags & (ParameterInfo::kIsReadOnly | ParameterInfo::kIsHidden)))
		{
			put ((int)i, p.info.stepCount > 0 ? 1.0 : 0.3 + 0.07 * extra);
			extra++;
		}
	}
	setter.finish (sec (0.05, in.sr));
	restoreDefault (in, ac);
	in.render (setter, o);
	for (auto& kv : expected)
		tryCall ([&] { in.ctrl->setParamNormalized (kv.first, kv.second); });
	settle (in);

	std::vector<uint8_t> s1;
	check (in.getState (s1), "IComponent::getState (non-default state)", strf ("%zu bytes", s1.size ()));
	LOG ("  state after automation: %zu bytes (default state was %zu bytes)", s1.size (), ac.defaultState.size ());
	check (s1 != ac.defaultState, "state changes when parameters change", "", Sev::Warn);
	RenderResult before = in.render (a, o);

	// 2) controller parses the processor state correctly (DAW: setComponentState after load)
	tresult r = in.setComponentStateOnController (s1);
	check (r == kResultOk, "IEditController::setComponentState(non-default state)", strf ("returned %d", r));
	std::vector<std::string> mism;
	for (auto& kv : expected)
	{
		double v = -1;
		tryCall ([&] { v = in.ctrl->getParamNormalized (kv.first); });
		if (std::fabs (v - kv.second) > 1e-4)
			mism.push_back (strf ("%s expected %.4f got %.4f", in.paramName (kv.first).c_str (), kv.second, v));
	}
	std::string ms;
	for (auto& m : mism)
		ms += m + "; ";
	check (mism.empty (), "processor state carries automated values to the controller (setComponentState)", ms);

	// 3) scramble everything, then restore s1
	Scenario scr;
	scr.name = "state_scramble";
	std::mt19937 rng (42);
	for (auto& p : in.params)
		if (!(p.info.flags & (ParameterInfo::kIsReadOnly | ParameterInfo::kIsHidden))) // hidden = MIDI controllers, not state
		{
			double v = quantize ((rng () % 1000) / 999.0, p.info.stepCount);
			scr.param (0, p.info.id, v);
			tryCall ([&] { in.ctrl->setParamNormalized (p.info.id, v); });
		}
	scr.finish (sec (0.05, in.sr));
	in.render (scr, o);
	tresult rs = in.setState (s1);
	check (rs == kResultOk, "IComponent::setState(saved state)", strf ("returned %d", rs));
	in.setComponentStateOnController (s1);
	settle (in);
	std::vector<uint8_t> s1b;
	in.getState (s1b);
	check (s1b == s1, "getState after setState returns identical bytes", strf ("%zu vs %zu bytes", s1b.size (), s1.size ()),
	       Sev::Warn);
	RenderResult after = in.render (a, o);
	reportRender (in, "state_before_roundtrip", before, {true, true, true});
	reportRender (in, "state_after_roundtrip", after, {true, true, true});
	Comparison c = compareAudio (before.L, before.R, after.L, after.R, (int)in.sr);
	LOG ("  render before vs after getState -> scramble -> setState: %s", cmpStr (c).c_str ());
	check (sameSound (c, ac.deterministic), "state round-trip restores the sound", cmpStr (c));

	// 4) controller state round-trip
	{
		MemoryStream* cs = new MemoryStream ();
		tresult g = kResultFalse, s = kResultFalse;
		guarded ("IEditController::getState", [&] { g = in.ctrl->getState (cs); });
		cs->seek (0, IBStream::kIBSeekSet, nullptr);
		guarded ("IEditController::setState", [&] { s = in.ctrl->setState (cs); });
		LOG ("  controller state: %zu bytes (getState %d, setState %d): %s", cs->data.size (), g, s,
		     parseCtlState (cs->data).str ().c_str ());
		check ((g == kResultOk || g == kNotImplemented) && (s == kResultOk || s == kNotImplemented),
		       "IEditController getState/setState round-trip");
		cs->release ();
	}

	// 5) robustness: empty / truncated / garbage state (old or corrupted projects)
	struct Bad
	{
		const char* name;
		std::vector<uint8_t> data;
	};
	std::vector<Bad> bads;
	bads.push_back ({"empty", {}});
	bads.push_back ({"truncated (half)", std::vector<uint8_t> (s1.begin (), s1.begin () + (ptrdiff_t)(s1.size () / 2))});
	{
		std::vector<uint8_t> g (512);
		std::mt19937 r2 (7);
		for (auto& b : g)
			b = (uint8_t)(r2 () & 0xFF);
		bads.push_back ({"512 random bytes", g});
	}
	{
		std::vector<uint8_t> g = s1;
		for (size_t i = 8; i < g.size (); i += 4)
			g[i] = 0xFF; // corrupt values (e.g. floats -> NaN)
		bads.push_back ({"corrupted values", g});
	}
	Scenario probe = scenarioSingle (in.sr, 60, 0.3, 0.3, "state_probe");
	for (auto& bd : bads)
	{
		std::string crash, crash2;
		tresult r1 = in.setState (bd.data, &crash);
		tresult r2 = in.setComponentStateOnController (bd.data, &crash2);
		LOG ("  setState(%s, %zu bytes) -> component %d, controller %d", bd.name, bd.data.size (), r1, r2);
		check (crash.empty () && crash2.empty (), strf ("setState/setComponentState(%s) does not crash", bd.name),
		       crash + " " + crash2);
		RenderResult pr = in.render (probe, o);
		RenderCheck rc {false, false, true};
		std::string nm = std::string ("render after setState(") + bd.name + ")";
		bool clean = !pr.crashed && pr.nan == 0 && pr.inf == 0;
		check (clean, nm + ": no crash/NaN", strf ("NaN %lld, Inf %lld %s", (long long)pr.nan, (long long)pr.inf, pr.crash.c_str ()),
		       Sev::Warn);
		(void)rc;
	}
	restoreDefault (in, ac);
}

// For each parameter: change it through the processor, load the default state again and
// check that the sound is exactly the default sound (pinpoints values setState() does not apply).
static void testStatePerParam (Instance& in, AudioCtx& ac)
{
	beginSection ("State: setState(default) undoes every parameter change");
	Scenario probe;
	probe.name = "state_probe";
	probe.note (sec (0.02, in.sr), sec (0.35, in.sr), 60, 0.8f);
	probe.note (sec (0.02, in.sr), sec (0.35, in.sr), 67, 0.8f);
	probe.finish (sec (0.6, in.sr));
	RenderOptions o;
	o.block = g_opt.block;
	auto probeAfterDefault = [&] {
		restoreDefault (in, ac);
		return in.render (probe, o);
	};
	RenderResult r0 = probeAfterDefault (), r0b = probeAfterDefault ();
	Comparison c0 = compareAudio (r0.L, r0.R, r0b.L, r0b.R, (int)in.sr);
	LOG ("  probe (C4+G4, default state) rendered twice: %s", cmpStr (c0).c_str ());
	if (c0.maxAbsDiff > 1e-6)
	{
		warn ("per-parameter state isolation", "probe render is not deterministic; cannot isolate parameters");
		return;
	}
	writeWavFloatStereo (outPath ("state_probe_default.wav"), r0.L, r0.R, (int)in.sr);
	std::vector<std::string> bad;
	int tested = 0;
	for (auto& p : in.params)
	{
		if (p.info.flags & (ParameterInfo::kIsReadOnly | ParameterInfo::kIsHidden))
			continue;
		double def = p.info.defaultNormalizedValue;
		double v = quantize (def > 0.5 ? 0.0 : 1.0, p.info.stepCount);
		Scenario set;
		set.name = "state_set_" + p.title;
		set.param (0, p.info.id, v);
		set.finish (sec (0.05, in.sr));
		in.render (set, o);
		settle (in, 0.1);
		RenderResult r = probeAfterDefault ();
		Comparison c = compareAudio (r0.L, r0.R, r.L, r.R, (int)in.sr);
		tested++;
		// put the parameter back through the processor so the next parameter starts clean
		Scenario fix;
		fix.name = "state_fix_" + p.title;
		fix.param (0, p.info.id, def);
		fix.finish (sec (0.05, in.sr));
		in.render (fix, o);
		settle (in, 0.1);
		if (c.maxAbsDiff > 1e-5)
		{
			bad.push_back (strf ("%s (%.2f -> default %.2f): %s", p.title.c_str (), v, def, cmpStr (c).c_str ()));
			LOG ("  NOT restored: %s", bad.back ().c_str ());
			std::string fn = "state_not_restored_" + p.title;
			for (auto& ch : fn)
				if (!isalnum ((unsigned char)ch))
					ch = '_';
			writeWavFloatStereo (outPath (fn + ".wav"), r.L, r.R, (int)in.sr);
		}
	}
	LOG ("  %d parameters tested (each: automate to the far end, setState(default), wait 0.25 s, render C4+G4)", tested);
	std::string all;
	for (auto& b : bad)
		all += b + "; ";
	check (bad.empty (), "setState(default) restores the default sound after any single parameter change",
	       strf ("%zu parameter(s) keep affecting the sound: ", bad.size ()) + all +
	           " (compare state_probe_default.wav with state_not_restored_*.wav)");
}

// Ableton export/freeze renders with kOffline as fast as possible: structural changes must
// not depend on a background thread finishing "in time".
static void testOffline (Instance& in, AudioCtx& ac)
{
	beginSection ("Offline rendering (export / freeze)");
	int iEng = in.findParam ("Engine");
	if (iEng < 0)
	{
		LOG ("  no 'Engine' parameter; skipped");
		return;
	}
	ParamID eid = in.params[(size_t)iEng].info.id;
	auto mk = [&] (double e, const char* name) {
		Scenario s;
		s.name = name;
		s.param (0, eid, e);
		s.note (sec (0.1, in.sr), sec (0.7, in.sr), 57, 0.8f);
		s.finish (sec (1.0, in.sr));
		return s;
	};
	Scenario sA = mk (0.0, "offline_ref_engineA_paced"), sB = mk (1.0, "offline_engineB_paced");
	RenderOptions paced, fast;
	paced.block = fast.block = g_opt.block;
	paced.realtime = true;
	fast.realtime = false;
	restoreDefault (in, ac);
	RenderResult rA = in.render (sA, paced);
	restoreDefault (in, ac);
	RenderResult rB = in.render (sB, paced);
	restoreDefault (in, ac);
	in.processMode = kOffline;
	in.configure (in.sr, g_opt.block, true);
	sB.name = "offline_engineB_kOffline";
	RenderResult rOff = in.render (sB, fast);
	in.processMode = kRealtime;
	in.configure (in.sr, g_opt.block, false);
	restoreDefault (in, ac);
	sB.name = "offline_engineB_realtime_unpaced";
	RenderResult rFast = in.render (sB, fast);
	reportRender (in, "offline_ref_engineA_paced", rA, {true, true, true});
	reportRender (in, "offline_engineB_paced", rB, {true, true, true});
	reportRender (in, "offline_engineB_kOffline", rOff, {true, true, true});
	reportRender (in, "offline_engineB_realtime_unpaced", rFast, {true, true, true});
	int64 from = sec (0.2, in.sr), len = sec (0.4, in.sr);
	double f0 = 220.0;
	auto pA = harmonicProfile (rA.L, rA.R, from, len, in.sr, f0, 12), pB = harmonicProfile (rB.L, rB.R, from, len, in.sr, f0, 12);
	auto pO = harmonicProfile (rOff.L, rOff.R, from, len, in.sr, f0, 12), pF = harmonicProfile (rFast.L, rFast.R, from, len, in.sr, f0, 12);
	LOG ("  harmonic levels of A3 (220 Hz), first 8 harmonics:");
	LOG ("    engine A, real time         %s", profileStr (pA).c_str ());
	LOG ("    engine B, real time         %s", profileStr (pB).c_str ());
	LOG ("    engine B, kOffline          %s", profileStr (pO).c_str ());
	LOG ("    engine B, unpaced kRealtime %s", profileStr (pF).c_str ());
	double dAB = profileDiffDb (pA, pB), dOB = profileDiffDb (pO, pB), dOA = profileDiffDb (pO, pA), dFB = profileDiffDb (pF, pB);
	check (dAB > 3.0, "Engine A and B sound different in real time (sanity)", strf ("max harmonic difference %.1f dB", dAB));
	if (dAB > 3.0)
	{
		check (dOB < 1.5, "kOffline render after an Engine change has the new timbre (export/freeze)",
		       strf ("kOffline vs real-time engine B: %.1f dB, vs engine A: %.1f dB", dOB, dOA) +
		           (dOB < 1.5 ? "" : " (structural rebuild not awaited in offline mode -> exported audio differs from playback)"));
		LOG ("  (info) unpaced kRealtime vs real-time engine B: %.1f dB (a host processing faster than real time in "
		     "realtime mode is not expected to get the new timbre immediately)",
		     dFB);
	}
}

// Which host action makes the output non-deterministic? Each sequence is repeated 3 times
// and the renders are compared with the first one.
static void testDeterminismExperiment (Instance& in, AudioCtx& ac)
{
	beginSection ("Determinism experiment");
	Scenario probe;
	probe.name = "det_probe";
	probe.note (sec (0.02, in.sr), sec (0.35, in.sr), 60, 0.8f);
	probe.note (sec (0.02, in.sr), sec (0.35, in.sr), 67, 0.8f);
	probe.finish (sec (0.6, in.sr));
	RenderOptions o;
	o.block = g_opt.block;
	auto silence = [&] (double secs, bool paced) {
		Scenario s;
		s.name = "det_silence";
		s.finish (sec (secs, in.sr));
		RenderOptions so;
		so.block = g_opt.block;
		so.reset = false;
		so.realtime = paced;
		in.render (s, so);
	};
	struct Seq
	{
		const char* name;
		std::function<void ()> before;
	};
	std::vector<Seq> seqs = {
	    {"reset + render", [] {}},
	    {"setState(default) + render", [&] { in.loadState (ac.defaultState); }},
	    {"setState(default) + 300 ms wall-clock wait (no process) + render", [&] {
		     in.loadState (ac.defaultState);
		     pump (300);
	     }},
	    {"0.25 s silence (unpaced, no reset) + render", [&] { silence (0.25, false); }},
	    {"0.25 s silence (paced, no reset) + render", [&] { silence (0.25, true); }},
	    {"setState(default) + 0.25 s paced silence + render", [&] {
		     in.loadState (ac.defaultState);
		     silence (0.25, true);
	     }},
	};
	for (auto& sq : seqs)
	{
		std::vector<RenderResult> rs;
		for (int i = 0; i < 3; i++)
		{
			sq.before ();
			rs.push_back (in.render (probe, o));
		}
		std::string d;
		bool same = true;
		for (int i = 1; i < 3; i++)
		{
			Comparison c = compareAudio (rs[0].L, rs[0].R, rs[(size_t)i].L, rs[(size_t)i].R, (int)in.sr);
			same &= c.maxAbsDiff < 1e-6;
			d += strf ("  #%d: %s\n", i + 1, cmpStr (c).c_str ());
		}
		LOG ("  %-62s -> %s", sq.name, same ? "identical" : "DIFFERENT");
		if (!same)
			for (size_t p0 = 0, p1; (p1 = d.find ('\n', p0)) != std::string::npos; p0 = p1 + 1)
				LOG ("    %s", d.substr (p0, p1 - p0).c_str ());
	}
	restoreDefault (in, ac);
}

//==============================================================================
// Spec presets (file written by tests/vst3host/make_presets.js) and sub oscillator
//==============================================================================
struct SpecPreset
{
	int index = 0;
	std::string name;
	std::vector<std::pair<ParamID, double>> plain; // every parameter: spec default or preset value
};
struct SpecPresets
{
	std::string defaultName;
	std::vector<SpecPreset> list;
};
static SpecPresets g_specPresets;
static std::map<ParamID, double> g_initialCtrl; // controller values right after instantiation

static std::vector<std::string> splitStr (const std::string& s, char sep)
{
	std::vector<std::string> out;
	size_t p0 = 0, p1;
	while ((p1 = s.find (sep, p0)) != std::string::npos)
	{
		out.push_back (s.substr (p0, p1 - p0));
		p0 = p1 + 1;
	}
	out.push_back (s.substr (p0));
	return out;
}

static bool loadSpecPresets (const std::wstring& path, SpecPresets& sp)
{
	FILE* f = _wfopen (path.c_str (), L"rb");
	if (!f)
		return false;
	std::string all;
	char buf[65536];
	size_t n;
	while ((n = fread (buf, 1, sizeof buf, f)) > 0)
		all.append (buf, n);
	fclose (f);
	for (auto& line : splitStr (all, '\n'))
	{
		if (!line.empty () && line.back () == '\r')
			line.pop_back ();
		auto t = splitStr (line, '\t');
		if (t.size () == 2 && t[0] == "default")
			sp.defaultName = t[1];
		else if (t.size () == 4 && t[0] == "preset")
		{
			SpecPreset p;
			p.index = atoi (t[1].c_str ());
			p.name = t[2];
			for (auto& kv : splitStr (t[3], ';'))
			{
				size_t e = kv.find ('=');
				if (e != std::string::npos)
					p.plain.push_back ({(ParamID)atoi (kv.substr (0, e).c_str ()), atof (kv.substr (e + 1).c_str ())});
			}
			sp.list.push_back (p);
		}
	}
	return !sp.list.empty ();
}

// Host-side preset load: every parameter through inputParameterChanges + controller, then let it settle.
static void applyPlainValues (Instance& in, const std::vector<std::pair<ParamID, double>>& plain,
                              const std::vector<std::pair<ParamID, double>>& normOverrides = {})
{
	Scenario s;
	s.name = "apply_preset";
	std::map<ParamID, double> norm;
	for (auto& kv : plain)
	{
		double n = 0;
		tryCall ([&] { n = in.ctrl->plainParamToNormalized (kv.first, kv.second); });
		norm[kv.first] = n;
	}
	for (auto& kv : normOverrides)
		norm[kv.first] = kv.second;
	for (auto& kv : norm)
	{
		s.param (0, kv.first, kv.second);
		tryCall ([&] { in.ctrl->setParamNormalized (kv.first, kv.second); });
	}
	s.finish (std::min<int64> (g_opt.block, in.maxBlock));
	RenderOptions o;
	o.block = std::min (g_opt.block, in.maxBlock);
	o.reset = false;
	in.render (s, o);
	settle (in, 0.3);
}

static void testInitialPreset (Instance& in, AudioCtx& ac)
{
	beginSection ("Initial sound of a new instance");
	const SpecPreset* dp = nullptr;
	for (auto& p : g_specPresets.list)
		if (p.name == g_specPresets.defaultName)
			dp = &p;
	if (!dp)
	{
		LOG ("  (no DEFAULT_PRESET in the presets file; skipped)");
		return;
	}
	LOG ("  expected initial preset: '%s' (index %d)", dp->name.c_str (), dp->index);
	std::vector<std::string> bad;
	for (auto& kv : dp->plain)
	{
		const ParamRec* pr = in.paramById (kv.first);
		if (!pr || (pr->info.flags & ParameterInfo::kIsHidden))
			continue;
		double want = 0;
		tryCall ([&] { want = in.ctrl->plainParamToNormalized (kv.first, kv.second); });
		auto it = g_initialCtrl.find (kv.first);
		double got = it == g_initialCtrl.end () ? -1 : it->second;
		if (std::fabs (got - want) > 1e-6)
			bad.push_back (strf ("%s: %.6f, preset %.6f", pr->title.c_str (), got, want));
	}
	std::string bs;
	for (auto& b : bad)
		bs += b + "; ";
	check (bad.empty (), "a new instance's controller starts on '" + dp->name + "'", bs);

	// processor: the initial component state, parsed by the controller, must hold the preset values
	{
		std::vector<std::string> pb;
		in.setComponentStateOnController (ac.initialState);
		for (auto& kv : dp->plain)
		{
			const ParamRec* pr = in.paramById (kv.first);
			if (!pr || (pr->info.flags & ParameterInfo::kIsHidden))
				continue;
			double want = 0, got = -1;
			tryCall ([&] {
				want = in.ctrl->plainParamToNormalized (kv.first, kv.second);
				got = in.ctrl->getParamNormalized (kv.first);
			});
			if (std::fabs (got - want) > 1e-6)
				pb.push_back (strf ("%s: %.6f, preset %.6f", pr->title.c_str (), got, want));
		}
		std::string ps;
		for (auto& b : pb)
			ps += b + "; ";
		check (pb.empty (), "a new instance's processor state holds '" + dp->name + "' (parsed via setComponentState)", ps);
	}
	Scenario probe;
	probe.name = "initial_probe";
	probe.note (sec (0.02, in.sr), sec (0.5, in.sr), 60, 0.8f);
	probe.note (sec (0.02, in.sr), sec (0.5, in.sr), 64, 0.8f);
	probe.finish (sec (1.2, in.sr));
	RenderOptions o;
	o.block = g_opt.block;
	in.loadState (ac.initialState);
	resetControllers (in);
	settle (in);
	RenderResult rInit = in.render (probe, o);
	applyPlainValues (in, dp->plain);
	RenderResult rPreset = in.render (probe, o);
	Comparison c = compareAudio (rInit.L, rInit.R, rPreset.L, rPreset.R, (int)in.sr);
	LOG ("  initial processor state vs. host-applied '%s': %s", dp->name.c_str (), cmpStr (c).c_str ());
	check (sameSound (c, ac.deterministic), "a new instance's processor starts on '" + dp->name + "' (same audio)", cmpStr (c));
	restoreDefault (in, ac);
}

static void testSpecPresets (Instance& in, AudioCtx& ac)
{
	beginSection ("Factory presets through the processor");
	if (g_specPresets.list.empty ())
	{
		warn ("factory preset check", "no presets file (run: node tests/vst3host/make_presets.js)");
		return;
	}
	Scenario s;
	s.name = "preset_probe";
	int64 t = sec (0.05, in.sr);
	for (int p : {48, 52, 55, 60})
		s.note (t, t + sec (1.0, in.sr), p, 0.8f);
	s.note (sec (1.3, in.sr), sec (1.8, in.sr), 69, 0.8f);
	const int64 lastOff = sec (1.8, in.sr);
	s.finish (lastOff + sec (8.0, in.sr));
	RenderOptions o;
	o.block = g_opt.block;
	std::vector<std::string> dirty, loud, quiet, tails;
	double worstCpu = 0;
	LOG ("  %-3s %-24s %9s %9s %10s %7s", "#", "preset", "peak dBFS", "RMS dBFS", "tail <-80", "CPU %");
	for (auto& p : g_specPresets.list)
	{
		applyPlainValues (in, p.plain);
		RenderResult r = in.render (s, o);
		SegStats st = segStats (r.L, r.R, 0, (int64)r.L.size ());
		st.peak = std::max (st.peak, r.peak);
		// tail: last 10 ms window above -80 dBFS after the last note-off
		int win = (int)(in.sr / 100);
		int64 lastLoud = lastOff;
		for (int64 i = lastOff; i + win <= (int64)r.L.size (); i += win)
			if (segStats (r.L, r.R, i, i + win).peak > 1e-4)
				lastLoud = i + win;
		double tail = (lastLoud - lastOff) / in.sr;
		double cpu = r.frames ? r.totalUs / (r.frames / in.sr * 1e6) * 100.0 : 0;
		worstCpu = std::max (worstCpu, cpu);
		bool silentEnd = lastLoud + win < (int64)r.L.size ();
		LOG ("  %-3d %-24s %9.1f %9.1f %9s %7.2f", p.index, p.name.c_str (), dbfs (st.peak), dbfs (st.rms),
		     silentEnd ? strf ("%.2f s", tail).c_str () : "> 8 s", cpu);
		bool bad = false;
		if (r.crashed || r.nan || r.inf || r.unclearedNoFlag || r.errors)
		{
			dirty.push_back (strf ("#%d %s: crash=%d NaN=%lld Inf=%lld unwritten=%lld errors=%d %s", p.index, p.name.c_str (), r.crashed,
			                       (long long)r.nan, (long long)r.inf, (long long)r.unclearedNoFlag, r.errors, r.crash.c_str ()));
			bad = true;
		}
		if (st.peak > 1.0)
		{
			loud.push_back (strf ("#%d %s: %.4f", p.index, p.name.c_str (), st.peak));
			bad = true;
		}
		if (st.peak < 1e-3)
		{
			quiet.push_back (strf ("#%d %s: peak %.1f dBFS", p.index, p.name.c_str (), dbfs (st.peak)));
			bad = true;
		}
		if (!silentEnd)
		{
			tails.push_back (strf ("#%d %s", p.index, p.name.c_str ()));
			bad = true;
		}
		if (bad)
			writeWavFloatStereo (outPath (strf ("preset_%02d.wav", p.index)), r.L, r.R, (int)in.sr);
	}
	auto j = [] (const std::vector<std::string>& v) {
		std::string s;
		for (auto& x : v)
			s += x + "; ";
		return s;
	};
	LOG ("  %zu presets; worst real-time CPU %.2f %%", g_specPresets.list.size (), worstCpu);
	check (dirty.empty (), "every factory preset renders cleanly (no crash/NaN/Inf/unwritten samples)", j (dirty));
	check (loud.empty (), "no factory preset exceeds 1.0 (4-note chord + single note, velocity 0.8)", j (loud));
	check (quiet.empty (), "every factory preset produces sound", j (quiet));
	if (!tails.empty ())
		LOG ("  (info) presets still above -80 dBFS 8 s after note-off (long delay/reverb by design): %s", j (tails).c_str ());
	restoreDefault (in, ac);
}

// amplitude of a sinusoid at f (Hann-windowed Goertzel), mono or side signal
static double toneAmp (const std::vector<double>& x, double sr, double f)
{
	size_t n = x.size ();
	double w = 2 * 3.14159265358979 * f / sr, c = 2 * std::cos (w), s1 = 0, s2 = 0, wsum = 0;
	for (size_t i = 0; i < n; i++)
	{
		double win = 0.5 - 0.5 * std::cos (2 * 3.14159265358979 * i / (n - 1));
		wsum += win;
		double s0 = x[i] * win + c * s1 - s2;
		s2 = s1;
		s1 = s0;
	}
	double p = s1 * s1 + s2 * s2 - c * s1 * s2;
	return 2.0 * std::sqrt (std::max (0.0, p)) / wsum;
}

// in-place radix-2 FFT (n power of two)
static void fft (std::vector<double>& re, std::vector<double>& im)
{
	size_t n = re.size ();
	for (size_t i = 1, j = 0; i < n; i++)
	{
		size_t bit = n >> 1;
		for (; j & bit; bit >>= 1)
			j ^= bit;
		j ^= bit;
		if (i < j)
		{
			std::swap (re[i], re[j]);
			std::swap (im[i], im[j]);
		}
	}
	for (size_t len = 2; len <= n; len <<= 1)
	{
		double ang = -2 * 3.14159265358979 / (double)len;
		for (size_t i = 0; i < n; i += len)
			for (size_t k = 0; k < len / 2; k++)
			{
				double wr = std::cos (ang * k), wi = std::sin (ang * k);
				double ur = re[i + k], ui = im[i + k];
				double vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
				double vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
				re[i + k] = ur + vr;
				im[i + k] = ui + vi;
				re[i + k + len / 2] = ur - vr;
				im[i + k + len / 2] = ui - vi;
			}
	}
}

// Energy outside the harmonics of f (relative to the harmonic energy), in dB: aliasing / noise measure.
static double nonHarmonicDb (const std::vector<double>& x, double sr, double f)
{
	size_t n = 1;
	while (n * 2 <= x.size ())
		n *= 2;
	std::vector<double> re (n), im (n, 0.0);
	for (size_t i = 0; i < n; i++)
		re[i] = x[i] * (0.5 - 0.5 * std::cos (2 * 3.14159265358979 * i / (n - 1)));
	fft (re, im);
	double binHz = sr / n, harm = 0, other = 0;
	for (size_t k = (size_t)(30 / binHz); k < n / 2; k++)
	{
		double p = re[k] * re[k] + im[k] * im[k];
		double hz = k * binHz;
		double h = std::round (hz / f);
		if (h >= 1 && std::fabs (hz - h * f) <= 6 * binHz)
			harm += p;
		else
			other += p;
	}
	return 10 * std::log10 (std::max (other, 1e-30) / std::max (harm, 1e-30));
}

// Declared defaults of every parameter (+ normalized overrides), applied through the processor.
static void applyDeclaredDefaults (Instance& in, const std::vector<std::pair<ParamID, double>>& overrides = {})
{
	std::vector<std::pair<ParamID, double>> norm;
	for (auto& p : in.params)
		norm.push_back ({p.info.id, p.info.defaultNormalizedValue});
	for (auto& o : overrides)
		norm.push_back (o);
	applyPlainValues (in, {}, norm);
}

// Largest windowed-Goertzel amplitude between f0 and f1 (1 Hz steps).
static double bandMaxAmp (const std::vector<double>& x, double sr, double f0, double f1)
{
	double m = 0;
	for (double f = f0; f <= f1; f += 1.0)
		m = std::max (m, toneAmp (x, sr, f));
	return m;
}

// Voice history matters for polyphonic portamento (each voice glides from ITS OWN last pitch): prime all
// voices with a released 8-note cluster far away (MIDI 100..107) so that results do not depend on earlier tests.
static void primeVoices (Instance& in)
{
	Scenario s;
	s.name = "prime_voices";
	for (int k = 0; k < 8; k++)
		s.note (sec (0.01, in.sr) + k, sec (0.11, in.sr), 100 + k, 0.3f);
	s.finish (sec (0.45, in.sr));
	RenderOptions o;
	o.block = g_opt.block;
	o.reset = false;
	in.render (s, o);
}

// Portamento: Off / On / Legato only, in mono (1 voice) and poly (8 voices),
// for separated notes and overlapping (legato) notes. A3 (220 Hz) -> E4 (329.6 Hz), Glide 0.3 s.
static void testPortamento (Instance& in, AudioCtx& ac)
{
	beginSection ("Portamento (Off / On / Legato, mono and poly)");
	auto exact = [&] (const char* t) {
		for (size_t i = 0; i < in.params.size (); i++)
			if (lower (in.params[i].title) == lower (t))
				return (int)i;
		return -1;
	};
	int iP = exact ("Portamento"), iG = exact ("Glide"), iV = exact ("Voices"), iR = exact ("Amp Release");
	if (iP < 0 || iG < 0 || iV < 0)
	{
		warn ("Portamento / Glide / Voices parameters present", strf ("%d %d %d", iP, iG, iV));
		return;
	}
	const ParamRec &pP = in.params[(size_t)iP], &pG = in.params[(size_t)iG], &pV = in.params[(size_t)iV];
	std::string modes[3];
	for (int m = 0; m < 3; m++)
	{
		String128 s {};
		double v = pP.info.stepCount > 0 ? (double)m / pP.info.stepCount : 0;
		tryCall ([&] { in.ctrl->getParamStringByValue (pP.info.id, v, s); });
		modes[m] = s16 (s);
	}
	LOG ("  Portamento id %u: %d steps, values '%s' / '%s' / '%s' (default %.2f)", pP.info.id, pP.info.stepCount, modes[0].c_str (),
	     modes[1].c_str (), modes[2].c_str (), pP.info.defaultNormalizedValue);
	auto norm = [&] (const ParamRec& p, double plain) {
		double n = 0;
		tryCall ([&] { n = in.ctrl->plainParamToNormalized (p.info.id, plain); });
		return n;
	};
	const double sr = in.sr, fA = 220.0, fB = 329.6276;
	struct Res
	{
		int mode, voices;
		const char* scen;
		double midDb, endDb;
		bool expectGlide, ok;
	};
	std::vector<Res> res;
	for (int voices : {1, 8})
		for (int mode = 0; mode < 3; mode++)
			for (const char* scen : {"separated", "legato"})
			{
				std::vector<std::pair<ParamID, double>> ov = {
				    {pP.info.id, pP.info.stepCount > 0 ? (double)mode / pP.info.stepCount : 0},
				    {pG.info.id, norm (pG, 0.3)},
				    {pV.info.id, norm (pV, voices)}};
				if (iR >= 0)
					ov.push_back ({in.params[(size_t)iR].info.id, norm (in.params[(size_t)iR], 0.05)});
				if (voices > 1 && mode == 1 && std::string (scen) == "legato")
				{
					LOG ("  (%s, 8 voices, legato: allocation-dependent - checked in the voice-allocation test)", modes[mode].c_str ());
					continue;
				}
				applyDeclaredDefaults (in, ov);
				if (voices > 1)
					primeVoices (in);
				Scenario s;
				s.name = strf ("porta_%s_%s_%dv", modes[mode].c_str (), scen, voices);
				int64 on2;
				if (std::string (scen) == "separated")
				{
					s.note (sec (0.05, sr), sec (0.45, sr), 57, 0.7f);
					on2 = sec (0.75, sr);
					s.note (on2, on2 + sec (0.8, sr), 64, 0.7f);
				}
				else
				{
					s.note (sec (0.05, sr), sec (1.6, sr), 57, 0.7f);
					on2 = sec (0.55, sr);
					s.note (on2, on2 + sec (0.8, sr), 64, 0.7f);
				}
				s.finish (sec (1.8, sr));
				RenderOptions o;
				o.block = g_opt.block;
				o.reset = voices == 1; // keep the primed voice history
				RenderResult r = in.render (s, o);
				auto win = [&] (double a, double b) {
					std::vector<double> x;
					for (int64 i = on2 + sec (a, sr); i < on2 + sec (b, sr) && i < (int64)r.L.size (); i++)
						x.push_back (0.5 * ((double)r.L[(size_t)i] + r.R[(size_t)i]));
					return x;
				};
				auto mid = win (0.07, 0.17), end = win (0.50, 0.60);
				double midDb = dbfs (bandMaxAmp (mid, sr, 245, 305)) - dbfs (toneAmp (mid, sr, fB));
				double endDb = dbfs (bandMaxAmp (end, sr, 245, 305)) - dbfs (toneAmp (end, sr, fB));
				bool expectGlide = mode == 1 || (mode == 2 && std::string (scen) == "legato");
				bool ok = (expectGlide ? midDb > 6 : midDb < -6) && endDb < -6 && !r.crashed && r.nan == 0;
				res.push_back ({mode, voices, scen, midDb, endDb, expectGlide, ok});
				if (!ok)
					writeWavFloatStereo (outPath (s.name + ".wav"), r.L, r.R, (int)sr);
			}
	LOG ("  glide band (245-305 Hz) vs target E4 at +70..170 ms and +500..600 ms after the 2nd note (dB; > 0 = still gliding):");
	LOG ("  %-14s %-6s %-10s %8s %8s  %-9s %s", "mode", "voices", "notes", "+0.12 s", "+0.55 s", "expected", "result");
	std::vector<std::string> bad;
	for (auto& r : res)
	{
		LOG ("  %-14s %-6d %-10s %8.1f %8.1f  %-9s %s", modes[r.mode].c_str (), r.voices, r.scen, r.midDb, r.endDb,
		     r.expectGlide ? "glide" : "no glide", r.ok ? "ok" : "WRONG");
		if (!r.ok)
			bad.push_back (strf ("%s %s %d voice(s): %s at +0.12 s (%.1f dB), end %.1f dB", modes[r.mode].c_str (), r.scen, r.voices,
			                     r.midDb > 6 ? "glides" : r.midDb < -6 ? "no glide" : "unclear", r.midDb, r.endDb));
	}
	std::string bs;
	for (auto& b : bad)
		bs += b + "; ";
	check (bad.empty (), "Portamento: Off never glides; Poly glides (mono; poly melody); Legato glides only when a key is held (mono and poly)", bs);
	restoreDefault (in, ac);
}

// Polyphonic portamento (Voices 8, Glide 0.4 s, neutral patch = declared defaults).
// Isolation: "pluck" envelope (Amp Sustain 0, Decay 0.12 s) so that held notes are silent when the
// next note starts -> the new voice is the only audible one; its START pitch is estimated by
// autocorrelation over the first 12 ms; the nearest candidate (possible sources + target) must be the
// expected source pitch.
static void testPolyPorta (Instance& in, AudioCtx& ac)
{
	beginSection ("Polyphonic portamento (voice allocation)");
	auto exact = [&] (const char* t) {
		for (size_t i = 0; i < in.params.size (); i++)
			if (lower (in.params[i].title) == lower (t))
				return (int)i;
		return -1;
	};
	int iP = exact ("Portamento"), iG = exact ("Glide"), iV = exact ("Voices"), iR = exact ("Amp Release"), iS = exact ("Amp Sustain"),
	    iD = exact ("Amp Decay");
	if (iP < 0 || iG < 0 || iV < 0 || iR < 0 || iS < 0 || iD < 0)
	{
		warn ("Portamento / Glide / Voices / Amp envelope parameters present");
		return;
	}
	auto P = [&] (int i) -> const ParamRec& { return in.params[(size_t)i]; };
	auto norm = [&] (int i, double plain) {
		double n = 0;
		tryCall ([&] { n = in.ctrl->plainParamToNormalized (P (i).info.id, plain); });
		return n;
	};
	auto modeNorm = [&] (int m) { return P (iP).info.stepCount > 0 ? (double)m / P (iP).info.stepCount : 0.0; };
	const double sr = in.sr;
	auto hz = [] (int midi) { return 440.0 * std::pow (2.0, (midi - 69) / 12.0); };
	auto setup = [&] (int mode, bool pluck, double release) {
		std::vector<std::pair<ParamID, double>> ov = {{P (iP).info.id, modeNorm (mode)},
		                                              {P (iG).info.id, norm (iG, 0.4)},
		                                              {P (iV).info.id, norm (iV, 8)},
		                                              {P (iR).info.id, norm (iR, release)}};
		if (pluck)
		{
			ov.push_back ({P (iS).info.id, 0.0});
			ov.push_back ({P (iD).info.id, norm (iD, 0.12)});
		}
		applyDeclaredDefaults (in, ov);
	};
	std::vector<std::string> bad;
	// start pitch of the note that begins at sample `on` (first 12 ms)
	auto startPitch = [&] (const RenderResult& r, int64 on) { return estimatePitchHz (r.L, r.R, on, sec (0.012, sr), sr); };
	auto endPitch = [&] (const RenderResult& r, int64 on) { return estimatePitchHz (r.L, r.R, on + sec (0.42, sr), sec (0.03, sr), sr); };
	auto semis = [] (double a, double b) { return (a > 0 && b > 0) ? 12.0 * std::log2 (a / b) : 99.0; };
	auto judge = [&] (const char* what, double f, int expectMidi, std::initializer_list<int> candidates) {
		int nearest = expectMidi;
		double best = 1e9;
		for (int c : candidates)
			if (std::fabs (semis (f, hz (c))) < best)
			{
				best = std::fabs (semis (f, hz (c)));
				nearest = c;
			}
		// the nearest candidate (other possible sources and the target) must be the expected source
		bool ok = nearest == expectMidi && best < 1.5;
		LOG ("    %-44s start %7.1f Hz  expected %7.1f Hz (MIDI %d)  nearest candidate MIDI %d  %s", what, f, hz (expectMidi), expectMidi,
		     nearest, ok ? "ok" : "WRONG");
		if (!ok)
			bad.push_back (strf ("%s: starts at %.1f Hz (nearest MIDI %d), expected MIDI %d", what, f, nearest, expectMidi));
		return ok;
	};
	RenderOptions o;
	o.block = g_opt.block;
	o.reset = false; // primeVoices() runs right before each scenario

	// 1. POLY, one note at a time, release tails sounding (release 1.5 s): 60 -> 64 -> 67
	{
		setup (1, false, 1.5);
		primeVoices (in);
		Scenario s;
		s.name = "polyporta_melody";
		// the first note is held 1.2 s so that its voice settles (it glides in from the primed pitch)
		int64 t[3] = {sec (0.05, sr), sec (1.5, sr), sec (2.0, sr)};
		int n[3] = {60, 64, 67};
		s.note (t[0], sec (1.25, sr), n[0], 0.5f);
		for (int k = 1; k < 3; k++)
			s.note (t[k], t[k] + sec (0.25, sr), n[k], 0.5f);
		s.finish (sec (3.6, sr));
		RenderResult r = in.render (s, o);
		LOG ("  1. Poly, one note at a time (release 1.5 s tails): 60 -> 64 -> 67");
		bool a = judge ("64 starts from 60", startPitch (r, t[1]), 60, {60, 64, 67});
		bool b = judge ("67 starts from 64", startPitch (r, t[2]), 64, {60, 64, 67});
		LOG ("    end pitches: 64 -> %.1f Hz, 67 -> %.1f Hz", endPitch (r, t[1]), endPitch (r, t[2]));
		if (!(a && b))
			writeWavFloatStereo (outPath (s.name + ".wav"), r.L, r.R, (int)sr);
	}
	// 2. chord change C4-E4-G4 (held, released) -> F4, A4, C5 (each pressed while the previous are held)
	for (int mode : {1, 0})
	{
		setup (mode, true, 0.05);
		primeVoices (in);
		Scenario s;
		s.name = mode == 1 ? "polyporta_chord_poly" : "polyporta_chord_off";
		int64 c0 = sec (0.05, sr), d = 48;
		// the first chord is held 1.2 s so that its voices settle (they glide in from the primed pitches)
		s.note (c0, sec (1.25, sr), 60, 0.5f);
		s.note (c0 + d, sec (1.25, sr), 64, 0.5f);
		s.note (c0 + 2 * d, sec (1.25, sr), 67, 0.5f);
		int64 t[3] = {sec (1.7, sr), sec (2.1, sr), sec (2.5, sr)};
		int n[3] = {65, 69, 72};
		for (int k = 0; k < 3; k++)
			s.note (t[k], sec (3.0, sr), n[k], 0.5f);
		s.finish (sec (3.2, sr));
		RenderResult r = in.render (s, o);
		LOG ("  2. %s: hold C4-E4-G4, release, then F4 / A4 / C5 (each while the previous are held)", mode == 1 ? "Poly" : "Off");
		bool ok = true;
		if (mode == 1)
		{
			ok &= judge ("F4 (first note, most recent free voice = G4)", startPitch (r, t[0]), 67, {60, 64, 67, 65});
			ok &= judge ("A4 (nearest free voice = E4)", startPitch (r, t[1]), 64, {60, 64, 67, 65, 69});
			ok &= judge ("C5 (nearest free voice = C4)", startPitch (r, t[2]), 60, {60, 64, 67, 69, 72});
		}
		else
		{
			ok &= judge ("Off: F4 starts on its own pitch", startPitch (r, t[0]), 65, {60, 64, 67, 65});
			ok &= judge ("Off: A4 starts on its own pitch", startPitch (r, t[1]), 69, {60, 64, 67, 65, 69});
			ok &= judge ("Off: C5 starts on its own pitch", startPitch (r, t[2]), 72, {60, 64, 67, 69, 72});
		}
		if (!ok)
			writeWavFloatStereo (outPath (s.name + ".wav"), r.L, r.R, (int)sr);
	}
	// 3. LEGATO poly: 60 released, then 67 (no key held -> no glide); 67 held, then 72 (glides from 67)
	{
		setup (2, true, 0.05);
		primeVoices (in);
		Scenario s;
		s.name = "polyporta_legato";
		s.note (sec (0.05, sr), sec (0.35, sr), 60, 0.5f);
		int64 t67 = sec (0.8, sr), t72 = sec (1.2, sr);
		s.note (t67, sec (1.9, sr), 67, 0.5f);
		s.note (t72, sec (1.9, sr), 72, 0.5f);
		s.finish (sec (2.1, sr));
		RenderResult r = in.render (s, o);
		LOG ("  3. Legato only, 8 voices: 60 released, then 67; 67 held, then 72");
		bool a = judge ("67 after a released 60 (no glide)", startPitch (r, t67), 67, {60, 67});
		bool b = judge ("72 while 67 is held (glides from 67)", startPitch (r, t72), 67, {60, 67, 72});
		if (!(a && b))
			writeWavFloatStereo (outPath (s.name + ".wav"), r.L, r.R, (int)sr);
	}
	std::string bs;
	for (auto& b : bad)
		bs += b + "; ";
	check (bad.empty (),
	       "polyphonic portamento: melody glides from the previous note, chord change voice by voice (G->F, E->A, C->C5), Legato from the "
	       "held note, Off never glides",
	       bs);
	restoreDefault (in, ac);
}

static void testSubOsc (Instance& in, AudioCtx& ac)
{
	beginSection ("Sub oscillator");
	int iL = in.findParam ("Sub Level"), iO = in.findParam ("Sub Octave"), iS = in.findParam ("Sub Shape");
	if (iL < 0 || iO < 0 || iS < 0)
	{
		warn ("sub oscillator parameters present", strf ("Sub Level %d, Sub Octave %d, Sub Shape %d", iL, iO, iS));
		return;
	}
	const ParamRec &pL = in.params[(size_t)iL], &pO = in.params[(size_t)iO], &pS = in.params[(size_t)iS];
	LOG ("  Sub Level id %u, Sub Octave id %u (%d steps), Sub Shape id %u (%d steps)", pL.info.id, pO.info.id, pO.info.stepCount,
	     pS.info.id, pS.info.stepCount);
	int iCut = in.findParam ("Cutoff");
	// all parameters at their declared defaults (= spec defaults), plus overrides
	auto patch = [&] (double level, int oct, int shape, double cutoffNorm) {
		std::vector<std::pair<ParamID, double>> norm;
		for (auto& p : in.params)
			norm.push_back ({p.info.id, p.info.defaultNormalizedValue});
		norm.push_back ({pL.info.id, level});
		norm.push_back ({pO.info.id, pO.info.stepCount > 0 ? (double)oct / pO.info.stepCount : 0.0});
		norm.push_back ({pS.info.id, pS.info.stepCount > 0 ? (double)shape / pS.info.stepCount : 0.0});
		if (cutoffNorm >= 0 && iCut >= 0)
			norm.push_back ({in.params[(size_t)iCut].info.id, cutoffNorm});
		applyPlainValues (in, {}, norm);
	};
	auto note = [&] (int pitch, const char* name) {
		Scenario s;
		s.name = name;
		s.note (sec (0.05, in.sr), sec (1.05, in.sr), pitch, 0.5f);
		s.finish (sec (1.3, in.sr));
		RenderOptions o;
		o.block = g_opt.block;
		RenderResult r = in.render (s, o);
		writeWavFloatStereo (outPath (std::string (name) + ".wav"), r.L, r.R, (int)in.sr);
		return r;
	};
	const int64 from = sec (0.35, in.sr), len = sec (0.5, in.sr);
	auto mono = [&] (const RenderResult& a, const RenderResult* b, bool side = false) {
		std::vector<double> x ((size_t)len);
		for (int64 i = 0; i < len; i++)
		{
			size_t k = (size_t)(from + i);
			double l = a.L[k] - (b ? b->L[k] : 0.0), r = a.R[k] - (b ? b->R[k] : 0.0);
			x[(size_t)i] = side ? 0.5 * (l - r) : 0.5 * (l + r);
		}
		return x;
	};
	const double f0 = 220.0; // MIDI 57
	patch (0, 0, 0, -1);
	RenderResult r0 = note (57, "sub_off_A3");
	patch (0, 0, 0, -1);
	RenderResult r0b = note (57, "sub_off_A3_repeat");
	bool det = compareAudio (r0.L, r0.R, r0b.L, r0b.R, (int)in.sr).maxAbsDiff < 1e-6;
	LOG ("  renders deterministic: %s (difference signals isolate the sub oscillator%s)", det ? "yes" : "NO",
	     det ? "" : " - shape/aliasing checks skipped");
	patch (1, 0, 0, -1);
	RenderResult r1 = note (57, "sub_sine_m1_A3");
	patch (1, 1, 0, -1);
	RenderResult r2 = note (57, "sub_sine_m2_A3");
	patch (1, 0, 1, -1);
	RenderResult r3 = note (57, "sub_tri_m1_A3");
	patch (1, 0, 2, -1);
	RenderResult r4 = note (57, "sub_square_m1_A3");
	auto m0 = mono (r0, nullptr), m1 = mono (r1, nullptr), m2 = mono (r2, nullptr);
	double a110_0 = toneAmp (m0, in.sr, f0 / 2), a110_1 = toneAmp (m1, in.sr, f0 / 2);
	double a55_0 = toneAmp (m0, in.sr, f0 / 4), a55_2 = toneAmp (m2, in.sr, f0 / 4), a55_1 = toneAmp (m1, in.sr, f0 / 4);
	LOG ("  A3 (220 Hz): level at 110 Hz  sub off %.1f dBFS -> sub -1 oct %.1f dBFS", dbfs (a110_0), dbfs (a110_1));
	LOG ("               level at  55 Hz  sub off %.1f dBFS -> sub -2 oct %.1f dBFS (sub -1 oct: %.1f dBFS)", dbfs (a55_0),
	     dbfs (a55_2), dbfs (a55_1));
	check (dbfs (a110_1) - dbfs (a110_0) > 20, "Sub Level 1, -1 octave adds energy at f0/2 (110 Hz for A3)",
	       strf ("%+.1f dB", dbfs (a110_1) - dbfs (a110_0)));
	check (dbfs (a55_2) - dbfs (a55_0) > 20, "Sub Level 1, -2 octaves adds energy at f0/4 (55 Hz)",
	       strf ("%+.1f dB", dbfs (a55_2) - dbfs (a55_0)));
	check (dbfs (a55_1) < dbfs (a110_1) - 40, "-1 octave puts no significant energy at f0/4 (< -40 dB re. the sub)",
	       strf ("%.1f dB re. the sub fundamental", dbfs (a55_1) - dbfs (a110_1)), Sev::Warn);
	if (det)
	{
		struct Shape
		{
			const char* name;
			const RenderResult* r;
			double h3lo, h3hi; // expected 3rd/1st harmonic ratio (dB)
		} shapes[] = {{"Sine", &r1, -200, -35}, {"Triangle", &r3, -22.5, -16}, {"Square", &r4, -12, -7.5}};
		for (auto& sh : shapes)
		{
			auto d = mono (*sh.r, &r0);
			auto side = mono (*sh.r, &r0, true);
			double h1 = toneAmp (d, in.sr, 110), h2 = toneAmp (d, in.sr, 220), h3 = toneAmp (d, in.sr, 330);
			double sideDb = dbfs (std::sqrt (std::inner_product (side.begin (), side.end (), side.begin (), 0.0) / side.size ())) -
			                dbfs (std::sqrt (std::inner_product (d.begin (), d.end (), d.begin (), 0.0) / d.size ()));
			LOG ("  %-8s sub (difference signal): fundamental %.1f dBFS, H2 %.1f dB, H3 %.1f dB, side/mid %.1f dB", sh.name,
			     dbfs (h1), dbfs (h2) - dbfs (h1), dbfs (h3) - dbfs (h1), sideDb);
			double r3db = dbfs (h3) - dbfs (h1);
			check (r3db >= sh.h3lo && r3db <= sh.h3hi, strf ("Sub Shape %s has the expected spectrum (H3/H1 %.1f dB)", sh.name, r3db),
			       strf ("expected %.1f .. %.1f dB", sh.h3lo, sh.h3hi));
			if (std::string (sh.name) == "Square")
				check (dbfs (h2) - dbfs (h1) < -30, "Sub Square is symmetric (H2/H1 < -30 dB)", strf ("%.1f dB", dbfs (h2) - dbfs (h1)), Sev::Warn);
			check (sideDb < -40, strf ("Sub %s is centred (mono)", sh.name), strf ("side/mid %.1f dB", sideDb));
		}
		// not filtered: same sub with the cutoff fully closed
		if (iCut >= 0)
		{
			patch (0, 0, 0, 0.0);
			RenderResult c0 = note (57, "sub_off_A3_cutoff0");
			patch (1, 0, 0, 0.0);
			RenderResult c1 = note (57, "sub_sine_m1_A3_cutoff0");
			double open = toneAmp (mono (r1, &r0), in.sr, 110), closed = toneAmp (mono (c1, &c0), in.sr, 110);
			LOG ("  sub at 110 Hz with Cutoff open %.1f dBFS, Cutoff 0 %.1f dBFS", dbfs (open), dbfs (closed));
			check (std::fabs (dbfs (open) - dbfs (closed)) < 1.5, "the sub oscillator is not affected by the scale filter (Cutoff 0 vs open)",
			       strf ("%+.1f dB", dbfs (closed) - dbfs (open)));
		}
		// aliasing of the square sub on a high note: C7 (2093 Hz) -> sub 1046.5 Hz
		patch (0, 0, 2, -1);
		RenderResult h0 = note (96, "sub_off_C7");
		patch (1, 0, 2, -1);
		RenderResult h1 = note (96, "sub_square_m1_C7");
		auto d = mono (h1, &h0);
		double fsub = 440.0 * std::pow (2.0, (96 - 69) / 12.0) / 2.0;
		double alias = nonHarmonicDb (d, in.sr, fsub);
		std::vector<double> naive (d.size ());
		for (size_t i = 0; i < naive.size (); i++)
			naive[i] = std::sin (2 * 3.14159265358979 * fsub * (double)i / in.sr) >= 0 ? 0.3 : -0.3;
		double naiveDb = nonHarmonicDb (naive, in.sr, fsub);
		// reference: textbook 2-point PolyBLEP square at the same frequency
		std::vector<double> blep (d.size ());
		{
			auto pb = [] (double t, double dt) {
				if (t < dt) { t /= dt; return t + t - t * t - 1.0; }
				if (t > 1.0 - dt) { t = (t - 1.0) / dt; return t * t + t + t + 1.0; }
				return 0.0;
			};
			double ph = 0, dt = fsub / in.sr;
			for (size_t i = 0; i < blep.size (); i++)
			{
				double v = ph < 0.5 ? 1.0 : -1.0;
				v += pb (ph, dt);
				v -= pb (std::fmod (ph + 0.5, 1.0), dt);
				blep[i] = 0.3 * v;
				ph += dt;
				if (ph >= 1.0)
					ph -= 1.0;
			}
		}
		double blepDb = nonHarmonicDb (blep, in.sr, fsub);
		LOG ("  square sub at %.1f Hz: non-harmonic (aliasing) energy %.1f dB re. harmonics; reference PolyBLEP square %.1f dB, naive square %.1f dB",
		     fsub, alias, blepDb, naiveDb);
		check (alias < naiveDb - 10 && alias <= blepDb + 3, "Sub Square is band-limited (aliasing at PolyBLEP level, far below a naive square)",
		       strf ("%.1f dB (PolyBLEP reference %.1f dB, naive %.1f dB)", alias, blepDb, naiveDb));
	}
	// state includes the sub parameters
	{
		patch (0.37, 1, 1, -1);
		std::vector<uint8_t> st;
		in.getState (st);
		restoreDefault (in, ac);
		in.setComponentStateOnController (st);
		double l = -1, o = -1, s = -1;
		tryCall ([&] {
			l = in.ctrl->getParamNormalized (pL.info.id);
			o = in.ctrl->getParamNormalized (pO.info.id);
			s = in.ctrl->getParamNormalized (pS.info.id);
		});
		double wantS = pS.info.stepCount > 0 ? 1.0 / pS.info.stepCount : 0;
		check (std::fabs (l - 0.37) < 1e-4 && std::fabs (o - 1.0) < 1e-6 && std::fabs (s - wantS) < 1e-6,
		       "component state carries Sub Level / Octave / Shape to the controller",
		       strf ("level %.4f (0.37), octave %.4f (1), shape %.4f (%.4f)", l, o, s, wantS));
	}
	restoreDefault (in, ac);
}

//==============================================================================
// Security regressions: notes far above Nyquist (oscillator phase / mip table bounds)
//==============================================================================
static void testHighNotes (Instance& in, AudioCtx& ac)
{
	beginSection ("High notes above Nyquist (oscillator / mip-table bounds)");
	auto exact = [&] (const char* t) {
		for (size_t i = 0; i < in.params.size (); i++)
			if (lower (in.params[i].title) == lower (t))
				return (int)i;
		return -1;
	};
	int iO = exact ("Octave"), iL = exact ("Sub Level"), iSO = exact ("Sub Octave"), iSS = exact ("Sub Shape");
	if (iO < 0 || iL < 0 || iSO < 0 || iSS < 0)
	{
		warn ("Octave / Sub parameters present");
		return;
	}
	auto P = [&] (int i) -> const ParamRec& { return in.params[(size_t)i]; };
	auto norm = [&] (int i, double plain) {
		double n = 0;
		tryCall ([&] { n = in.ctrl->plainParamToNormalized (P (i).info.id, plain); });
		return n;
	};
	struct Case
	{
		int oct, note;
		bool bendMax;
	};
	std::vector<Case> cases = {{3, 127, false}, {3, 115, false}, {2, 127, false}};
	if (ac.bendId != kNoParamId)
		cases.push_back ({3, 127, true});
	const double savedSr = in.sr;
	std::vector<std::string> crashes, nonFinite, notSilent, subWrong, afterBad;
	int renders = 0;
	LOG ("  %-9s %-6s %-14s %-5s %10s %10s %9s %9s  %s", "mode", "sr", "case", "sub", "f0 Hz", "sub Hz", "peak dB", "sub dB", "expected");
	for (int mode : {(int)kRealtime, (int)kOffline})
	{
		in.processMode = mode;
		for (double sr : {44100.0, 48000.0, 96000.0})
		{
			in.configure (sr, g_opt.block, false);
			for (auto& c : cases)
				for (double subLevel : {0.0, 0.8})
				{
					std::vector<std::pair<ParamID, double>> ov = {{P (iO).info.id, norm (iO, c.oct)},
					                                              {P (iL).info.id, subLevel},
					                                              {P (iSO).info.id, 0.0},  // -1 octave
					                                              {P (iSS).info.id, 0.0}}; // sine
					if (c.bendMax)
						ov.push_back ({ac.bendId, 1.0});
					applyDeclaredDefaults (in, ov);
					Scenario s;
					s.name = strf ("hinote_%s_%d_oct%+d_n%d%s_sub%.1f", mode == kOffline ? "offline" : "rt", (int)sr, c.oct, c.note,
					               c.bendMax ? "_bend" : "", subLevel);
					s.note (sec (0.05, sr), sec (0.45, sr), c.note, 0.8f);
					s.finish (sec (0.7, sr));
					RenderOptions o;
					o.block = g_opt.block;
					RenderResult r = in.render (s, o);
					renders++;
					const double bend = c.bendMax ? 2.0 : 0.0;
					const double f0 = 440.0 * std::pow (2.0, (c.note + 12 * c.oct + bend - 69) / 12.0), fsub = f0 / 2;
					const bool tableAudible = f0 < sr / 2, subAudible = subLevel > 0 && fsub < sr / 2;
					SegStats st = segStats (r.L, r.R, 0, (int64)r.L.size ());
					st.peak = std::max (st.peak, r.peak);
					double subDb = -240;
					if (subAudible && fsub < sr / 2 - 100)
					{
						std::vector<double> x;
						for (int64 i = sec (0.15, sr); i < sec (0.4, sr); i++)
							x.push_back (0.5 * ((double)r.L[(size_t)i] + r.R[(size_t)i]));
						subDb = dbfs (toneAmp (x, sr, fsub));
					}
					std::string expect = tableAudible ? "table audible" : subAudible ? "only the sub" : "silent";
					std::string id = strf ("%s %.0f Hz oct %+d note %d%s sub %.1f", mode == kOffline ? "offline" : "realtime", sr, c.oct,
					                       c.note, c.bendMax ? " bend+2" : "", subLevel);
					LOG ("  %-9s %-6.0f %-14s %-5.1f %10.0f %10.0f %9.1f %9.1f  %s", mode == kOffline ? "offline" : "realtime", sr,
					     strf ("oct%+d n%d%s", c.oct, c.note, c.bendMax ? " b+2" : "").c_str (), subLevel, f0, fsub, dbfs (st.peak), subDb,
					     expect.c_str ());
					if (r.crashed)
						crashes.push_back (id + ": " + r.crash);
					if (r.nan || r.inf || r.unclearedNoFlag)
						nonFinite.push_back (strf ("%s: NaN %lld Inf %lld unwritten %lld", id.c_str (), (long long)r.nan, (long long)r.inf,
						                           (long long)r.unclearedNoFlag));
					if (!tableAudible && !subAudible && st.peak > 1e-5)
						notSilent.push_back (strf ("%s: peak %.1f dBFS (expected silence)", id.c_str (), dbfs (st.peak)));
					if (!tableAudible && subAudible && !(subDb > dbfs (st.peak) - 6))
						subWrong.push_back (strf ("%s: sub at %.0f Hz %.1f dB vs peak %.1f dB", id.c_str (), fsub, subDb, dbfs (st.peak)));
					if (r.crashed || r.nan || r.inf || (!tableAudible && !subAudible && st.peak > 1e-5))
						writeWavFloatStereo (outPath (s.name + ".wav"), r.L, r.R, (int)sr);
					// a normal C4 afterwards (Octave 0)
					applyDeclaredDefaults (in);
					Scenario n;
					n.name = "hinote_after_C4";
					n.note (sec (0.05, sr), sec (0.45, sr), 60, 0.8f);
					n.finish (sec (0.6, sr));
					RenderResult rn = in.render (n, o);
					double f = estimatePitchHz (rn.L, rn.R, sec (0.15, sr), sec (0.1, sr), sr);
					SegStats sn = segStats (rn.L, rn.R, 0, (int64)rn.L.size ());
					if (rn.crashed || rn.nan || rn.inf || sn.peak < 1e-3 || std::fabs (12 * std::log2 (std::max (f, 1.0) / 261.63)) > 0.5)
						afterBad.push_back (strf ("%s: next C4 peak %.1f dBFS, pitch %.1f Hz, NaN %lld %s", id.c_str (), dbfs (sn.peak), f,
						                          (long long)rn.nan, rn.crash.c_str ()));
				}
		}
	}
	in.processMode = kRealtime;
	in.configure (savedSr, g_opt.block, false);
	auto j = [] (const std::vector<std::string>& v) {
		std::string s;
		for (auto& x : v)
			s += x + "; ";
		return s;
	};
	LOG ("  %d renders (realtime + offline, 44.1/48/96 kHz, sub off/on), each followed by a normal C4", renders);
	check (crashes.empty (), "high notes (Octave +3 note 127/115, Octave +2 note 127): no crash", j (crashes));
	check (nonFinite.empty (), "high notes: every output sample finite and written", j (nonFinite));
	check (notSilent.empty (), "high notes: the wavetable part is silent when f0 >= sr/2 (and the sub when f0/2 >= sr/2)", j (notSilent));
	check (subWrong.empty (), "high notes: when only the sub is below Nyquist, the output is the sub", j (subWrong));
	check (afterBad.empty (), "a normal C4 after each high note plays normally (sound, 261.6 Hz, finite)", j (afterBad));
	restoreDefault (in, ac);
}

//==============================================================================
// Security regressions: the plug-in's own IMessage / IAttributeList
//==============================================================================
// Pass-through connection (like Cubase's connection proxy): forwards notify() and lets the test see
// the plug-in's messages.
class SpyConnection final : public IConnectionPoint
{
public:
	IConnectionPoint* target = nullptr;
	std::function<void (IMessage*)> onMessage;
	int forwarded = 0;
	tresult PLUGIN_API connect (IConnectionPoint*) override { return kResultOk; }
	tresult PLUGIN_API disconnect (IConnectionPoint*) override { return kResultOk; }
	tresult PLUGIN_API notify (IMessage* m) override
	{
		if (m && onMessage)
			onMessage (m);
		forwarded++;
		return target ? target->notify (m) : kResultFalse;
	}
	tresult PLUGIN_API queryInterface (const TUID _iid, void** obj) override
	{
		QI_ENTRY (IConnectionPoint)
		QI_UNKNOWN (IConnectionPoint)
		*obj = nullptr;
		return kNoInterface;
	}
	HOST_REFCOUNT
};

static void probeAttrList (IAttributeList* al, std::vector<std::string>& bad, int& calls)
{
	auto code = [] (tresult r) { return strf ("0x%08X", (unsigned)r); };
	auto expectInvalid = [&] (const char* what, tresult r) {
		calls++;
		LOG ("    %-46s -> %s%s", what, code (r).c_str (), r == kInvalidArgument ? " (kInvalidArgument)" : "");
		if (r == kResultOk)
			bad.push_back (strf ("%s returned kResultOk", what));
		else if (r != kInvalidArgument)
			LOG ("      (rejected, but not with kInvalidArgument)");
	};
	auto run = [&] (const char* what, std::function<void ()> f) {
		std::string err = tryCall (f);
		if (!err.empty ())
			bad.push_back (strf ("%s crashed: %s", what, err.c_str ()));
	};
	char16 hello[] = {'h', 'e', 'l', 'l', 'o', 0};
	run ("setString(\"ws.qa\", \"hello\")", [&] {
		tresult r = al->setString ("ws.qa", hello);
		calls++;
		LOG ("    %-46s -> %s", "setString(\"ws.qa\", \"hello\")", code (r).c_str ());
		if (r != kResultOk)
			bad.push_back ("setString of a valid attribute failed");
	});
	// canary-guarded buffer: 40 char16, the call gets &buf[8]
	for (uint32 size : {0u, 1u, 2u, 3u, 6u, 64u})
	{
		char16 buf[48];
		for (auto& c : buf)
			c = 0xA5A5;
		tresult r = kResultFalse;
		run (strf ("getString(\"ws.qa\", buf, %u)", size).c_str (), [&] { r = al->getString ("ws.qa", buf + 8, size); });
		calls++;
		uint32 writable = size / 2; // char16 slots the call may write
		bool canaryOk = true;
		for (int i = 0; i < 48; i++)
			if ((i < 8 || i >= 8 + (int)writable) && buf[i] != 0xA5A5)
				canaryOk = false;
		std::string got;
		if (r == kResultOk)
			for (int i = 8; i < 48 && buf[i] && buf[i] != 0xA5A5; i++)
				got += (char)buf[i];
		LOG ("    %-46s -> %s, string '%s', guard bytes %s", strf ("getString(\"ws.qa\", buf, %u)", size).c_str (), code (r).c_str (), got.c_str (),
		     canaryOk ? "intact" : "OVERWRITTEN");
		if (!canaryOk)
			bad.push_back (strf ("getString(size %u) wrote outside the %u-byte buffer", size, size));
		if (size < 2 && r == kResultOk)
			bad.push_back (strf ("getString(size %u) returned kResultOk", size));
		if (size == 6 && r == kResultOk && got != "he")
			bad.push_back (strf ("getString(size 6) returned '%s' (expected 'he')", got.c_str ()));
		if (size == 64 && (r != kResultOk || got != "hello"))
			bad.push_back (strf ("getString(size 64) returned %s '%s'", code (r).c_str (), got.c_str ()));
	}
	char16 buf[64];
	run ("null ids/buffers", [&] {
		expectInvalid ("getString(null id, buf, 128)", al->getString (nullptr, buf, 128));
		expectInvalid ("getString(\"ws.qa\", null buffer, 128)", al->getString ("ws.qa", nullptr, 128));
		expectInvalid ("setString(null id, \"hello\")", al->setString (nullptr, hello));
		expectInvalid ("setString(\"x\", null string)", al->setString ("x", nullptr));
		expectInvalid ("setBinary(\"b\", null data, 5)", al->setBinary ("b", nullptr, 5));
		expectInvalid ("setBinary(null id, data, 3)", al->setBinary (nullptr, hello, 3));
		const void* d = nullptr;
		uint32 sz = 0;
		expectInvalid ("getBinary(null id, ...)", al->getBinary (nullptr, d, sz));
		int64 iv = 0;
		double fv = 0;
		expectInvalid ("setInt(null id, 1)", al->setInt (nullptr, 1));
		expectInvalid ("getInt(null id, ...)", al->getInt (nullptr, iv));
		expectInvalid ("setFloat(null id, 1.0)", al->setFloat (nullptr, 1.0));
		expectInvalid ("getFloat(null id, ...)", al->getFloat (nullptr, fv));
		tresult r = al->setBinary ("b", hello, 3);
		calls++;
		tresult g = al->getBinary ("b", d, sz);
		calls++;
		LOG ("    %-46s -> %s / getBinary %s size %u", "setBinary(\"b\", data, 3)", code (r).c_str (), code (g).c_str (), sz);
		if (r != kResultOk || g != kResultOk || sz != 3)
			bad.push_back ("setBinary/getBinary round trip of 3 bytes failed");
	});
}

static void testPluginAttrList (Module& m)
{
	beginSection ("Plug-in's own IMessage / IAttributeList (host without IMessage support)");
	HostApplication* noMsgHost = new HostApplication ();
	noMsgHost->refuseMessages = true;
	Instance p;
	p.label = " (no-IMessage host)";
	std::vector<std::string> bad;
	int calls = 0, messages = 0;
	std::set<std::string> ids;
	auto onMsg = [&] (IMessage* msg) {
		messages++;
		const char* id = nullptr;
		tryCall ([&] { id = msg->getMessageID (); });
		ids.insert (id ? id : "(null)");
		if (calls == 0)
		{
			IAttributeList* al = nullptr;
			tryCall ([&] { al = msg->getAttributes (); });
			LOG ("  intercepted the plug-in's own message '%s' (attributes %p); probing its IAttributeList:", id ? id : "(null)", (void*)al);
			if (al)
				probeAttrList (al, bad, calls);
			else
				bad.push_back ("plug-in message without attributes");
		}
	};
	p.connectWrap = [&] (IConnectionPoint* target) {
		auto* s = new SpyConnection ();
		s->target = target;
		s->onMessage = onMsg;
		return s;
	};
	bool ok = createInstance (p, m, noMsgHost, false);
	check (ok, "instance created with a host that refuses IHostApplication::createInstance(IMessage)");
	if (ok)
	{
		SpeakerArrangement stereo = SpeakerArr::kStereo;
		tryCall ([&] {
			p.proc->setBusArrangements (nullptr, 0, &stereo, 1);
			p.comp->activateBus (kEvent, kInput, 0, true);
			p.comp->activateBus (kAudio, kOutput, 0, true);
		});
		p.configure (g_opt.sr, g_opt.block, false);
		Scenario s = scenarioSingle (g_opt.sr, 60, 0.3, 0.2, "attr_probe_note");
		RenderOptions o;
		o.block = g_opt.block;
		RenderResult r = p.render (s, o);
		check (!r.crashed && r.nan == 0 && segStats (r.L, r.R, 0, (int64)r.L.size ()).peak > 1e-4,
		       "the plug-in works with its own IMessage objects (through a pass-through connection proxy)", r.crash);
	}
	std::string idl;
	for (auto& i : ids)
		idl += " " + i;
	LOG ("  %d plug-in messages intercepted (ids:%s); %d attribute-list calls", messages, idl.c_str (), calls);
	if (messages == 0)
		warn ("plug-in sends its own IMessage when the host has no IMessage support", "no message intercepted; AttrList could not be probed");
	else
	{
		std::string bs;
		for (auto& b : bad)
			bs += b + "; ";
		check (bad.empty (), "plug-in AttrList: null ids/buffers and sizes < 2 rejected, no write outside the buffer, valid calls work", bs);
	}
	p.destroy ();
	noMsgHost->release ();
}

//==============================================================================
// Stress tests
//==============================================================================
static void testStress (Instance& in, AudioCtx& ac)
{
	beginSection ("Stress: random automation");
	RenderOptions o;
	o.block = g_opt.block;
	std::vector<const ParamRec*> autom;
	for (auto& p : in.params)
		if (!(p.info.flags & ParameterInfo::kIsReadOnly) &&
		    (!(p.info.flags & ParameterInfo::kIsHidden) || p.info.id == ac.bendId || p.info.id == ac.modId))
			autom.push_back (&p);
	{
		Scenario s;
		s.name = "stress_automation";
		std::mt19937 rng (1234);
		int64 len = sec (g_opt.quick ? 2.0 : 4.0, in.sr);
		// random notes (up to 6 held)
		std::vector<int> held;
		for (int64 t = sec (0.02, in.sr); t < len - sec (0.3, in.sr); t += sec (0.1, in.sr) + rng () % 512)
		{
			if (held.size () >= 6 || (!held.empty () && rng () % 3 == 0))
			{
				int k = (int)(rng () % held.size ());
				s.noteOff (t, held[(size_t)k]);
				held.erase (held.begin () + k);
			}
			else
			{
				int p = 36 + (int)(rng () % 48);
				if (std::find (held.begin (), held.end (), p) == held.end ())
				{
					s.noteOn (t, p, 0.3f + (rng () % 70) / 100.f);
					held.push_back (p);
				}
			}
		}
		for (int p : held)
			s.noteOff (len - sec (0.3, in.sr), p);
		// random automation: every block 1-6 parameters with 1-3 points
		for (int64 b = 0; b < len && !autom.empty (); b += g_opt.block)
		{
			int np = 1 + (int)(rng () % 6);
			for (int k = 0; k < np; k++)
			{
				const ParamRec* p = autom[rng () % autom.size ()];
				int pts = 1 + (int)(rng () % 3);
				std::vector<int> offs;
				for (int q = 0; q < pts; q++)
					offs.push_back ((int)(rng () % (uint32)g_opt.block));
				std::sort (offs.begin (), offs.end ());
				for (int off : offs)
					s.param (b + off, p->info.id, quantize ((rng () % 1001) / 1000.0, p->info.stepCount));
			}
		}
		s.finish (len + sec (0.5, in.sr));
		// meanwhile the UI thread changes controller values and asks for display strings (like an open DAW)
		std::mt19937 rng2 (99);
		o.mainTask = [&] {
			if (autom.empty ())
				return;
			const ParamRec* p = autom[rng2 () % autom.size ()];
			double v = (rng2 () % 1001) / 1000.0;
			tryCall ([&] {
				in.ctrl->setParamNormalized (p->info.id, v);
				String128 str;
				in.ctrl->getParamStringByValue (p->info.id, v, str);
			});
			pumpOnce ();
			Sleep (2);
		};
		LOG ("  %zu automatable parameters, %zu automation points, %zu note events", autom.size (), s.params.size (),
		     s.notes.size ());
		RenderResult r = in.render (s, o);
		o.mainTask = nullptr;
		reportRender (in, s.name, r, {false, true, false});
		restoreDefault (in, ac); // includes resetting pitch bend / mod wheel / sustain
	}

	beginSection ("Stress: polyphony overflow and fast repeats");
	{
		Scenario s;
		s.name = "stress_many_notes";
		int64 t = sec (0.05, in.sr);
		for (int p = 36; p < 36 + 48; p++)
			s.note (t + (p * 5) % g_opt.block, t + sec (1.5, in.sr) + (p * 3) % g_opt.block, p, 0.8f, p);
		s.finish (t + sec (1.5, in.sr) + sec (3.5, in.sr));
		RenderResult r = in.render (s, o);
		reportRender (in, s.name, r);
		SegStats last = segStats (r.L, r.R, (int64)r.L.size () - sec (0.5, in.sr), (int64)r.L.size ());
		check (last.peak < 3.2e-5, "48 simultaneous notes (> polyphony): no stuck voice after release",
		       strf ("last 0.5 s peak %.1f dBFS", dbfs (last.peak)));
	}
	{
		Scenario s;
		s.name = "stress_fast_repeats";
		int64 t = sec (0.05, in.sr);
		for (int i = 0; i < 60; i++)
		{
			int p = 48 + (i % 3) * 7;
			s.note (t, t + sec (0.012, in.sr), p, 0.9f);
			t += sec (0.02, in.sr);
		}
		s.finish (t + sec (2.0, in.sr));
		RenderResult r = in.render (s, o);
		reportRender (in, s.name, r);
		SegStats last = segStats (r.L, r.R, (int64)r.L.size () - sec (0.5, in.sr), (int64)r.L.size ());
		check (last.peak < 3.2e-5, "60 notes of 12 ms in 1.2 s: silent afterwards", strf ("last 0.5 s peak %.1f dBFS", dbfs (last.peak)));
	}

	beginSection ("Stress: block sizes");
	{
		Scenario s = scenarioShort (in.sr, g_opt.block);
		RenderOptions ro;
		ro.block = g_opt.block;
		RenderResult ref = in.render (s, ro);
		reportRender (in, "blocks_ref_" + std::to_string (g_opt.block), ref, {true, false, true});
		std::vector<int> sizes = {1, 7, 64};
		if (g_opt.quick)
			sizes = {7, 64};
		auto cmpTo = [&] (const std::string& name, const RenderResult& r) {
			reportRender (in, name, r, {true, name.find ("4096") != std::string::npos, true});
			Comparison c = compareAudio (ref.L, ref.R, r.L, r.R, (int)in.sr);
			LOG ("    vs block %d: %s", g_opt.block, cmpStr (c).c_str ());
			check (c.maxEnvDiffDb < 3.0, name + ": sounds the same as block " + std::to_string (g_opt.block), cmpStr (c),
			       Sev::Warn);
		};
		for (int bs : sizes)
		{
			ro.block = bs;
			cmpTo ("blocks_" + std::to_string (bs), in.render (s, ro));
		}
		ro.block = g_opt.block;
		ro.randomBlocks = true;
		cmpTo ("blocks_random_1_to_" + std::to_string (g_opt.block), in.render (s, ro));
		ro.randomBlocks = false;
		// large block: needs maxSamplesPerBlock 4096
		in.configure (in.sr, 4096, false);
		ro.block = 4096;
		cmpTo ("blocks_4096", in.render (s, ro));
		in.configure (in.sr, g_opt.block, false);
	}

	beginSection ("Stress: sample rates");
	{
		std::map<int, double> pitch;
		for (int rate : {44100, 48000, 96000})
		{
			bool ok = in.configure (rate, g_opt.block, false);
			check (ok, strf ("reconfigure to %d Hz (setActive false -> setupProcessing -> setActive true)", rate));
			Scenario s = scenarioSingle (rate, 69, 1.0, 0.5, "sr");
			s.name = "sr_" + std::to_string (rate);
			RenderOptions ro;
			ro.block = g_opt.block;
			RenderResult r = in.render (s, ro);
			reportRender (in, s.name, r);
			double clar = 0;
			double f = estimatePitchHz (r.L, r.R, sec (0.35, rate), sec (0.25, rate), rate, &clar);
			pitch[rate] = f;
			LOG ("    A4 (MIDI 69) estimated fundamental: %.2f Hz (clarity %.2f)", f, clar);
		}
		double f48 = pitch[48000];
		if (f48 > 0)
		{
			check (std::fabs (f48 / 440.0 - 1.0) < 0.03, "A4 sounds at ~440 Hz at 48 kHz (default patch)",
			       strf ("%.2f Hz", f48), Sev::Warn);
			for (int rate : {44100, 96000})
				check (pitch[rate] > 0 && std::fabs (pitch[rate] / f48 - 1.0) < 0.03,
				       strf ("pitch independent of sample rate (%d Hz vs 48 kHz)", rate),
				       strf ("%.2f Hz vs %.2f Hz", pitch[rate], f48));
		}
		else
			warn ("pitch estimate at 48 kHz", "no clear periodicity found in the default patch (cannot verify tuning)");
		in.configure (g_opt.sr, g_opt.block, false);
	}

	beginSection ("Stress: activation cycles and parameter flush");
	{
		Scenario s;
		s.name = "cycle";
		s.noteOn (0, 60, 0.8f);
		s.finish (g_opt.block * 4);
		RenderOptions ro;
		ro.block = g_opt.block;
		ro.reset = false;
		int bad = 0, nan = 0;
		for (int i = 0; i < (g_opt.quick ? 8 : 20); i++)
		{
			if (!in.resetProcessing ())
				bad++;
			RenderResult r = in.render (s, ro);
			nan += (int)(r.nan + r.inf) + (r.crashed ? 1 : 0);
		}
		check (bad == 0 && nan == 0, "repeated setProcessing(false)/setActive(false)/setActive(true)/setProcessing(true) with notes held",
		       strf ("%d failed transitions, %d NaN/Inf/crash", bad, nan));
		in.resetProcessing ();
		// parameter flush: numSamples == 0 (Cubase/Bitwig do this; legal per spec)
		in.inEvents.clear ();
		in.inParams.clear ();
		if (!in.params.empty ())
			in.inParams.add (in.params[0].info.id, 0, in.params[0].info.defaultNormalizedValue);
		Instance::BlockOutcome b1 = in.processBlock (0, true);
		check (b1.crash.empty (), "process() with numSamples == 0 (parameter flush, outputs present)", b1.crash);
		Instance::BlockOutcome b2 = in.processBlock (0, false);
		check (b2.crash.empty (), "process() with numSamples == 0 and numOutputs == 0 (parameter flush)", b2.crash);
		in.inParams.clear ();
		in.resetProcessing ();
	}
	restoreDefault (in, ac);
}

//==============================================================================
// Editor
//==============================================================================
static ULONG_PTR g_gdiplusToken = 0;

static bool savePng (const std::wstring& path, int w, int h, const uint32_t* pixels)
{
	UINT num = 0, size = 0;
	Gdiplus::GetImageEncodersSize (&num, &size);
	if (!size)
		return false;
	std::vector<uint8_t> buf (size);
	auto* enc = (Gdiplus::ImageCodecInfo*)buf.data ();
	Gdiplus::GetImageEncoders (num, size, enc);
	CLSID png {};
	bool found = false;
	for (UINT i = 0; i < num; i++)
		if (wcscmp (enc[i].MimeType, L"image/png") == 0)
		{
			png = enc[i].Clsid;
			found = true;
		}
	if (!found)
		return false;
	Gdiplus::Bitmap bmp (w, h, w * 4, PixelFormat32bppRGB, (BYTE*)pixels);
	return bmp.Save (path.c_str (), &png, nullptr) == Gdiplus::Ok;
}

struct Capture
{
	bool ok = false;
	int w = 0, h = 0, distinctColors = 0;
	double lumaStd = 0;
};

// PrintWindow(PW_RENDERFULLCONTENT) of the host window client area (includes plug-in child windows).
static Capture captureWindow (HWND top, const std::wstring& path)
{
	Capture c;
	RECT rc;
	GetClientRect (top, &rc);
	c.w = rc.right;
	c.h = rc.bottom;
	if (c.w <= 0 || c.h <= 0)
		return c;
	HDC wdc = GetDC (top);
	HDC mdc = CreateCompatibleDC (wdc);
	BITMAPINFO bi {};
	bi.bmiHeader.biSize = sizeof (bi.bmiHeader);
	bi.bmiHeader.biWidth = c.w;
	bi.bmiHeader.biHeight = -c.h; // top-down
	bi.bmiHeader.biPlanes = 1;
	bi.bmiHeader.biBitCount = 32;
	bi.bmiHeader.biCompression = BI_RGB;
	uint32_t* px = nullptr;
	HBITMAP bmp = CreateDIBSection (wdc, &bi, DIB_RGB_COLORS, (void**)&px, nullptr, 0);
	HGDIOBJ old = SelectObject (mdc, bmp);
	BOOL pw = PrintWindow (top, mdc, PW_CLIENTONLY | PW_RENDERFULLCONTENT);
	if (!pw)
		BitBlt (mdc, 0, 0, c.w, c.h, wdc, 0, 0, SRCCOPY);
	GdiFlush ();
	std::set<uint32_t> colors;
	double s = 0, s2 = 0;
	size_t n = 0;
	for (int y = 0; y < c.h; y += 3)
		for (int x = 0; x < c.w; x += 3)
		{
			uint32_t p = px[(size_t)y * c.w + x] & 0xFFFFFF;
			if (colors.size () < 5000)
				colors.insert (p);
			double l = 0.299 * ((p >> 16) & 255) + 0.587 * ((p >> 8) & 255) + 0.114 * (p & 255);
			s += l;
			s2 += l * l;
			n++;
		}
	c.distinctColors = (int)colors.size ();
	c.lumaStd = n ? std::sqrt (std::max (0.0, s2 / n - (s / n) * (s / n))) : 0;
	c.ok = savePng (path, c.w, c.h, px);
	SelectObject (mdc, old);
	DeleteObject (bmp);
	DeleteDC (mdc);
	ReleaseDC (top, wdc);
	return c;
}

struct GuiResources
{
	DWORD gdi = 0, user = 0, threads = 0;
	SIZE_T privateBytes = 0;
};
static GuiResources guiResources ()
{
	GuiResources g;
	g.gdi = GetGuiResources (GetCurrentProcess (), GR_GDIOBJECTS);
	g.user = GetGuiResources (GetCurrentProcess (), GR_USEROBJECTS);
	PROCESS_MEMORY_COUNTERS_EX pmc {};
	pmc.cb = sizeof (pmc);
	if (GetProcessMemoryInfo (GetCurrentProcess (), (PROCESS_MEMORY_COUNTERS*)&pmc, sizeof (pmc)))
		g.privateBytes = pmc.PrivateUsage;
	HANDLE snap = CreateToolhelp32Snapshot (TH32CS_SNAPTHREAD, 0);
	if (snap != INVALID_HANDLE_VALUE)
	{
		THREADENTRY32 te {};
		te.dwSize = sizeof (te);
		if (Thread32First (snap, &te))
			do
				if (te.th32OwnerProcessID == GetCurrentProcessId ())
					g.threads++;
			while (Thread32Next (snap, &te));
		CloseHandle (snap);
	}
	return g;
}

struct EditorSession;
static LRESULT CALLBACK hostWndProc (HWND h, UINT msg, WPARAM wp, LPARAM lp);

struct EditorSession
{
	Instance* in = nullptr;
	IPlugView* view = nullptr;
	PlugFrame* frame = nullptr;
	IPlugViewContentScaleSupport* scale = nullptr;
	HWND top = nullptr, container = nullptr, child = nullptr;
	ViewRect size {};
	bool attachedOk = false;
	tresult canResize = kResultFalse;
	std::string tag;

	static void registerClasses ()
	{
		static bool done = false;
		if (done)
			return;
		done = true;
		WNDCLASSEXW wc {};
		wc.cbSize = sizeof (wc);
		wc.lpfnWndProc = hostWndProc;
		wc.hInstance = GetModuleHandleW (nullptr);
		wc.hCursor = LoadCursor (nullptr, IDC_ARROW);
		wc.hbrBackground = (HBRUSH)GetStockObject (DKGRAY_BRUSH);
		wc.lpszClassName = L"vst3host_editor_window";
		RegisterClassExW (&wc);
		wc.lpfnWndProc = DefWindowProcW;
		wc.lpszClassName = L"vst3host_editor_container";
		wc.hbrBackground = (HBRUSH)GetStockObject (BLACK_BRUSH);
		RegisterClassExW (&wc);
	}

	bool open (Instance& inst, double scaleFactor, bool verbose, const std::string& t, int x = 40, int y = 40)
	{
		in = &inst;
		tag = t;
		auto ck = [&] (bool ok, const std::string& name, const std::string& d = {}, Sev s = Sev::Fail) {
			if (verbose || !ok)
				check (ok, tag + ": " + name, d, s);
			return ok;
		};
		guarded (tag + ": IEditController::createView(\"editor\")", [&] { view = inst.ctrl->createView (ViewType::kEditor); });
		if (!ck (view != nullptr, "createView(\"editor\") returns a view"))
			return false;
		tresult r = kResultFalse;
		guarded (tag + ": isPlatformTypeSupported", [&] { r = view->isPlatformTypeSupported (kPlatformTypeHWND); });
		ck (r == kResultTrue, "isPlatformTypeSupported(\"HWND\") == kResultTrue", strf ("returned %d", r));
		frame = new PlugFrame ();
		frame->view = view;
		r = kResultFalse;
		guarded (tag + ": setFrame", [&] { r = view->setFrame (frame); });
		ck (r == kResultOk, "IPlugView::setFrame", strf ("returned %d", r));
		view->queryInterface (IPlugViewContentScaleSupport::iid, (void**)&scale);
		if (scale)
		{
			tresult sr = kResultFalse;
			guarded (tag + ": setContentScaleFactor", [&] { sr = scale->setContentScaleFactor ((float)scaleFactor); });
			if (verbose)
				LOG ("  %s: IPlugViewContentScaleSupport::setContentScaleFactor(%.2f) -> %d", tag.c_str (), scaleFactor, sr);
		}
		else if (verbose)
			LOG ("  %s: view does not implement IPlugViewContentScaleSupport", tag.c_str ());
		r = kResultFalse;
		guarded (tag + ": getSize", [&] { r = view->getSize (&size); });
		ck (r == kResultOk && size.getWidth () > 0 && size.getHeight () > 0 && size.getWidth () < 10000 &&
		        size.getHeight () < 10000,
		    "IPlugView::getSize returns a sane size", strf ("r=%d, %d x %d", r, size.getWidth (), size.getHeight ()));
		guarded (tag + ": canResize", [&] { canResize = view->canResize (); });
		if (verbose)
			LOG ("  %s: editor size %d x %d, canResize %s", tag.c_str (), size.getWidth (), size.getHeight (),
			     canResize == kResultTrue ? "yes" : "no");
		int w = std::max (50, size.getWidth ()), h = std::max (50, size.getHeight ());

		registerClasses ();
		DWORD style = WS_OVERLAPPEDWINDOW | WS_CLIPCHILDREN;
		if (canResize != kResultTrue)
			style &= ~(WS_THICKFRAME | WS_MAXIMIZEBOX);
		std::wstring title = L"vst3host - " + u2w (tag);
		top = CreateWindowExW (0, L"vst3host_editor_window", title.c_str (), style, x, y, w + 16, h + 39, nullptr, nullptr,
		                       GetModuleHandleW (nullptr), nullptr);
		SetWindowLongPtrW (top, GWLP_USERDATA, (LONG_PTR)this);
		setClientSize (top, w, h);
		container = CreateWindowExW (0, L"vst3host_editor_container", L"", WS_CHILD | WS_VISIBLE | WS_CLIPCHILDREN, 0, 0, w,
		                             h, top, nullptr, GetModuleHandleW (nullptr), nullptr);
		frame->top = top;
		frame->container = container;
		ShowWindow (top, SW_SHOWNOACTIVATE);
		UpdateWindow (top);
		r = kResultFalse;
		bool noCrash = guarded (tag + ": IPlugView::attached", [&] { r = view->attached ((void*)container, kPlatformTypeHWND); });
		attachedOk = noCrash && r == kResultOk;
		ck (r == kResultOk, "IPlugView::attached(parent, \"HWND\")", strf ("returned %d", r));
		child = GetWindow (container, GW_CHILD);
		ck (child != nullptr, "plug-in created a child window inside the host-provided parent");
		if (child && verbose)
		{
			RECT cr;
			GetClientRect (child, &cr);
			wchar_t cls[128] = {};
			GetClassNameW (child, cls, 128);
			LOG ("  %s: plug-in child window class '%s', %ld x %ld", tag.c_str (), w2u (cls).c_str (), cr.right, cr.bottom);
			ViewRect now {};
			tryCall ([&] { view->getSize (&now); });
			RECT tc;
			GetClientRect (top, &tc);
			check (std::abs (cr.right - tc.right) <= 2 && std::abs (cr.bottom - tc.bottom) <= 2,
			       tag + ": plug-in child window fills the host window", strf ("child %ld x %ld, host client %ld x %ld", cr.right,
			                                                                 cr.bottom, tc.right, tc.bottom),
			       Sev::Warn);
		}
		return attachedOk;
	}

	void close (bool verbose)
	{
		if (attachedOk)
		{
			tresult r = kResultFalse;
			guarded (tag + ": IPlugView::removed", [&] { r = view->removed (); });
			if (verbose || r != kResultOk)
				check (r == kResultOk, tag + ": IPlugView::removed", strf ("returned %d", r));
		}
		pump (20);
		if (child && IsWindow (child))
			warn (tag + ": plug-in child window destroyed by removed()", "still exists after removed() (window leak)");
		if (scale)
		{
			scale->release ();
			scale = nullptr;
		}
		if (view)
		{
			uint32 rc = 0;
			guarded (tag + ": release IPlugView", [&] { rc = view->release (); });
			if (verbose)
				LOG ("  %s: view released (refcount returned %u)", tag.c_str (), rc);
			view = nullptr;
		}
		if (top)
		{
			SetWindowLongPtrW (top, GWLP_USERDATA, 0);
			DestroyWindow (top);
		}
		top = container = child = nullptr;
		if (frame)
		{
			frame->release ();
			frame = nullptr;
		}
		attachedOk = false;
		pump (20);
	}

	// ---------------------------------------------------------------- input simulation
	POINT scaled (POINT p1x, double baseW = 1100, double baseH = 720)
	{
		RECT rc;
		GetClientRect (container, &rc);
		return {(LONG)std::lround (p1x.x * rc.right / baseW), (LONG)std::lround (p1x.y * rc.bottom / baseH)};
	}
	HWND targetAt (POINT pc, POINT& local)
	{
		HWND cur = container;
		POINT p = pc;
		for (int depth = 0; depth < 16; depth++)
		{
			HWND c = ChildWindowFromPointEx (cur, p, CWP_SKIPINVISIBLE | CWP_SKIPDISABLED | CWP_SKIPTRANSPARENT);
			if (!c || c == cur)
				break;
			MapWindowPoints (cur, c, &p, 1);
			cur = c;
		}
		local = p;
		return cur;
	}
	static LPARAM lpOf (POINT p) { return MAKELPARAM ((WORD)(SHORT)p.x, (WORD)(SHORT)p.y); }
	void send (HWND w, UINT msg, WPARAM keys, POINT pcContainer)
	{
		POINT q = pcContainer;
		MapWindowPoints (container, w, &q, 1);
		std::string err = tryCall ([&] { SendMessageW (w, msg, keys, lpOf (q)); });
		if (!err.empty ())
			fail (tag + ": editor crashed handling mouse input", err);
	}
	void realMove (POINT pc)
	{
		POINT s = pc;
		ClientToScreen (container, &s);
		SetCursorPos (s.x, s.y);
	}
	void realButton (bool down)
	{
		INPUT ip {};
		ip.type = INPUT_MOUSE;
		ip.mi.dwFlags = down ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
		SendInput (1, &ip, sizeof (ip));
	}
	// Drag along a path of container-client points.
	void dragPath (const std::vector<POINT>& path, int stepsPerSeg = 8)
	{
		if (path.empty ())
			return;
		if (g_opt.realInput)
		{
			SetForegroundWindow (top);
			pump (50);
			realMove (path[0]);
			pump (40);
			realButton (true);
			pump (40);
			for (size_t s = 1; s < path.size (); s++)
				for (int i = 1; i <= stepsPerSeg; i++)
				{
					POINT p {path[s - 1].x + (path[s].x - path[s - 1].x) * i / stepsPerSeg,
					         path[s - 1].y + (path[s].y - path[s - 1].y) * i / stepsPerSeg};
					realMove (p);
					pump (16);
				}
			realButton (false);
			pump (80);
			return;
		}
		POINT lp;
		HWND w = targetAt (path[0], lp);
		send (w, WM_MOUSEMOVE, 0, path[0]);
		pump (30);
		send (w, WM_LBUTTONDOWN, MK_LBUTTON, path[0]);
		pump (40);
		for (size_t s = 1; s < path.size (); s++)
			for (int i = 1; i <= stepsPerSeg; i++)
			{
				POINT p {path[s - 1].x + (path[s].x - path[s - 1].x) * i / stepsPerSeg,
				         path[s - 1].y + (path[s].y - path[s - 1].y) * i / stepsPerSeg};
				HWND cap = GetCapture ();
				send (cap ? cap : w, WM_MOUSEMOVE, MK_LBUTTON, p);
				pump (16);
			}
		HWND cap = GetCapture ();
		send (cap ? cap : w, WM_LBUTTONUP, 0, path.back ());
		pump (80);
	}
	void click (POINT p) { dragPath ({p, p}, 1); }
	void wheel (POINT p, int delta)
	{
		POINT lp;
		HWND w = targetAt (p, lp);
		POINT s = p;
		ClientToScreen (container, &s);
		std::string err = tryCall ([&] { SendMessageW (w, WM_MOUSEWHEEL, MAKEWPARAM (0, delta), MAKELPARAM ((WORD)(SHORT)s.x, (WORD)(SHORT)s.y)); });
		if (!err.empty ())
			fail (tag + ": editor crashed handling WM_MOUSEWHEEL", err);
		pump (60);
	}
};

static LRESULT CALLBACK hostWndProc (HWND h, UINT msg, WPARAM wp, LPARAM lp)
{
	auto* es = (EditorSession*)GetWindowLongPtrW (h, GWLP_USERDATA);
	switch (msg)
	{
		case WM_SIZE:
			if (es && es->container)
			{
				int w = LOWORD (lp), hh = HIWORD (lp);
				SetWindowPos (es->container, nullptr, 0, 0, w, hh, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
				// user/host-initiated resize (not a reply to IPlugFrame::resizeView)
				if (es->frame && !es->frame->inResize && es->view && es->attachedOk)
				{
					ViewRect r (0, 0, w, hh);
					std::string err = tryCall ([&] { es->view->onSize (&r); });
					if (!err.empty ())
						fail ("IPlugView::onSize crashed", err);
				}
			}
			return 0;
		case WM_CLOSE: return 0; // lifetime is controlled by the test
	}
	return DefWindowProcW (h, msg, wp, lp);
}

static std::string summarizeEdits (Instance& in, const std::vector<ComponentHandler::Ev>& ev, std::map<ParamID, double>& last)
{
	std::map<ParamID, std::array<int, 3>> cnt;
	for (auto& e : ev)
	{
		if (e.type == 'b')
			cnt[e.id][0]++;
		if (e.type == 'p')
		{
			cnt[e.id][1]++;
			last[e.id] = e.value;
		}
		if (e.type == 'e')
			cnt[e.id][2]++;
	}
	std::string s;
	for (auto& kv : cnt)
		s += strf ("%s%s: begin %d / perform %d / end %d, last %.4f", s.empty () ? "" : "; ", in.paramName (kv.first).c_str (),
		           kv.second[0], kv.second[1], kv.second[2], last.count (kv.first) ? last[kv.first] : -1.0);
	return s.empty () ? "no edits" : s;
}

static void testEditor (Instance& in, AudioCtx& ac)
{
	beginSection ("Editor");
	// Background audio like a DAW playing while the UI is used: sustained chord.
	Scenario bg;
	bg.name = "editor_background";
	bg.note (sec (0.05, in.sr), sec (59.0, in.sr), 48, 0.7f);
	bg.note (sec (0.05, in.sr), sec (59.0, in.sr), 55, 0.7f);
	bg.note (sec (0.05, in.sr), sec (59.0, in.sr), 60, 0.7f);
	bg.finish (sec (60.0, in.sr));
	in.resetProcessing ();
	in.startBackground (bg);

	EditorSession s1;
	bool opened = s1.open (in, 1.0, true, "editor 1x");
	ViewRect size1 = s1.size;
	std::map<ParamID, double> lastEdits;
	if (opened)
	{
		pump (1500);
		Capture c = s1.top ? captureWindow (s1.top, outPath ("editor_1x.png")) : Capture ();
		LOG ("  editor_1x.png: %d x %d, %d distinct colours (sampled), luma std-dev %.1f", c.w, c.h, c.distinctColors, c.lumaStd);
		check (c.ok, "editor 1x: screenshot saved (editor_1x.png)");
		check (c.distinctColors > 8 && c.lumaStd > 2.0, "editor 1x: editor renders non-blank content",
		       strf ("%d colours, luma std %.1f", c.distinctColors, c.lumaStd));

		// ---- mouse interaction
		size_t m0 = in.handler->mark ();
		std::vector<POINT> drags = g_opt.drags, clicks = g_opt.clicks;
		bool defaults = drags.empty () && clicks.empty ();
		if (drags.empty ())
			drags = {{50, 418}, {582, 418}, {1046, 24}}; // Cutoff, Amp Attack, Master (spec layout, 1100x720)
		int anyEdits = 0;
		for (auto& d : drags)
		{
			POINT p = s1.scaled (d);
			size_t m = in.handler->mark ();
			s1.dragPath ({p, {p.x, p.y + 40}, {p.x, p.y - 40}});
			std::map<ParamID, double> last;
			std::string sm = summarizeEdits (in, in.handler->since (m), last);
			LOG ("  drag at (%ld,%ld) [1x] = (%ld,%ld) px, down 40 then up 80 px -> %s", d.x, d.y, p.x, p.y, sm.c_str ());
			anyEdits += (int)last.size ();
			for (auto& kv : last)
				lastEdits[kv.first] = kv.second;
		}
		int iEng = in.findParam ("Engine");
		if (clicks.empty () && iEng >= 0)
		{
			// engine selector A|B segment in the header (spec layout)
			ParamID eid = in.params[(size_t)iEng].info.id;
			size_t m = in.handler->mark ();
			s1.click (s1.scaled ({488, 24}));
			std::map<ParamID, double> last;
			std::string sm = summarizeEdits (in, in.handler->since (m), last);
			LOG ("  click on engine 'B' segment (488,24) -> %s", sm.c_str ());
			check (last.count (eid) && last[eid] > 0.5, "editor: clicking engine B sets the Engine parameter",
			       sm + " (layout assumption: spec header segment at x 290..554, y 9..39)", Sev::Warn);
			for (auto& kv : last)
				lastEdits[kv.first] = kv.second;
			anyEdits += (int)last.size ();
			pump (300);
			m = in.handler->mark ();
			s1.click (s1.scaled ({356, 24}));
			last.clear ();
			sm = summarizeEdits (in, in.handler->since (m), last);
			LOG ("  click on engine 'A' segment (356,24) -> %s", sm.c_str ());
			for (auto& kv : last)
				lastEdits[kv.first] = kv.second;
		}
		for (auto& c2 : clicks)
		{
			POINT p = s1.scaled (c2);
			size_t m = in.handler->mark ();
			s1.click (p);
			std::map<ParamID, double> last;
			LOG ("  click at (%ld,%ld) -> %s", c2.x, c2.y, summarizeEdits (in, in.handler->since (m), last).c_str ());
			anyEdits += (int)last.size ();
			for (auto& kv : last)
				lastEdits[kv.first] = kv.second;
		}
		{
			// preset browsing from the header (spec 'presets' widget: x 566..866, y 9..39)
			int changed = 0;
			for (auto& ar : std::vector<std::pair<const char*, LONG>> {{"next", 852}, {"previous", 580}})
			{
				size_t m = in.handler->mark ();
				s1.click (s1.scaled ({ar.second, 24}));
				pump (400);
				std::map<ParamID, double> last;
				auto evs = in.handler->since (m);
				int restarts = 0;
				for (auto& e : evs)
					if (e.type == 'r' && ((int)e.value & kParamValuesChanged))
						restarts++;
				summarizeEdits (in, evs, last);
				LOG ("  click on the %s-preset arrow (%ld,24): %zu parameters edited, %d restartComponent(kParamValuesChanged)", ar.first,
				     ar.second, last.size (), restarts);
				for (auto& kv : last)
					lastEdits[kv.first] = kv.second;
				changed += (last.size () >= 3 || restarts) ? 1 : 0;
			}
			check (changed == 2, "editor: preset arrows change the preset (edits or restartComponent reported to the host)",
			       strf ("%d of 2 arrow clicks reported a change", changed), Sev::Warn);
		}
		{
			size_t m = in.handler->mark ();
			s1.wheel (s1.scaled (drags[0]), -WHEEL_DELTA);
			std::map<ParamID, double> last;
			LOG ("  (info) mouse wheel over first drag point -> %s", summarizeEdits (in, in.handler->since (m), last).c_str ());
			for (auto& kv : last)
				lastEdits[kv.first] = kv.second;
		}
		check (anyEdits > 0, "editor: mouse drag/click produces beginEdit/performEdit/endEdit",
		       anyEdits > 0 ? std::string ()
		                    : std::string ("no edits arrived") +
		                          (defaults ? " (default points assume the spec layout; try --drag x,y / --click x,y or --real-input)" : ""));
		// protocol
		{
			std::lock_guard<std::recursive_mutex> lk (in.handler->mx);
			std::string v;
			for (auto& x : in.handler->violations)
				v += x + "; ";
			int open = 0;
			for (auto& kv : in.handler->openEdits)
				open += kv.second;
			check (in.handler->violations.empty () && open == 0,
			       "editor: beginEdit/performEdit/endEdit correctly paired (needed for automation recording)",
			       v + (open ? strf ("%d edits never ended", open) : ""));
		}
		// controller reflects its own edits
		{
			std::string bad;
			for (auto& kv : lastEdits)
			{
				double v = -1;
				tryCall ([&] { v = in.ctrl->getParamNormalized (kv.first); });
				if (std::fabs (v - kv.second) > 1e-4)
					bad += strf ("%s performEdit %.4f but getParamNormalized %.4f; ", in.paramName (kv.first).c_str (),
					             kv.second, v);
			}
			if (!lastEdits.empty ())
				check (bad.empty (), "editor: controller value equals the last performEdit value", bad, Sev::Warn);
		}
		(void)m0;

		// ---- host automation while the editor is open (UI must follow, no feedback edits)
		{
			size_t m = in.handler->mark ();
			int iCut = in.findParam ("Cutoff");
			for (int k = 0; k < 20; k++)
			{
				for (size_t i = 0; i < in.params.size (); i += std::max<size_t> (1, in.params.size () / 8))
					tryCall ([&] { in.ctrl->setParamNormalized (in.params[i].info.id, (k % 5) / 4.0); });
				if (iCut >= 0)
					tryCall ([&] { in.ctrl->setParamNormalized (in.params[(size_t)iCut].info.id, k / 19.0); });
				pump (25);
			}
			int fb = 0;
			for (auto& e : in.handler->since (m))
				fb += (e.type == 'p');
			check (fb == 0, "editor: host parameter changes do not echo back as performEdit",
			       strf ("%d performEdit calls during host automation", fb), Sev::Warn);
			// restore controller values from the processor
			std::vector<uint8_t> st;
			// (processor values are authoritative; resync below after audio stops)
		}

		// ---- content scale change while attached (expects IPlugFrame::resizeView)
		if (s1.scale)
		{
			int before = s1.frame->resizeCalls;
			tresult r = kResultFalse;
			guarded ("setContentScaleFactor(1.5) while attached", [&] { r = s1.scale->setContentScaleFactor (1.5f); });
			pump (400);
			ViewRect now {};
			tryCall ([&] { s1.view->getSize (&now); });
			LOG ("  live setContentScaleFactor(1.5) -> %d; resizeView calls %d; getSize now %d x %d", r,
			     s1.frame->resizeCalls - before, now.getWidth (), now.getHeight ());
			RECT cr;
			GetClientRect (s1.top, &cr);
			bool scaled = std::abs (now.getWidth () - (int)std::lround (size1.getWidth () * 1.5)) <= 3;
			check (scaled && s1.frame->resizeCalls > before && std::abs (cr.right - now.getWidth ()) <= 2,
			       "editor: live content-scale change resizes via IPlugFrame::resizeView",
			       strf ("size %d x %d (expected ~%d x %d), resizeView calls %d, host window %ld x %ld", now.getWidth (),
			             now.getHeight (), (int)std::lround (size1.getWidth () * 1.5), (int)std::lround (size1.getHeight () * 1.5),
			             s1.frame->resizeCalls - before, cr.right, cr.bottom),
			       Sev::Warn);
			guarded ("setContentScaleFactor(1.0) while attached", [&] { s1.scale->setContentScaleFactor (1.0f); });
			pump (400);
		}
		// ---- host-initiated resize (only if the view says it can resize)
		if (s1.canResize == kResultTrue)
		{
			ViewRect want (0, 0, (int)(size1.getWidth () * 1.2), (int)(size1.getHeight () * 1.2));
			tresult r = kResultFalse;
			guarded ("checkSizeConstraint", [&] { r = s1.view->checkSizeConstraint (&want); });
			setClientSize (s1.top, want.getWidth (), want.getHeight ());
			pump (300);
			ViewRect now {};
			tryCall ([&] { s1.view->getSize (&now); });
			LOG ("  (info) host resize to 120%%: checkSizeConstraint -> %d (%d x %d), view now %d x %d", r, want.getWidth (),
			     want.getHeight (), now.getWidth (), now.getHeight ());
			setClientSize (s1.top, size1.getWidth (), size1.getHeight ());
			pump (200);
		}
		s1.close (true);
	}
	in.stopBackground ();
	reportRender (in, "audio while the editor was open", in.bgResult, {true, false, true});

	// UI edits must reach the processor: flush, read processor state, parse with the controller
	if (!lastEdits.empty ())
	{
		Scenario fl;
		fl.name = "flush";
		fl.finish (g_opt.block * 4);
		RenderOptions o;
		o.block = g_opt.block;
		o.reset = false;
		in.render (fl, o);
		std::vector<uint8_t> st;
		in.getState (st);
		in.setComponentStateOnController (st);
		std::string bad;
		for (auto& kv : lastEdits)
		{
			double v = -1;
			tryCall ([&] { v = in.ctrl->getParamNormalized (kv.first); });
			const ParamRec* pr = in.paramById (kv.first);
			double expect = quantize (kv.second, pr ? pr->info.stepCount : 0);
			if (std::fabs (v - expect) > 1e-3)
				bad += strf ("%s: UI sent %.4f, processor state has %.4f; ", in.paramName (kv.first).c_str (), kv.second, v);
		}
		check (bad.empty (), "editor edits reach the processor (performEdit -> inputParameterChanges -> processor state)", bad);
	}

	// ---- 1.5x content scale before attach
	if (opened)
	{
		EditorSession s2;
		if (s2.open (in, 1.5, true, "editor 1.5x"))
		{
			double rw = (double)s2.size.getWidth () / std::max (1, size1.getWidth ());
			double rh = (double)s2.size.getHeight () / std::max (1, size1.getHeight ());
			LOG ("  editor 1.5x: size %d x %d (ratio %.3f x %.3f to 1x)", s2.size.getWidth (), s2.size.getHeight (), rw, rh);
			check (s2.scale != nullptr && std::fabs (rw - 1.5) < 0.02 && std::fabs (rh - 1.5) < 0.02,
			       "editor 1.5x: IPlugViewContentScaleSupport honoured (size scales by 1.5)",
			       s2.scale ? strf ("ratio %.3f x %.3f", rw, rh) : "not implemented (editor will be tiny on HiDPI screens)",
			       Sev::Warn);
			pump (1500);
			Capture c = captureWindow (s2.top, outPath ("editor_1.5x.png"));
			LOG ("  editor_1.5x.png: %d x %d, %d distinct colours, luma std-dev %.1f", c.w, c.h, c.distinctColors, c.lumaStd);
			check (c.ok && c.distinctColors > 8 && c.lumaStd > 2.0, "editor 1.5x: screenshot non-blank (editor_1.5x.png)",
			       strf ("%d colours, luma std %.1f", c.distinctColors, c.lumaStd));
		}
		s2.close (true);
	}

	// ---- open/close quickly 5 times (leaks / crashes)
	if (opened)
	{
		setStep ("editor open/close x5");
		{
			EditorSession w;
			w.open (in, 1.0, false, "editor warm-up");
			pump (150);
			w.close (false);
		}
		pump (200);
		GuiResources g0 = guiResources ();
		bool allOk = true;
		for (int i = 0; i < 5; i++)
		{
			EditorSession e;
			allOk &= e.open (in, 1.0, false, strf ("editor cycle %d", i + 1));
			pump (100);
			e.close (false);
		}
		pump (300);
		GuiResources g1 = guiResources ();
		LOG ("  after 5 open/close cycles: GDI objects %+ld, USER objects %+ld, threads %+ld, private bytes %+.1f MB",
		     (long)g1.gdi - (long)g0.gdi, (long)g1.user - (long)g0.user, (long)g1.threads - (long)g0.threads,
		     ((double)g1.privateBytes - (double)g0.privateBytes) / 1048576.0);
		check (allOk, "editor: 5 quick open/close cycles succeed");
		check ((long)g1.gdi - (long)g0.gdi <= 10 && (long)g1.user - (long)g0.user <= 5,
		       "editor: no GDI/USER handle leak over 5 open/close cycles",
		       strf ("GDI %+ld, USER %+ld", (long)g1.gdi - (long)g0.gdi, (long)g1.user - (long)g0.user), Sev::Warn);
		check ((long)g1.threads - (long)g0.threads <= 0, "editor: no thread leak over 5 open/close cycles",
		       strf ("%+ld threads", (long)g1.threads - (long)g0.threads), Sev::Warn);
		check (((double)g1.privateBytes - (double)g0.privateBytes) < 20.0 * 1048576.0,
		       "editor: memory growth < 20 MB over 5 open/close cycles",
		       strf ("%+.1f MB", ((double)g1.privateBytes - (double)g0.privateBytes) / 1048576.0), Sev::Warn);
	}
	restoreDefault (in, ac);
}

//==============================================================================
// Preset parity: the plug-in's own preset table (browsed with the editor's arrows) vs. tools/spec.js
//==============================================================================
static void testPresetParity (Instance& in, AudioCtx& ac)
{
	beginSection ("Preset parity (editor preset arrows vs. tools/spec.js)");
	if (g_specPresets.list.empty ())
	{
		warn ("preset parity", "no presets file");
		return;
	}
	EditorSession e;
	if (!e.open (in, 1.0, false, "preset parity editor"))
	{
		fail ("preset parity: editor opens");
		return;
	}
	pump (500);
	auto matches = [&] (const SpecPreset& sp, std::string* why) {
		for (auto& kv : sp.plain)
		{
			const ParamRec* pr = in.paramById (kv.first);
			if (!pr || (pr->info.flags & ParameterInfo::kIsHidden))
				continue;
			double want = 0, got = -1;
			tryCall ([&] {
				want = in.ctrl->plainParamToNormalized (kv.first, kv.second);
				got = in.ctrl->getParamNormalized (kv.first);
			});
			if (std::fabs (got - want) > 1e-6)
			{
				if (why)
					*why = strf ("%s = %.6f, spec %.6f", pr->title.c_str (), got, want);
				return false;
			}
		}
		return true;
	};
	const size_t n = g_specPresets.list.size ();
	int start = -1;
	std::vector<std::string> bad;
	for (size_t k = 0; k < n + 1; k++)
	{
		e.click (e.scaled ({852, 24})); // next-preset arrow
		pump (150);
		if (start < 0)
		{
			for (size_t i = 0; i < n; i++)
				if (matches (g_specPresets.list[i], nullptr))
					start = (int)i;
			if (start < 0)
			{
				bad.push_back ("after the first arrow click the values match no spec preset");
				break;
			}
			LOG ("  first arrow click -> spec preset #%d '%s'", start, g_specPresets.list[(size_t)start].name.c_str ());
			continue;
		}
		const SpecPreset& sp = g_specPresets.list[(size_t)((start + (int)k) % (int)n)];
		std::string why;
		if (!matches (sp, &why))
			bad.push_back (strf ("#%d '%s': %s", sp.index, sp.name.c_str (), why.c_str ()));
	}
	e.close (false);
	LOG ("  %zu presets browsed with the next arrow (wrapping around once)", n);
	std::string bs;
	for (auto& b : bad)
		bs += b + "; ";
	check (bad.empty (), strf ("all %zu presets of the plug-in match tools/spec.js (order and every value)", n), bs);
	// the processor got the edits too (UI -> performEdit -> processor); resync to the neutral reference
	restoreDefault (in, ac);
}

//==============================================================================
// Multiple instances (Ableton: several tracks with the same instrument, track duplication)
//==============================================================================
static void testInstances (Module& m, HostApplication* host, Instance& in, AudioCtx& ac)
{
	beginSection ("Multiple instances");
	Instance b;
	b.label = " #2";
	if (!createInstance (b, m, host, false))
	{
		fail ("second instance could be created");
		b.destroy ();
		return;
	}
	pass ("second instance created and initialized");
	{
		SpeakerArrangement stereo = SpeakerArr::kStereo;
		tryCall ([&] {
			b.proc->setBusArrangements (nullptr, 0, &stereo, 1);
			b.comp->activateBus (kEvent, kInput, 0, true);
			b.comp->activateBus (kAudio, kOutput, 0, true);
		});
	}
	check (b.configure (in.sr, g_opt.block, false), "second instance: setupProcessing/setActive/setProcessing");

	// Duplicate track: copy component + controller state of instance 1 into instance 2.
	restoreDefault (in, ac);
	int iEng = in.findParam ("Engine"), iCut = in.findParam ("Cutoff");
	Scenario setter;
	setter.name = "dup_setter";
	if (iEng >= 0)
		setter.param (0, in.params[(size_t)iEng].info.id, 1.0);
	if (iCut >= 0)
		setter.param (0, in.params[(size_t)iCut].info.id, 0.6);
	setter.finish (sec (0.05, in.sr));
	RenderOptions o;
	o.block = g_opt.block;
	in.render (setter, o);
	settle (in);
	std::vector<uint8_t> st;
	in.getState (st);
	in.setComponentStateOnController (st);
	MemoryStream* cs = new MemoryStream ();
	tryCall ([&] { in.ctrl->getState (cs); });
	tresult r1 = b.setState (st), r2 = b.setComponentStateOnController (st);
	cs->seek (0, IBStream::kIBSeekSet, nullptr);
	tresult r3 = kResultFalse;
	tryCall ([&] { r3 = b.ctrl->setState (cs); });
	cs->release ();
	check (r1 == kResultOk && r2 == kResultOk, "duplicate: state of instance 1 loads into instance 2",
	       strf ("setState %d, setComponentState %d, controller setState %d", r1, r2, r3));
	settle (in);
	settle (b);

	// Render the same scenario on both, interleaved block by block on the same audio thread.
	Scenario a = scenarioShort (in.sr, g_opt.block);
	b.resetProcessing ();
	RenderResult rb;
	rb.L.assign ((size_t)a.length, 0.f);
	rb.R.assign ((size_t)a.length, 0.f);
	Instance::Cursor bc {&a};
	RenderOptions oi;
	oi.block = g_opt.block;
	oi.perBlock = [&] (int64 p, int32 n) {
		b.inEvents.clear ();
		b.inParams.clear ();
		b.outParams.clear ();
		b.outEvents.clear ();
		bc.fill (b, p, n);
		Instance::BlockOutcome ob = b.processBlock (n);
		if (!ob.crash.empty () && !rb.crashed)
		{
			rb.crashed = true;
			rb.crash = ob.crash;
		}
		rb.calls++;
		rb.totalUs += ob.us;
		rb.frames += n;
		b.collectBlock (rb, n, p, true);
	};
	RenderResult ra = in.render (a, oi);
	reportRender (in, "instance1_interleaved", ra, {true, true, true});
	reportRender (b, "instance2_interleaved", rb, {true, true, true});
	Comparison c = compareAudio (ra.L, ra.R, rb.L, rb.R, (int)in.sr);
	LOG ("  instance 1 vs duplicated instance 2 (same scenario): %s", cmpStr (c).c_str ());
	check (sameSound (c, ac.deterministic), "duplicated instance sounds identical to the original", cmpStr (c));

	// Independence: instance 1 alone vs. instance 1 while instance 2 plays something else.
	RenderResult alone = in.render (a, o);
	Scenario other = scenarioSingle (in.sr, 40, 2.0, 0.5, "other");
	Instance::Cursor oc {&other};
	b.resetProcessing ();
	RenderResult dummy;
	oi.perBlock = [&] (int64 p, int32 n) {
		b.inEvents.clear ();
		b.inParams.clear ();
		b.outParams.clear ();
		b.outEvents.clear ();
		oc.fill (b, p, n);
		b.processBlock (n);
	};
	RenderResult together = in.render (a, oi);
	reportRender (in, "instance1_alone", alone, {true, true, true});
	reportRender (in, "instance1_while_instance2_plays", together, {true, true, true});
	Comparison c2 = compareAudio (alone.L, alone.R, together.L, together.R, (int)in.sr);
	LOG ("  instance 1 alone vs. while instance 2 plays other notes: %s", cmpStr (c2).c_str ());
	check (sameSound (c2, ac.deterministic), "instances are independent (no shared global state)", cmpStr (c2));

	// Both editors open at the same time
	if (!g_opt.skipEditor)
	{
		EditorSession e1, e2;
		bool o1 = e1.open (in, 1.0, false, "instance 1 editor", 40, 40);
		bool o2 = e2.open (b, 1.0, false, "instance 2 editor", 120, 120);
		pump (800);
		if (o1 && o2)
		{
			Capture c1 = captureWindow (e1.top, outPath ("editor_instance1.png"));
			Capture cb = captureWindow (e2.top, outPath ("editor_instance2.png"));
			check (c1.distinctColors > 8 && cb.distinctColors > 8, "two editors open simultaneously both render",
			       strf ("%d / %d colours", c1.distinctColors, cb.distinctColors));
		}
		else
			fail ("two editors open simultaneously", strf ("instance 1 %s, instance 2 %s", o1 ? "ok" : "failed", o2 ? "ok" : "failed"));
		e2.close (false);
		e1.close (false);
	}
	b.destroy ();
	pass ("second instance torn down");
	restoreDefault (in, ac);
}

//==============================================================================
// Controller state: preset name, modified flag and zoom across instances ("WSC2"), beta 0.1 projects ("WSC1",
// index into the old factory order), setComponentState semantics, hostile controller states, and the preset
// field of the editor after a reload (pixel comparison with the field reached through the editor's own arrows).
//==============================================================================
struct Crop
{
	int w = 0, h = 0;
	std::vector<uint32_t> px;
};
// The editor's preset name field (between the arrows: layout 598..834 x 11..37 of 1100 x 720), saved as PNG.
static Crop presetFieldCrop (EditorSession& e, const std::string& png)
{
	Crop c;
	pump (350);
	RECT rc;
	GetClientRect (e.top, &rc);
	const int w = rc.right, h = rc.bottom;
	if (w <= 0 || h <= 0)
		return c;
	HDC wdc = GetDC (e.top);
	HDC mdc = CreateCompatibleDC (wdc);
	BITMAPINFO bi {};
	bi.bmiHeader.biSize = sizeof (bi.bmiHeader);
	bi.bmiHeader.biWidth = w;
	bi.bmiHeader.biHeight = -h;
	bi.bmiHeader.biPlanes = 1;
	bi.bmiHeader.biBitCount = 32;
	bi.bmiHeader.biCompression = BI_RGB;
	uint32_t* px = nullptr;
	HBITMAP bmp = CreateDIBSection (wdc, &bi, DIB_RGB_COLORS, (void**)&px, nullptr, 0);
	HGDIOBJ old = SelectObject (mdc, bmp);
	if (!PrintWindow (e.top, mdc, PW_CLIENTONLY | PW_RENDERFULLCONTENT))
		BitBlt (mdc, 0, 0, w, h, wdc, 0, 0, SRCCOPY);
	GdiFlush ();
	POINT a = e.scaled ({598, 11}), b = e.scaled ({834, 37});
	a.x = std::max<LONG> (0, a.x);
	a.y = std::max<LONG> (0, a.y);
	b.x = std::min<LONG> (w, b.x);
	b.y = std::min<LONG> (h, b.y);
	if (px && b.x > a.x && b.y > a.y)
	{
		c.w = (int)(b.x - a.x);
		c.h = (int)(b.y - a.y);
		for (LONG y = a.y; y < b.y; y++)
			for (LONG x = a.x; x < b.x; x++)
				c.px.push_back (px[(size_t)y * w + x] | 0xFF000000u);
		if (!png.empty ())
			savePng (outPath (png), c.w, c.h, c.px.data ());
	}
	SelectObject (mdc, old);
	DeleteObject (bmp);
	DeleteDC (mdc);
	ReleaseDC (e.top, wdc);
	return c;
}
// Fraction of pixels differing by more than 24 in a channel; -1 when an image is missing or the sizes differ.
static double cropDiff (const Crop& a, const Crop& b)
{
	if (a.px.empty () || a.w != b.w || a.h != b.h)
		return -1;
	size_t n = 0;
	for (size_t i = 0; i < a.px.size (); i++)
		for (int s = 0; s < 24; s += 8)
			if (std::abs ((int)((a.px[i] >> s) & 255) - (int)((b.px[i] >> s) & 255)) > 24)
			{
				n++;
				break;
			}
	return (double)n / (double)a.px.size ();
}
static std::string cropDiffStr (double d)
{
	return d < 0 ? std::string ("no image or sizes differ") : strf ("%.2f%% of the field's pixels differ", 100 * d);
}

// A saved project for the module reload cycle, and what the editor's preset field must show for it.
static std::vector<uint8_t> g_reloadComp, g_reloadCtl;
static std::string g_reloadName;
static Crop g_reloadCrop;

static void testCtrlState (Module& m, HostApplication* host, Instance& in, AudioCtx& ac)
{
	beginSection ("Controller state (WSC2 by name, WSC1 beta 0.1 index, setComponentState, hostile states)");
	if (g_specPresets.list.empty ())
	{
		warn ("controller state", "no presets file");
		return;
	}
	const auto& L = g_specPresets.list;
	std::set<std::string> factory;
	for (auto& p : L)
		factory.insert (p.name);
	auto spec = [&] (const std::string& n) -> const SpecPreset* {
		for (auto& p : L)
			if (p.name == n)
				return &p;
		return nullptr;
	};
	auto join = [] (const std::vector<std::string>& v) {
		std::string s;
		for (auto& x : v)
			s += x + "; ";
		return s;
	};
	const std::string kSM2 = "A · Square Mod 2", kMSB = "B · Mirror Sub Bass", kHaar = "A · Haar Bass", kFlute = "B · Soft Flute",
	                  kWarm = "A · Warm Pad", kBInit = "B · Init", kAInit = "A · Init", kFocus = "B · Focus Sweep";
	for (auto& n : {kSM2, kMSB, kHaar, kFlute, kWarm, kBInit, kAInit, kFocus})
		if (!spec (n))
		{
			fail ("controller state: preset '" + n + "' exists in tools/spec.js");
			return;
		}
	// the beta 0.1 factory order: presets_spec_beta01.txt next to the exe (the previous build's presets_spec.txt)
	SpecPresets old;
	{
		wchar_t exe[MAX_PATH] = {};
		GetModuleFileNameW (nullptr, exe, MAX_PATH);
		std::wstring e = exe;
		if (!loadSpecPresets (e.substr (0, e.find_last_of (L"/\\")) + L"\\presets_spec_beta01.txt", old))
			warn ("controller state: beta 0.1 order", "presets_spec_beta01.txt missing next to the exe (WSC1 table not checked)");
	}

	// 1) component states with exactly each factory preset's values (rendered through the main instance's processor)
	std::map<std::string, std::vector<uint8_t>> exact;
	for (auto& p : L)
	{
		applyPlainValues (in, p.plain);
		in.getState (exact[p.name]);
	}
	const int iCut = in.findParam ("Cutoff");
	if (iCut < 0)
	{
		fail ("controller state: 'Cutoff' parameter found");
		restoreDefault (in, ac);
		return;
	}
	const ParamID cutId = in.params[(size_t)iCut].info.id;
	auto modified = [&] (const SpecPreset& p, double& cut) {
		double n0 = 0;
		for (auto& kv : p.plain)
			if (kv.first == cutId)
				tryCall ([&] { n0 = in.ctrl->plainParamToNormalized (kv.first, kv.second); });
		cut = quantize (n0 < 0.5 ? n0 + 0.23 : n0 - 0.23, in.params[(size_t)iCut].info.stepCount);
		applyPlainValues (in, p.plain, {{cutId, cut}});
		std::vector<uint8_t> st;
		in.getState (st);
		return st;
	};
	double cutHaar = 0, cutMirror = 0;
	const std::vector<uint8_t> modHaar = modified (*spec (kHaar), cutHaar), modMirror = modified (*spec (kMSB), cutMirror);
	restoreDefault (in, ac);
	LOG ("  %zu factory component states + '%s' and '%s' with Cutoff moved (%.4f / %.4f), rendered through the main instance",
	     exact.size (), kHaar.c_str (), kMSB.c_str (), cutHaar, cutMirror);

	auto valuesOff = [&] (Instance* x, const SpecPreset& p, ParamID skip) {
		std::vector<std::string> bad;
		for (auto& kv : p.plain)
		{
			const ParamRec* pr = x->paramById (kv.first);
			if (!pr || (pr->info.flags & ParameterInfo::kIsHidden) || kv.first == skip)
				continue;
			double want = 0, got = -1;
			tryCall ([&] {
				want = x->ctrl->plainParamToNormalized (kv.first, kv.second);
				got = x->ctrl->getParamNormalized (kv.first);
			});
			if (std::fabs (got - want) > 1e-6)
				bad.push_back (strf ("%s %.6f (preset %.6f)", pr->title.c_str (), got, want));
		}
		return bad;
	};
	auto valuesDiffer = [&] (Instance* a, Instance* b) {
		std::vector<std::string> bad;
		for (auto& p : a->params)
		{
			if (p.info.flags & ParameterInfo::kIsHidden)
				continue;
			double x = -1, y = -2;
			tryCall ([&] {
				x = a->ctrl->getParamNormalized (p.info.id);
				y = b->ctrl->getParamNormalized (p.info.id);
			});
			if (std::fabs (x - y) > 1e-9)
				bad.push_back (strf ("%s %.6f vs %.6f", p.title.c_str (), x, y));
		}
		return bad;
	};
	auto cutOf = [&] (Instance* x) {
		double v = -1;
		tryCall ([&] { v = x->ctrl->getParamNormalized (cutId); });
		return v;
	};

	// fresh instances (component + controller, synchronised as a DAW does after creation)
	std::vector<std::unique_ptr<Instance>> pool;
	auto fresh = [&] (const std::string& label) -> Instance* {
		pool.emplace_back (new Instance ());
		Instance* x = pool.back ().get ();
		x->label = " " + label;
		if (!createInstance (*x, m, host, false))
		{
			fail ("controller state: instance " + label + " created");
			return nullptr;
		}
		return x;
	};
	auto load = [&] (Instance* x, const std::vector<uint8_t>& comp) {
		x->setState (comp);
		x->setComponentStateOnController (comp);
	};

	[&] {
		// 2) format and setComponentState semantics
		Instance* C = fresh ("C");
		if (!C)
			return;
		{
			std::vector<uint8_t> d0;
			bool g = ctlGet (*C, d0);
			CtlState s0 = parseCtlState (d0);
			check (g && s0.parsed, "IEditController::getState writes 'WSC2' (magic, zoom, flag, name length, UTF-8 name, nothing else)", s0.str ());
			check (s0.parsed && s0.name == g_specPresets.defaultName && s0.dirty == 0 && s0.zoom == 1.0f,
			       "new instance: controller state names the opening preset '" + g_specPresets.defaultName + "', unmodified, zoom 1", s0.str ());
			std::vector<std::string> bad;
			for (auto& p : L)
			{
				C->setComponentStateOnController (exact[p.name]);
				CtlState s = ctlNow (*C);
				if (!s.parsed || s.name != p.name || s.dirty != 0)
					bad.push_back (strf ("#%d '%s' -> %s", p.index, p.name.c_str (), s.str ().c_str ()));
			}
			check (bad.empty (),
			       strf ("setComponentState with exactly a factory preset's values shows that preset, unmodified (%zu/%zu)", L.size () - bad.size (), L.size ()),
			       join (bad));
			const std::string cur = ctlNow (*C).name;
			C->setComponentStateOnController (modHaar);
			CtlState s = ctlNow (*C);
			check (s.parsed && s.name == cur && s.dirty == 1, "setComponentState with non-factory values keeps the current preset, marked modified",
			       strf ("before '%s', after %s", cur.c_str (), s.str ().c_str ()));
			auto off = valuesOff (C, *spec (kHaar), cutId);
			check (std::fabs (cutOf (C) - cutHaar) < 1e-6 && off.empty (), "... and the controller takes the loaded values",
			       strf ("Cutoff %.6f (loaded %.6f) ", cutOf (C), cutHaar) + join (off));
			C->setComponentStateOnController (exact[kHaar]);
			s = ctlNow (*C);
			check (s.parsed && s.name == kHaar && s.dirty == 0, "setComponentState with exact factory values again: that preset, unmodified", s.str ());
		}

		// 3) WSC2 round trip across instances (a DAW saving and reopening the project)
		std::vector<uint8_t> rtCtl, rtComp;
		{
			Instance* D1 = fresh ("D1");
			Instance* D2 = fresh ("D2");
			if (!D1 || !D2)
				return;
			load (D1, modHaar);
			const std::vector<uint8_t> crafted = makeWSC2 (1.25f, 1, "B · Space Choir");
			tresult r = ctlSet (*D1, crafted);
			ctlGet (*D1, rtCtl);
			D1->getState (rtComp);
			check (r == kResultOk && rtCtl == crafted, "WSC2 setState then getState gives the same bytes ('B · Space Choir', modified, zoom 1.25)",
			       strf ("setState %d; %s", r, parseCtlState (rtCtl).str ().c_str ()));
			load (D2, rtComp);
			tresult r2 = ctlSet (*D2, rtCtl);
			std::vector<uint8_t> g2;
			ctlGet (*D2, g2);
			auto vd = valuesDiffer (D1, D2);
			check (r2 == kResultOk && g2 == rtCtl && vd.empty (), "WSC2 round trip to a new instance: same preset name, modified flag, zoom and values",
			       parseCtlState (g2).str () + " " + join (vd));
			Instance* D3 = fresh ("D3");
			Instance* D4 = fresh ("D4");
			if (!D3 || !D4)
				return;
			load (D3, exact[kFocus]);
			std::vector<uint8_t> g3, g4, c3;
			ctlGet (*D3, g3);
			D3->getState (c3);
			load (D4, c3);
			ctlSet (*D4, g3);
			ctlGet (*D4, g4);
			CtlState s4 = parseCtlState (g4);
			check (g4 == g3 && s4.parsed && s4.name == kFocus && s4.dirty == 0 && s4.zoom == 1.0f,
			       "WSC2 round trip of an unmodified preset ('B · Focus Sweep', zoom 1)", s4.str ());
			Instance* D5 = fresh ("D5");
			if (!D5)
				return;
			ctlSet (*D5, rtCtl);
			load (D5, rtComp);
			std::vector<uint8_t> g5;
			ctlGet (*D5, g5);
			check (g5 == rtCtl, "reverse load order (controller state before component state) keeps the modified preset's name",
			       parseCtlState (g5).str (), Sev::Warn);
		}

		// 4) WSC1 (beta 0.1 projects): index into the old order
		{
			Instance* W = fresh ("W");
			if (!W)
				return;
			const SpecPreset* sm2 = spec (kSM2);
			load (W, exact[kSM2]);
			tresult r = ctlSet (*W, makeWSC1 (1.0f, 4, 0));
			CtlState s = ctlNow (*W);
			auto off = valuesOff (W, *sm2, (ParamID)-1);
			check (r == kResultOk && s.parsed && s.name == kSM2 && s.dirty == 0 && sm2->index == 0 && off.empty (),
			       "WSC1 old index 4, flag 0 -> 'A · Square Mod 2' (new index 0), unmodified, with its values",
			       strf ("setState %d; %s; new index %d ", r, s.str ().c_str (), sm2->index) + join (off));
			load (W, modMirror);
			r = ctlSet (*W, makeWSC1 (1.0f, 1, 1));
			s = ctlNow (*W);
			off = valuesOff (W, *spec (kMSB), cutId);
			check (r == kResultOk && s.parsed && s.name == kMSB && s.dirty == 1 && std::fabs (cutOf (W) - cutMirror) < 1e-6 && off.empty (),
			       "WSC1 old index 1, flag 1 -> 'B · Mirror Sub Bass' modified (with the loaded, modified values)",
			       strf ("setState %d; %s; Cutoff %.6f (loaded %.6f) ", r, s.str ().c_str (), cutOf (W), cutMirror) + join (off));
			if (!old.list.empty ())
			{
				std::vector<std::string> bad;
				for (auto& p : old.list)
				{
					const int32_t d = p.index & 1;
					ctlSet (*W, makeWSC1 (1.0f, p.index, d));
					CtlState t = ctlNow (*W);
					if (!t.parsed || t.name != p.name || t.dirty != d)
						bad.push_back (strf ("old #%d '%s' -> %s", p.index, p.name.c_str (), t.str ().c_str ()));
				}
				check (bad.empty (), strf ("WSC1: all %zu beta 0.1 indices give the preset of that name (previous build's presets_spec.txt)", old.list.size ()),
				       join (bad));
			}
			ctlSet (*W, makeWSC1 (1.5f, 0, 0));
			s = ctlNow (*W);
			check (s.parsed && s.zoom == 1.5f && s.name == kWarm && s.dirty == 0, "WSC1 zoom 1.5, old index 0 -> 'A · Warm Pad', zoom 1.5", s.str ());
			struct Bad1
			{
				std::string nm;
				std::vector<uint8_t> d;
			};
			std::vector<Bad1> b1 {{"index -1", makeWSC1 (1.0f, -1, 1)},
			                      {"index 32 (one past the old list)", makeWSC1 (1.0f, 32, 1)},
			                      {"index 0x7FFFFFFF", makeWSC1 (1.0f, 0x7FFFFFFF, 1)},
			                      {"index 0x80000000", makeWSC1 (1.0f, (int32_t)0x80000000u, 1)}};
			{
				auto v = makeWSC1 (1.0f, 2, 1);
				v.resize (12);
				b1.push_back ({"flag missing", v});
				v.resize (10);
				b1.push_back ({"cut inside the index", v});
			}
			std::vector<std::string> bad;
			for (auto& b : b1)
			{
				ctlSet (*W, makeWSC2 (1.0f, 0, kFlute));
				std::string crash;
				tresult rr = ctlSet (*W, b.d, &crash);
				CtlState t = ctlNow (*W);
				LOG ("  WSC1 %-34s -> setState %d, %s", b.nm.c_str (), rr, crash.empty () ? t.str ().c_str () : "CRASH");
				if (!crash.empty () || !t.parsed || t.name != kFlute || t.dirty != 0)
					bad.push_back (b.nm + ": " + (crash.empty () ? t.str () : "crash " + crash));
			}
			check (bad.empty (), strf ("%zu invalid or truncated WSC1 states: no crash, preset and flag kept", b1.size ()), join (bad));
		}

		// 5) hostile / truncated WSC2 states (from a known state 'B · Soft Flute', unmodified, zoom 1)
		Instance* H = fresh ("H");
		if (!H)
			return;
		{
			auto hdr = [] (float z, int32_t dt, uint32_t len) {
				std::vector<uint8_t> v;
				put32 (v, kWSC2);
				putF32 (v, z);
				put32 (v, (uint32_t)dt);
				put32 (v, len);
				return v;
			};
			auto plus = [] (std::vector<uint8_t> v, const std::string& s) {
				v.insert (v.end (), s.begin (), s.end ());
				return v;
			};
			struct Blob
			{
				std::string nm;
				std::vector<uint8_t> d;
			};
			const uint32_t wl = (uint32_t)kWarm.size ();
			std::vector<Blob> blobs;
			blobs.push_back ({"len 0xFFFFFFFF, nothing after", hdr (1, 1, 0xFFFFFFFFu)});
			{
				auto v = plus (hdr (1, 1, 0xFFFFFFFFu), kWarm);
				v.resize (v.size () + 300, 'A');
				blobs.push_back ({"len 0xFFFFFFFF + valid name + 300 bytes", v});
			}
			blobs.push_back ({"len 0x80000000 + valid name", plus (hdr (1, 1, 0x80000000u), kWarm)});
			{
				auto v = hdr (1, 1, 200);
				v.resize (16 + 200, 'A');
				blobs.push_back ({"len 200 + 200 bytes", v});
			}
			{
				auto v = plus (hdr (1, 1, 200), kWarm);
				v.resize (16 + 200, 0);
				blobs.push_back ({"len 200: valid name + NUL padding", v});
			}
			{
				auto v = plus (hdr (1, 1, 128), kWarm);
				v.resize (16 + 128, 0);
				blobs.push_back ({"len 128 (limit): valid name + NUL padding", v});
			}
			blobs.push_back ({"len = name + 5, stream ends after the name", plus (hdr (1, 1, wl + 5), kWarm)});
			blobs.push_back ({"name cut after 6 of its bytes", plus (hdr (1, 1, wl), kWarm.substr (0, 6))});
			blobs.push_back ({"header only, name bytes missing", hdr (1, 1, wl)});
			for (size_t cut : {14u, 12u, 10u, 8u, 6u, 4u, 2u, 0u})
			{
				auto v = plus (hdr (1, 1, wl), kWarm);
				v.resize (cut);
				blobs.push_back ({strf ("stream cut after %zu bytes", cut), v});
			}
			const std::vector<std::pair<std::string, std::string>> unknown {
			    {"'A · Warm Pad 2'", "A · Warm Pad 2"}, {"'a · warm pad' (case)", "a · warm pad"}, {"'A - Warm Pad' (ASCII dash)", "A - Warm Pad"},
			    {"'B · Init ' (trailing space)", "B · Init "}, {"'A · Warm Pa' (prefix)", "A · Warm Pa"}, {"empty name (len 0)", ""},
			    {"'User sound'", "User sound"}, {"invalid UTF-8 FF FE 80 C0", std::string ("\xFF\xFE\x80\xC0", 4)},
			    {"127 x 'x' (longest accepted length)", std::string (127, 'x')}};
			for (auto& u : unknown)
				blobs.push_back ({"unknown name " + u.first, makeWSC2 (1.0f, 1, u.second)});
			{
				auto v = makeWSC2 (1.0f, 1, kWarm);
				v[3] = 0x33;
				blobs.push_back ({"magic 'WSC3'", v});
				v[3] = 0x32;
				v[0] ^= 0x20;
				blobs.push_back ({"magic 'wSC2'", v});
			}
			blobs.push_back ({"component state ('WSY1') given to IEditController::setState", exact[kWarm]});
			{
				std::vector<uint8_t> g (512);
				std::mt19937 rng (11);
				for (auto& b : g)
					b = (uint8_t)(rng () & 0xFF);
				memcpy (g.data (), "WSC2", 4);
				blobs.push_back ({"'WSC2' + 508 random bytes", g});
			}
			std::vector<std::string> bad;
			for (auto& b : blobs)
			{
				ctlSet (*H, makeWSC2 (1.0f, 0, kFlute));
				std::string c1, c2;
				tresult r = ctlSet (*H, b.d, &c1);
				std::vector<uint8_t> out;
				ctlGet (*H, out, &c2);
				CtlState s = parseCtlState (out);
				LOG ("  hostile %-56s -> setState %d, %s", b.nm.c_str (), r, c1.empty () && c2.empty () ? s.str ().c_str () : "CRASH");
				if (!c1.empty () || !c2.empty ())
					bad.push_back (b.nm + ": crash " + c1 + " " + c2);
				else if (!s.parsed || !factory.count (s.name))
					bad.push_back (b.nm + ": preset out of range -> " + s.str ());
				else if (s.name != kFlute || s.dirty != 0)
					bad.push_back (b.nm + ": preset or flag not kept -> " + s.str ());
				else if (!(s.zoom >= 0.5f && s.zoom <= 2.0f))
					bad.push_back (b.nm + ": zoom -> " + s.str ());
			}
			check (bad.empty (), strf ("%zu hostile or truncated WSC2 states: no crash, preset stays a factory preset, preset and flag kept", blobs.size ()),
			       join (bad));
			ctlSet (*H, makeWSC2 (1.0f, 1, kBInit));
			CtlState s = ctlNow (*H);
			check (s.parsed && s.name == kBInit && s.dirty == 1, "a valid WSC2 state still loads after the hostile ones", s.str ());
			ctlSet (*H, makeWSC2 (1.0f, 0x7FFFFFFF, kAInit));
			CtlState sa = ctlNow (*H);
			ctlSet (*H, makeWSC2 (1.0f, -1, kAInit));
			CtlState sb = ctlNow (*H);
			check (sa.parsed && sb.parsed && sa.dirty == 1 && sb.dirty == 1 && sa.name == kAInit, "modified flag 0x7FFFFFFF / -1 is written back as 1",
			       sa.str () + " / " + sb.str ());
			{
				std::string n = kWarm;
				n.push_back ('\0');
				n += "XYZ";
				ctlSet (*H, makeWSC2 (1.0f, 0, kFlute));
				ctlSet (*H, makeWSC2 (1.0f, 1, n));
				LOG ("  info: name 'A · Warm Pad\\0XYZ' (embedded NUL, len %zu) -> %s", n.size (), ctlNow (*H).str ().c_str ());
			}
			struct Zc
			{
				const char* nm;
				float z;
			};
			const float inf = std::numeric_limits<float>::infinity ();
			const std::vector<Zc> zs {{"NaN", std::nanf ("")}, {"+Inf", inf}, {"-Inf", -inf}, {"1e30", 1e30f}, {"-3", -3.f},
			                          {"0", 0.f}, {"1e-40 (denormal)", 1e-40f}, {"3", 3.f}};
			std::vector<std::string> zbad;
			std::string zlog;
			for (auto& z : zs)
			{
				ctlSet (*H, makeWSC2 (1.0f, 0, kFlute));
				std::string crash;
				ctlSet (*H, makeWSC2 (z.z, 0, kBInit), &crash);
				CtlState t = ctlNow (*H);
				zlog += strf ("%s -> %.4g; ", z.nm, t.zoom);
				if (!crash.empty () || !t.parsed || !(t.zoom >= 0.5f && t.zoom <= 2.0f) || t.name != kBInit)
					zbad.push_back (strf ("%s: %s", z.nm, crash.empty () ? t.str ().c_str () : crash.c_str ()));
			}
			LOG ("  hostile zoom values: %s", zlog.c_str ());
			check (zbad.empty (), strf ("%zu hostile zoom values (NaN, Inf, 1e30, negative, 0, denormal, 3) end within 0.5 .. 2", zs.size ()), join (zbad));
		}

		// 6) editor: the preset field after a reload, compared with the field reached with the editor's own arrows
		if (g_opt.skipEditor)
			return;
		Instance* R = fresh ("R");
		if (!R)
			return;
		EditorSession er;
		if (!er.open (*R, 1.0, false, "ctrl-state reference editor"))
		{
			fail ("controller state: reference editor opens");
			return;
		}
		pump (400);
		const int baseW = er.size.getWidth (), baseH = er.size.getHeight ();
		const POINT prev = er.scaled ({581, 24}), next = er.scaled ({852, 24});
		for (int k = 0; k < 10; k++)
		{
			er.click (prev);
			pump (100);
		}
		CtlState s = ctlNow (*R);
		check (s.parsed && s.name == kSM2 && s.dirty == 0, "editor: 10 x previous from 'A · Warm Pad' -> 'A · Square Mod 2' (first in the menu)", s.str ());
		Crop refSM2 = presetFieldCrop (er, "ctlstate_ref_square_mod_2.png");
		er.click (prev);
		pump (100);
		s = ctlNow (*R);
		check (s.parsed && s.name == kBInit, "editor: previous on the first preset wraps to the last ('B · Init')", s.str ());
		for (int k = 0; k < 12; k++)
		{
			er.click (next);
			pump (100);
		}
		s = ctlNow (*R);
		check (s.parsed && s.name == kMSB && s.dirty == 0, "editor: then 12 x next -> 'B · Mirror Sub Bass' (index 11)", s.str ());
		Crop refMSB = presetFieldCrop (er, "ctlstate_ref_mirror_sub_bass.png");
		R->setComponentStateOnController (modMirror);
		s = ctlNow (*R);
		Crop refMSBmod = presetFieldCrop (er, "ctlstate_ref_mirror_sub_bass_modified.png");
		const double dm = cropDiff (refMSB, refMSBmod), dd = cropDiff (refSM2, refMSB);
		check (s.dirty == 1 && dm > 0.003, "editor marks the preset modified when non-factory values arrive (field changes)",
		       s.str () + "; " + cropDiffStr (dm));
		check (dd > 0.01, "sanity: the preset field differs between two presets", cropDiffStr (dd));
		er.close (false);
		auto same = [] (double d) { return d >= 0 && d <= 0.002; };

		Instance* L1 = fresh ("L1");
		if (!L1)
			return;
		load (L1, exact[kSM2]);
		ctlSet (*L1, makeWSC1 (1.0f, 4, 0));
		{
			EditorSession e1;
			if (e1.open (*L1, 1.0, false, "reloaded WSC1 editor"))
			{
				Crop c = presetFieldCrop (e1, "ctlstate_reload_wsc1_square_mod_2.png");
				double d = cropDiff (c, refSM2);
				check (same (d), "editor after reloading a beta 0.1 project (WSC1 index 4) shows 'A · Square Mod 2'", cropDiffStr (d));
				load (L1, modMirror);
				ctlSet (*L1, makeWSC2 (1.0f, 1, kMSB));
				Crop c2 = presetFieldCrop (e1, "ctlstate_open_editor_mirror_sub_bass_modified.png");
				d = cropDiff (c2, refMSBmod);
				check (same (d), "open editor follows a state loaded while it is open ('B · Mirror Sub Bass' modified)", cropDiffStr (d));
				e1.close (false);
			}
			else
				fail ("controller state: editor of the reloaded instance opens");
		}
		Instance* L2 = fresh ("L2");
		if (!L2)
			return;
		load (L2, modMirror);
		ctlSet (*L2, makeWSC1 (1.0f, 1, 1));
		{
			EditorSession e2;
			if (e2.open (*L2, 1.0, false, "reloaded WSC1 modified editor"))
			{
				Crop c = presetFieldCrop (e2, "ctlstate_reload_wsc1_mirror_sub_bass_modified.png");
				double d = cropDiff (c, refMSBmod);
				check (same (d), "editor after reloading WSC1 index 1 flag 1 shows 'B · Mirror Sub Bass' modified", cropDiffStr (d));
				e2.close (false);
			}
			else
				fail ("controller state: editor of the reloaded instance opens");
		}
		Instance* L3 = fresh ("L3");
		if (!L3)
			return;
		load (L3, rtComp);
		ctlSet (*L3, rtCtl);
		{
			EditorSession e3;
			if (e3.open (*L3, 1.0, false, "reloaded WSC2 zoom 1.25 editor"))
			{
				pump (400);
				const int w = e3.size.getWidth (), h = e3.size.getHeight ();
				check (std::abs (w - (int)std::lround (baseW * 1.25)) <= 2 && std::abs (h - (int)std::lround (baseH * 1.25)) <= 2,
				       "editor after a WSC2 reload opens at the saved zoom (1.25)", strf ("%d x %d (zoom 1: %d x %d)", w, h, baseW, baseH));
				Capture cap = captureWindow (e3.top, outPath ("ctlstate_reload_wsc2_space_choir_zoom125.png"));
				LOG ("  reloaded 'B · Space Choir' modified at zoom 1.25: ctlstate_reload_wsc2_space_choir_zoom125.png (%d x %d, %d colours)", cap.w,
				     cap.h, cap.distinctColors);
				e3.close (false);
			}
			else
				fail ("controller state: editor of the reloaded instance opens");
		}
		{
			EditorSession e4;
			if (e4.open (*H, 1.0, false, "editor after hostile states"))
			{
				pump (400);
				Capture cap = captureWindow (e4.top, outPath ("ctlstate_after_hostile_states.png"));
				const int w = e4.size.getWidth ();
				check (cap.distinctColors > 8 && std::abs (w - 2 * baseW) <= 2, "editor opens and draws after the hostile states (zoom clamped to 2)",
				       strf ("%d x %d, %d colours (zoom 1 width %d)", cap.w, cap.h, cap.distinctColors, baseW));
				e4.close (false);
			}
			else
				fail ("controller state: editor opens after the hostile states");
		}
		g_reloadComp = modMirror;
		g_reloadCtl = makeWSC2 (1.0f, 1, kMSB);
		g_reloadName = kMSB;
		g_reloadCrop = refMSBmod;
	}();

	for (auto& x : pool)
		x->destroy ();
	pass (strf ("controller state: %zu test instances torn down", pool.size ()));
}

//==============================================================================
// Teardown / reload
//==============================================================================
static void unloadModule (Module& m, bool verbose)
{
	if (m.f3)
	{
		m.f3->release ();
		m.f3 = nullptr;
	}
	if (m.f2)
	{
		m.f2->release ();
		m.f2 = nullptr;
	}
	if (m.factory)
	{
		uint32 rc = 0;
		guarded ("release IPluginFactory", [&] { rc = m.factory->release (); });
		if (verbose)
			LOG ("  factory released (refcount returned %u)", rc);
		m.factory = nullptr;
	}
	if (m.exitDll)
	{
		bool ok = false;
		if (guarded ("ExitDll()", [&] { ok = m.exitDll (); }) && verbose)
			check (ok, "ExitDll() returns true");
	}
	if (m.h)
	{
		guarded ("FreeLibrary", [&] { FreeLibrary (m.h); });
		// timers/threads/window classes left behind by the plug-in crash after unload
		pump (500);
		HMODULE still = GetModuleHandleW (m.dll.c_str ());
		if (verbose)
			check (still == nullptr, "module unloaded after FreeLibrary", still ? "still loaded (extra LoadLibrary reference?)" : "",
			       Sev::Warn);
		m.h = nullptr;
	}
}

static void testReload (HostApplication* host)
{
	beginSection ("Reload cycle (load -> use -> unload -> load again)");
	for (int cycle = 1; cycle <= 2; cycle++)
	{
		Module m2;
		if (!loadModule (m2, g_opt.pluginPath, host, false))
		{
			fail (strf ("reload %d: module loads again after FreeLibrary", cycle));
			return;
		}
		PClassInfo ci;
		for (int32 i = 0; i < m2.factory->countClasses (); i++)
			if (m2.factory->getClassInfo (i, &ci) == kResultOk && std::string (ci.category) == kVstAudioEffectClass)
			{
				m2.procClass = ci;
				m2.haveProc = true;
				break;
			}
		Instance in;
		in.label = strf (" (reload %d)", cycle);
		bool ok = m2.haveProc && createInstance (in, m2, host, false);
		if (ok)
		{
			SpeakerArrangement stereo = SpeakerArr::kStereo;
			tryCall ([&] {
				in.proc->setBusArrangements (nullptr, 0, &stereo, 1);
				in.comp->activateBus (kEvent, kInput, 0, true);
				in.comp->activateBus (kAudio, kOutput, 0, true);
			});
			ok &= in.configure (g_opt.sr, g_opt.block, false);
			Scenario s = scenarioSingle (g_opt.sr, 60, 0.3, 0.2, "reload");
			RenderOptions o;
			o.block = g_opt.block;
			RenderResult r = in.render (s, o);
			ok &= !r.crashed && r.nan == 0 && segStats (r.L, r.R, 0, (int64)r.L.size ()).peak > 1e-4;
			// cycle 1: reopen the project saved before the module was unloaded (controller state 'WSC2')
			const bool project = cycle == 1 && !g_reloadCtl.empty ();
			if (project)
			{
				in.loadState (g_reloadComp);
				ctlSet (in, g_reloadCtl);
				CtlState s = ctlNow (in);
				check (s.parsed && s.name == g_reloadName && s.dirty == 1,
				       "reload 1: project saved before the unload reopens on '" + g_reloadName + "', modified", s.str ());
			}
			if (!g_opt.skipEditor)
			{
				EditorSession e;
				ok &= e.open (in, 1.0, false, strf ("reload %d editor", cycle));
				pump (300);
				if (project && e.top)
				{
					Crop c = presetFieldCrop (e, "ctlstate_after_module_reload.png");
					double d = cropDiff (c, g_reloadCrop);
					check (d >= 0 && d <= 0.002, "reload 1: editor shows '" + g_reloadName + "' modified after the module reload", cropDiffStr (d));
				}
				e.close (false);
			}
		}
		in.destroy ();
		unloadModule (m2, false);
		check (ok, strf ("reload %d: load, instantiate, render, open editor, unload", cycle));
	}
}

//==============================================================================
// main
//==============================================================================
static void usage ()
{
	printf ("usage: vst3host.exe <path-to-.vst3-bundle-or-dll> <outdir> [--sr 48000] [--block 512] [--quick]\n"
	        "                    [--skip-editor] [--real-input] [--drag x,y]... [--click x,y]... [--no-reload]\n"
	        "                    [--timeout seconds] [--pace] [--only sections] [--presets file]\n"
	        "  sections (comma separated): params,audio,state,offline,experiment,presets,sub,porta,hinote,attrlist,parity,stress,editor,instances,ctrlstate,reload\n");
}

static bool parsePoint (const std::wstring& s, POINT& p)
{
	return swscanf (s.c_str (), L"%ld,%ld", &p.x, &p.y) == 2;
}

int main ()
{
	SetConsoleOutputCP (CP_UTF8);
	int argc = 0;
	wchar_t** argv = CommandLineToArgvW (GetCommandLineW (), &argc);
	std::vector<std::wstring> pos;
	for (int i = 1; i < argc; i++)
	{
		std::wstring a = argv[i];
		auto next = [&] () -> std::wstring { return i + 1 < argc ? std::wstring (argv[++i]) : std::wstring (); };
		if (a == L"--sr")
			g_opt.sr = _wtof (next ().c_str ());
		else if (a == L"--block")
			g_opt.block = _wtoi (next ().c_str ());
		else if (a == L"--quick")
			g_opt.quick = true;
		else if (a == L"--skip-editor")
			g_opt.skipEditor = true;
		else if (a == L"--real-input")
			g_opt.realInput = true;
		else if (a == L"--no-reload")
			g_opt.noReload = true;
		else if (a == L"--pace")
			g_opt.pace = true;
		else if (a == L"--presets")
			g_opt.presetsFile = next ();
		else if (a == L"--only")
		{
			std::string l = w2u (next ()) + ",";
			for (size_t p0 = 0, p1; (p1 = l.find (',', p0)) != std::string::npos; p0 = p1 + 1)
				if (p1 > p0)
					g_opt.only.insert (l.substr (p0, p1 - p0));
		}
		else if (a == L"--timeout")
			g_opt.timeoutSec = _wtof (next ().c_str ());
		else if (a == L"--drag" || a == L"--click")
		{
			POINT p;
			if (!parsePoint (next (), p))
			{
				usage ();
				return 64;
			}
			(a == L"--drag" ? g_opt.drags : g_opt.clicks).push_back (p);
		}
		else if (a == L"-h" || a == L"--help")
		{
			usage ();
			return 64;
		}
		else
			pos.push_back (a);
	}
	if (pos.size () != 2 || g_opt.sr < 8000 || g_opt.block < 1 || g_opt.block > 8192)
	{
		usage ();
		return 64;
	}
	g_opt.pluginPath = pos[0];
	g_opt.outDir = pos[1];
	{
		wchar_t full[MAX_PATH * 4];
		if (GetFullPathNameW (g_opt.outDir.c_str (), MAX_PATH * 4, full, nullptr))
			g_opt.outDir = full;
		if (GetFullPathNameW (g_opt.pluginPath.c_str (), MAX_PATH * 4, full, nullptr))
			g_opt.pluginPath = full;
	}
	if (!makeDirs (g_opt.outDir))
	{
		fprintf (stderr, "cannot create output directory %s\n", w2u (g_opt.outDir).c_str ());
		return 64;
	}
	g_outDir = g_opt.outDir;
	g_report = _wfopen (outPath ("report.txt").c_str (), L"wb");
	g_pluginPathForSummary = w2u (g_opt.pluginPath);
	g_timeoutMs = g_opt.timeoutSec * 1000.0;
	g_mainThreadId = GetCurrentThreadId ();

	// crash / abort / hang protection
	SetUnhandledExceptionFilter (unhandledCrashFilter);
	signal (SIGABRT, abortSignalHandler);
	SetErrorMode (SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX);
	beat ();
	std::thread wd (watchdogThread);
	wd.detach ();

	// DAW-like process environment: per-monitor DPI aware, OLE on the UI thread, GDI+ for PNGs
	{
		typedef BOOL (WINAPI * SetCtx) (HANDLE);
		if (auto f = (SetCtx)(void*)GetProcAddress (GetModuleHandleW (L"user32.dll"), "SetProcessDpiAwarenessContext"))
			f ((HANDLE)-4 /* DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 */);
		else
			SetProcessDPIAware ();
	}
	OleInitialize (nullptr);
	Gdiplus::GdiplusStartupInput gsi;
	Gdiplus::GdiplusStartup (&g_gdiplusToken, &gsi, nullptr);

	SYSTEMTIME stime;
	GetLocalTime (&stime);
	LOG ("vst3host - Wavelet Synthesizer VST3 test host");
	LOG ("date      : %04d-%02d-%02d %02d:%02d:%02d", stime.wYear, stime.wMonth, stime.wDay, stime.wHour, stime.wMinute,
	     stime.wSecond);
	LOG ("plugin    : %s", w2u (g_opt.pluginPath).c_str ());
	LOG ("outdir    : %s", w2u (g_opt.outDir).c_str ());
	LOG ("settings  : %.0f Hz, block %d%s%s%s%s", g_opt.sr, g_opt.block, g_opt.quick ? ", quick" : "",
	     g_opt.skipEditor ? ", no editor" : "", g_opt.realInput ? ", real mouse input" : "",
	     g_opt.pace ? ", all renders paced in real time" : "");
	if (!g_opt.only.empty ())
	{
		std::string l;
		for (auto& x : g_opt.only)
			l += " " + x;
		LOG ("sections  :%s", l.c_str ());
	}

	HostApplication* host = new HostApplication ();
	Module mod;
	Instance in;
	AudioCtx ac;

	beginSection ("Module");
	bool loaded = loadModule (mod, g_opt.pluginPath, host, true);
	if (!loaded)
	{
		LOG ("  plug-in could not be loaded; nothing else to test.");
		writeSummary ();
		if (g_report)
			fclose (g_report);
		return 2;
	}
	listFactory (mod);
	bool created = false;
	if (mod.haveProc)
	{
		beginSection ("Instantiation");
		created = createInstance (in, mod, host, true);
	}
	if (created)
	{
		for (auto& p : in.params)
			tryCall ([&] { g_initialCtrl[p.info.id] = in.ctrl->getParamNormalized (p.info.id); });
		{
			std::wstring pf = g_opt.presetsFile;
			if (pf.empty ())
			{
				wchar_t exe[MAX_PATH] = {};
				GetModuleFileNameW (nullptr, exe, MAX_PATH);
				std::wstring e = exe;
				pf = e.substr (0, e.find_last_of (L"/\\")) + L"\\presets_spec.txt";
			}
			if (loadSpecPresets (pf, g_specPresets))
				LOG ("  presets file: %s (%zu presets, default '%s')", w2u (pf).c_str (), g_specPresets.list.size (),
				     g_specPresets.defaultName.c_str ());
			else
				LOG ("  (no presets file at %s - preset sections skipped; run node tests/vst3host/make_presets.js)", w2u (pf).c_str ());
		}
		testBuses (in);
		if (want ("params"))
			testParameters (in);
		else
			in.readParams ();
		testUnitsAndMidiMapping (in, ac.bendId, ac.modId);
		in.getState (ac.initialState);
		// Neutral reference for the audio tests: all declared defaults (a new instance starts on a preset).
		applyDeclaredDefaults (in);
		in.getState (ac.defaultState);
		LOG ("  neutral reference state: every parameter at its declared default (%zu bytes); initial state kept separately (%zu bytes)",
		     ac.defaultState.size (), ac.initialState.size ());
		if (want ("presets"))
			testInitialPreset (in, ac);
		if (want ("audio"))
		{
			testAudioBasics (in, ac);
			testAudioParams (in, ac);
			testSilence (in, ac);
		}
		else
		{
			// determinism is needed by later comparisons
			Scenario a = scenarioShort (in.sr, g_opt.block);
			RenderOptions o;
			o.block = g_opt.block;
			RenderResult x = in.render (a, o), y = in.render (a, o);
			ac.deterministic = compareAudio (x.L, x.R, y.L, y.R, (int)in.sr).maxAbsDiff < 1e-6;
		}
		if (want ("state"))
		{
			testStatePerParam (in, ac); // first: needs the pristine default state
			testState (in, ac);
		}
		if (want ("offline"))
			testOffline (in, ac);
		if (want ("sub"))
			testSubOsc (in, ac);
		if (want ("porta"))
		{
			testPortamento (in, ac);
			testPolyPorta (in, ac);
		}
		if (want ("hinote"))
			testHighNotes (in, ac);
		if (want ("presets"))
			testSpecPresets (in, ac);
		if (want ("experiment"))
			testDeterminismExperiment (in, ac);
		if (want ("stress"))
			testStress (in, ac);
		if (!g_opt.skipEditor && want ("editor"))
			testEditor (in, ac);
		if (!g_opt.skipEditor && (want ("editor") || want ("parity")))
			testPresetParity (in, ac);
		if (want ("instances"))
			testInstances (mod, host, in, ac);
		if (want ("ctrlstate"))
			testCtrlState (mod, host, in, ac);
		if (want ("attrlist"))
			testPluginAttrList (mod);
	}

	beginSection ("Teardown");
	in.destroy ();
	pump (100);
	{
		std::lock_guard<std::mutex> lk (g_threadStats.mx);
		std::string a, o;
		for (auto& kv : g_threadStats.onAudio)
			a += strf ("%s x%d; ", kv.first.c_str (), kv.second);
		for (auto& kv : g_threadStats.onOther)
			o += strf ("%s x%d; ", kv.first.c_str (), kv.second);
		check (g_threadStats.onAudio.empty (), "plug-in never calls host UI-thread interfaces from the audio thread", a);
		check (g_threadStats.onOther.empty (), "plug-in calls host interfaces only from the main thread", o, Sev::Warn);
	}
	check (g_mxcsrChanged.load () == 0, "process() restores the audio thread's FPU mode (MXCSR: FTZ/DAZ/rounding)",
	       g_mxcsrChanged.load () ? strf ("%d calls returned with MXCSR changed, e.g. 0x%04X -> 0x%04X (affects the host's own DSP on that thread)",
	                                     g_mxcsrChanged.load (), g_mxcsrBefore.load (), g_mxcsrAfter.load ())
	                              : "",
	       Sev::Warn);
	LOG ("  IMessage objects created via IHostApplication::createInstance: %d", HostMessage::created.load ());
	check (HostMessage::live.load () == 0, "all host IMessage objects released by the plug-in",
	       HostMessage::live.load () ? strf ("%d still alive (leak)", HostMessage::live.load ()) : "", Sev::Warn);
	check (HostAttributeList::live.load () == 0, "all host IAttributeList objects released",
	       HostAttributeList::live.load () ? strf ("%d still alive (leak)", HostAttributeList::live.load ()) : "", Sev::Warn);
	unloadModule (mod, true);
	check (host->refCount.load () == 1, "plug-in released every reference to the host context",
	       host->refCount.load () == 1 ? "" : strf ("host context refcount %d (expected 1)", host->refCount.load ()), Sev::Warn);

	if (!g_opt.noReload && created && want ("reload"))
		testReload (host);

	host->release ();
	Gdiplus::GdiplusShutdown (g_gdiplusToken);
	OleUninitialize ();
	g_watchdogRun = false;
	int fails = writeSummary ();
	LOG ("report: %s", w2u (outPath ("report.txt")).c_str ());
	if (g_report)
		fclose (g_report);
	g_report = nullptr;
	return fails ? 1 : 0;
}
