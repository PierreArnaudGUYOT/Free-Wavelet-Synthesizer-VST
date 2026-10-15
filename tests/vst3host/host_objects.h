// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// host_objects.h - host-side implementations of the VST3 interfaces a DAW
// provides to a plug-in: IHostApplication (+IPlugInterfaceSupport), IMessage,
// IAttributeList, IBStream (memory stream), IComponentHandler(2) + IUnitHandler,
// IParameterChanges / IParamValueQueue, IEventList and IPlugFrame.
//
// Included only by host.cpp (single translation unit).
#pragma once

using namespace Steinberg;
using namespace Steinberg::Vst;

//==============================================================================
// Thread bookkeeping: which host callbacks did the plug-in call from which thread?
// VST3 requires IComponentHandler / IPlugFrame / IHostApplication calls on the UI
// (main) thread; Ableton and other hosts may crash otherwise.
//==============================================================================
static DWORD g_mainThreadId = 0;
static std::atomic<DWORD> g_audioThreadId {0}; // thread currently running process() (0 = none)

struct ThreadStats
{
	std::mutex mx;
	std::map<std::string, int> onAudio; // callback name -> count of calls from the audio thread
	std::map<std::string, int> onOther; // callback name -> count of calls from other non-main threads
};
static ThreadStats g_threadStats;

static void noteCallbackThread (const char* what)
{
	DWORD t = GetCurrentThreadId ();
	if (t == g_mainThreadId)
		return;
	std::lock_guard<std::mutex> lk (g_threadStats.mx);
	if (t == g_audioThreadId.load ())
		g_threadStats.onAudio[what]++;
	else
		g_threadStats.onOther[what]++;
}

//==============================================================================
// Interface-ID names (for readable logs)
//==============================================================================
struct KnownIid
{
	const FUID* iid;
	const char* name;
};
static const KnownIid kKnownIids[] = {
    {&FUnknown::iid, "FUnknown"},
    {&IPluginBase::iid, "IPluginBase"},
    {&IPluginFactory::iid, "IPluginFactory"},
    {&IPluginFactory2::iid, "IPluginFactory2"},
    {&IPluginFactory3::iid, "IPluginFactory3"},
    {&IBStream::iid, "IBStream"},
    {&ISizeableStream::iid, "ISizeableStream"},
    {&IComponent::iid, "IComponent"},
    {&IAudioProcessor::iid, "IAudioProcessor"},
    {&IAudioPresentationLatency::iid, "IAudioPresentationLatency"},
    {&IProcessContextRequirements::iid, "IProcessContextRequirements"},
    {&IEditController::iid, "IEditController"},
    {&IEditController2::iid, "IEditController2"},
    {&IMidiMapping::iid, "IMidiMapping"},
    {&IEditControllerHostEditing::iid, "IEditControllerHostEditing"},
    {&IComponentHandler::iid, "IComponentHandler"},
    {&IComponentHandler2::iid, "IComponentHandler2"},
    {&IComponentHandler3::iid, "IComponentHandler3"},
    {&IComponentHandlerBusActivation::iid, "IComponentHandlerBusActivation"},
    {&IComponentHandlerSystemTime::iid, "IComponentHandlerSystemTime"},
    {&IProgress::iid, "IProgress"},
    {&IContextMenuTarget::iid, "IContextMenuTarget"},
    {&IUnitHandler::iid, "IUnitHandler"},
    {&IUnitHandler2::iid, "IUnitHandler2"},
    {&IUnitInfo::iid, "IUnitInfo"},
    {&IProgramListData::iid, "IProgramListData"},
    {&IUnitData::iid, "IUnitData"},
    {&IConnectionPoint::iid, "IConnectionPoint"},
    {&IMessage::iid, "IMessage"},
    {&IAttributeList::iid, "IAttributeList"},
    {&IStreamAttributes::iid, "IStreamAttributes"},
    {&IHostApplication::iid, "IHostApplication"},
    {&IPlugInterfaceSupport::iid, "IPlugInterfaceSupport"},
    {&IVst3ToVst2Wrapper::iid, "IVst3ToVst2Wrapper"},
    {&IVst3ToAUWrapper::iid, "IVst3ToAUWrapper"},
    {&IVst3ToAAXWrapper::iid, "IVst3ToAAXWrapper"},
    {&IVst3WrapperMPESupport::iid, "IVst3WrapperMPESupport"},
    {&IParameterChanges::iid, "IParameterChanges"},
    {&IParamValueQueue::iid, "IParamValueQueue"},
    {&IEventList::iid, "IEventList"},
    {&IPlugView::iid, "IPlugView"},
    {&IPlugFrame::iid, "IPlugFrame"},
    {&IPlugViewContentScaleSupport::iid, "IPlugViewContentScaleSupport"},
    {&INoteExpressionController::iid, "INoteExpressionController"},
    {&IKeyswitchController::iid, "IKeyswitchController"},
    {&ChannelContext::IInfoListener::iid, "IInfoListener"},
    {&IMidiLearn::iid, "IMidiLearn"},
    {&IAutomationState::iid, "IAutomationState"},
    {&IParameterFunctionName::iid, "IParameterFunctionName"},
    {&IPrefetchableSupport::iid, "IPrefetchableSupport"},
    {&IRemapParamID::iid, "IRemapParamID"},
    {&INoteExpressionPhysicalUIMapping::iid, "INoteExpressionPhysicalUIMapping"},
    {&IDataExchangeHandler::iid, "IDataExchangeHandler"},
    {&IDataExchangeReceiver::iid, "IDataExchangeReceiver"},
};

static std::string tuidHex (const TUID t)
{
	char8 buf[64] = {};
	FUID::fromTUID (t).toString (buf);
	return buf;
}

static std::string iidName (const TUID t)
{
	for (auto& k : kKnownIids)
		if (FUnknownPrivate::iidEqual (t, k.iid->toTUID ()))
			return k.name;
	return "unknown-" + tuidHex (t);
}

static bool iidIs (const TUID a, const FUID& b) { return FUnknownPrivate::iidEqual (a, b.toTUID ()); }

// Logs (once per object kind + IID) interfaces the plug-in asked for but the host does not provide.
static void noteUnsupportedQuery (const char* object, const TUID iid)
{
	static std::mutex mx;
	static std::set<std::string> seen;
	std::string key = std::string (object) + ":" + iidName (iid);
	std::lock_guard<std::mutex> lk (mx);
	if (seen.insert (key).second)
		LOG ("  [host] plug-in queried %s for %s -> not supported (kNoInterface)", object, iidName (iid).c_str ());
}

// Reference counting boilerplate for host objects (initial count 1, owned by the creator).
#define HOST_REFCOUNT                                                                                         \
	std::atomic<int32> refCount {1};                                                                          \
	uint32 PLUGIN_API addRef () override { return (uint32)++refCount; }                                       \
	uint32 PLUGIN_API release () override                                                                     \
	{                                                                                                         \
		int32 r = --refCount;                                                                                 \
		if (r == 0)                                                                                           \
			delete this;                                                                                      \
		return (uint32)r;                                                                                     \
	}

#define QI_ENTRY(Iface)                                                                                       \
	if (iidIs (_iid, Iface::iid))                                                                              \
	{                                                                                                         \
		addRef ();                                                                                            \
		*obj = static_cast<Iface*> (this);                                                                    \
		return kResultOk;                                                                                     \
	}
#define QI_UNKNOWN(Iface)                                                                                     \
	if (iidIs (_iid, FUnknown::iid))                                                                           \
	{                                                                                                         \
		addRef ();                                                                                            \
		*obj = static_cast<FUnknown*> (static_cast<Iface*> (this));                                           \
		return kResultOk;                                                                                     \
	}

//==============================================================================
// IAttributeList
//==============================================================================
class HostAttributeList final : public IAttributeList
{
public:
	static std::atomic<int> live; // instances alive (leak detection)
	HostAttributeList () { ++live; }
	~HostAttributeList () { --live; }

	struct Value
	{
		enum Type
		{
			kInt,
			kFloat,
			kString,
			kBinary
		} type = kInt;
		int64 i = 0;
		double f = 0;
		std::u16string s;
		std::vector<uint8_t> bin;
	};
	std::map<std::string, Value> values;

	tresult PLUGIN_API setInt (AttrID id, int64 value) override
	{
		if (!id)
			return kInvalidArgument;
		Value v;
		v.type = Value::kInt;
		v.i = value;
		values[id] = std::move (v);
		return kResultTrue;
	}
	tresult PLUGIN_API getInt (AttrID id, int64& value) override
	{
		auto it = id ? values.find (id) : values.end ();
		if (it == values.end () || it->second.type != Value::kInt)
			return kResultFalse;
		value = it->second.i;
		return kResultTrue;
	}
	tresult PLUGIN_API setFloat (AttrID id, double value) override
	{
		if (!id)
			return kInvalidArgument;
		Value v;
		v.type = Value::kFloat;
		v.f = value;
		values[id] = std::move (v);
		return kResultTrue;
	}
	tresult PLUGIN_API getFloat (AttrID id, double& value) override
	{
		auto it = id ? values.find (id) : values.end ();
		if (it == values.end () || it->second.type != Value::kFloat)
			return kResultFalse;
		value = it->second.f;
		return kResultTrue;
	}
	tresult PLUGIN_API setString (AttrID id, const TChar* string) override
	{
		if (!id || !string)
			return kInvalidArgument;
		Value v;
		v.type = Value::kString;
		v.s = std::u16string (reinterpret_cast<const char16_t*> (string));
		values[id] = std::move (v);
		return kResultTrue;
	}
	tresult PLUGIN_API getString (AttrID id, TChar* string, uint32 sizeInBytes) override
	{
		auto it = id ? values.find (id) : values.end ();
		if (it == values.end () || it->second.type != Value::kString || !string || sizeInBytes < sizeof (TChar))
			return kResultFalse;
		size_t maxChars = sizeInBytes / sizeof (TChar);
		size_t n = std::min (it->second.s.size (), maxChars - 1);
		memcpy (string, it->second.s.data (), n * sizeof (TChar));
		string[n] = 0;
		return kResultTrue;
	}
	tresult PLUGIN_API setBinary (AttrID id, const void* data, uint32 sizeInBytes) override
	{
		if (!id || (!data && sizeInBytes))
			return kInvalidArgument;
		Value v;
		v.type = Value::kBinary;
		v.bin.assign ((const uint8_t*)data, (const uint8_t*)data + sizeInBytes);
		values[id] = std::move (v);
		return kResultTrue;
	}
	tresult PLUGIN_API getBinary (AttrID id, const void*& data, uint32& sizeInBytes) override
	{
		auto it = id ? values.find (id) : values.end ();
		if (it == values.end () || it->second.type != Value::kBinary)
			return kResultFalse;
		data = it->second.bin.data ();
		sizeInBytes = (uint32)it->second.bin.size ();
		return kResultTrue;
	}

	tresult PLUGIN_API queryInterface (const TUID _iid, void** obj) override
	{
		QI_ENTRY (IAttributeList)
		QI_UNKNOWN (IAttributeList)
		noteUnsupportedQuery ("IAttributeList", _iid);
		*obj = nullptr;
		return kNoInterface;
	}
	HOST_REFCOUNT
};
std::atomic<int> HostAttributeList::live {0};

//==============================================================================
// IMessage
//==============================================================================
class HostMessage final : public IMessage
{
public:
	static std::atomic<int> live;
	static std::atomic<int> created;
	HostMessage ()
	{
		++live;
		++created;
	}
	~HostMessage ()
	{
		--live;
		if (attrs)
			attrs->release ();
	}

	std::string id;
	HostAttributeList* attrs = nullptr;

	FIDString PLUGIN_API getMessageID () override { return id.empty () ? nullptr : id.c_str (); }
	void PLUGIN_API setMessageID (FIDString mid) override { id = mid ? mid : ""; }
	IAttributeList* PLUGIN_API getAttributes () override
	{
		if (!attrs)
			attrs = new HostAttributeList ();
		return attrs; // no addRef (same convention as the SDK's HostMessage)
	}

	tresult PLUGIN_API queryInterface (const TUID _iid, void** obj) override
	{
		QI_ENTRY (IMessage)
		QI_UNKNOWN (IMessage)
		noteUnsupportedQuery ("IMessage", _iid);
		*obj = nullptr;
		return kNoInterface;
	}
	HOST_REFCOUNT
};
std::atomic<int> HostMessage::live {0};
std::atomic<int> HostMessage::created {0};

//==============================================================================
// IHostApplication + IPlugInterfaceSupport (the "host context" given to initialize())
//==============================================================================
class HostApplication final : public IHostApplication, public IPlugInterfaceSupport
{
public:
	std::atomic<int> createInstanceCalls {0};
	bool refuseMessages = false; // test: behave like a host without IMessage/IAttributeList support

	tresult PLUGIN_API getName (String128 name) override
	{
		noteCallbackThread ("IHostApplication::getName");
		toS16 ("vst3host (Wavelet Synthesizer test host)", name, 128);
		return kResultTrue;
	}

	tresult PLUGIN_API createInstance (TUID cid, TUID _iid, void** obj) override
	{
		noteCallbackThread ("IHostApplication::createInstance");
		++createInstanceCalls;
		if (!obj)
			return kInvalidArgument;
		*obj = nullptr;
		if (refuseMessages)
			return kResultFalse;
		if (iidIs (cid, IMessage::iid) && iidIs (_iid, IMessage::iid))
		{
			*obj = static_cast<IMessage*> (new HostMessage ());
			return kResultTrue;
		}
		if (iidIs (cid, IAttributeList::iid) && iidIs (_iid, IAttributeList::iid))
		{
			*obj = static_cast<IAttributeList*> (new HostAttributeList ());
			return kResultTrue;
		}
		LOG ("  [host] IHostApplication::createInstance(%s, %s) -> not supported", iidName (cid).c_str (),
		     iidName (_iid).c_str ());
		return kResultFalse;
	}

	// Interfaces this host supports on the plug-in side (answers IPlugInterfaceSupport).
	tresult PLUGIN_API isPlugInterfaceSupported (const TUID _iid) override
	{
		static const FUID* supported[] = {&IComponent::iid,
		                                  &IAudioProcessor::iid,
		                                  &IEditController::iid,
		                                  &IConnectionPoint::iid,
		                                  &IUnitInfo::iid,
		                                  &IMidiMapping::iid,
		                                  &IPlugView::iid,
		                                  &IPlugViewContentScaleSupport::iid,
		                                  &IProcessContextRequirements::iid};
		for (auto* s : supported)
			if (iidIs (_iid, *s))
				return kResultTrue;
		return kResultFalse;
	}

	tresult PLUGIN_API queryInterface (const TUID _iid, void** obj) override
	{
		QI_ENTRY (IHostApplication)
		QI_ENTRY (IPlugInterfaceSupport)
		QI_UNKNOWN (IHostApplication)
		noteUnsupportedQuery ("IHostApplication", _iid);
		*obj = nullptr;
		return kNoInterface;
	}
	HOST_REFCOUNT
};

//==============================================================================
// IBStream + ISizeableStream over a byte vector (same semantics as the SDK MemoryStream)
//==============================================================================
class MemoryStream final : public IBStream, public ISizeableStream
{
public:
	std::vector<uint8_t> data;
	int64 pos = 0;
	int readPastEnd = 0; // reads that requested more bytes than available

	MemoryStream () = default;
	explicit MemoryStream (const std::vector<uint8_t>& d) : data (d) {}

	tresult PLUGIN_API read (void* buffer, int32 numBytes, int32* numBytesRead) override
	{
		if (numBytes < 0 || (!buffer && numBytes))
			return kInvalidArgument;
		int64 avail = std::max<int64> (0, (int64)data.size () - pos);
		int32 n = (int32)std::min<int64> (numBytes, avail);
		if (n < numBytes)
			readPastEnd++;
		if (n > 0)
			memcpy (buffer, data.data () + pos, (size_t)n);
		pos += n;
		if (numBytesRead)
			*numBytesRead = n;
		return kResultTrue;
	}
	tresult PLUGIN_API write (void* buffer, int32 numBytes, int32* numBytesWritten) override
	{
		if (numBytes < 0 || (!buffer && numBytes))
			return kInvalidArgument;
		if (pos + numBytes > (int64)data.size ())
			data.resize ((size_t)(pos + numBytes));
		if (numBytes)
			memcpy (data.data () + pos, buffer, (size_t)numBytes);
		pos += numBytes;
		if (numBytesWritten)
			*numBytesWritten = numBytes;
		return kResultTrue;
	}
	tresult PLUGIN_API seek (int64 p, int32 mode, int64* result) override
	{
		int64 np = mode == kIBSeekSet ? p : mode == kIBSeekCur ? pos + p : mode == kIBSeekEnd ? (int64)data.size () + p : -1;
		if (np < 0)
			return kInvalidArgument;
		pos = np;
		if (result)
			*result = pos;
		return kResultTrue;
	}
	tresult PLUGIN_API tell (int64* p) override
	{
		if (!p)
			return kInvalidArgument;
		*p = pos;
		return kResultTrue;
	}
	tresult PLUGIN_API getStreamSize (int64& size) override
	{
		size = (int64)data.size ();
		return kResultTrue;
	}
	tresult PLUGIN_API setStreamSize (int64 size) override
	{
		if (size < 0)
			return kInvalidArgument;
		data.resize ((size_t)size);
		return kResultTrue;
	}

	tresult PLUGIN_API queryInterface (const TUID _iid, void** obj) override
	{
		QI_ENTRY (IBStream)
		QI_ENTRY (ISizeableStream)
		QI_UNKNOWN (IBStream)
		noteUnsupportedQuery ("IBStream", _iid);
		*obj = nullptr;
		return kNoInterface;
	}
	HOST_REFCOUNT
};

//==============================================================================
// IComponentHandler (+2) + IUnitHandler: records every edit the plug-in reports,
// validates begin/perform/end protocol and queues values for the processor
// (a DAW forwards UI edits to the audio thread through inputParameterChanges).
//==============================================================================
class ComponentHandler final : public IComponentHandler, public IComponentHandler2, public IUnitHandler
{
public:
	struct Ev
	{
		char type; // 'b' beginEdit, 'p' performEdit, 'e' endEdit, 'r' restartComponent, 'd' setDirty
		ParamID id;
		double value;
		DWORD thread;
		double timeMs;
	};
	std::string label;
	std::function<std::string (ParamID)> nameOf; // param id -> title (for logs)
	std::recursive_mutex mx;
	std::vector<Ev> events;
	std::map<ParamID, int> openEdits;
	std::vector<std::string> violations;
	std::vector<std::pair<ParamID, double>> pending; // UI edits not yet sent to the processor
	int restartFlagsSeen = 0;
	bool verbose = true;
	int printed = 0;

	std::string pname (ParamID id) { return nameOf ? nameOf (id) : strf ("%u", id); }
	void print (const std::string& s)
	{
		if (!verbose)
			return;
		if (++printed <= 300)
			LOG ("  [handler%s] %s", label.c_str (), s.c_str ());
		else if (printed == 301)
			LOG ("  [handler%s] ... (further handler logs suppressed)", label.c_str ());
	}
	void addEv (char t, ParamID id, double v)
	{
		events.push_back ({t, id, v, GetCurrentThreadId (), nowMs ()});
	}

	tresult PLUGIN_API beginEdit (ParamID id) override
	{
		noteCallbackThread ("IComponentHandler::beginEdit");
		std::lock_guard<std::recursive_mutex> lk (mx);
		addEv ('b', id, 0);
		if (openEdits[id]++ > 0)
			violations.push_back (strf ("nested beginEdit for param %s", pname (id).c_str ()));
		print (strf ("beginEdit(%s)", pname (id).c_str ()));
		return kResultOk;
	}
	tresult PLUGIN_API performEdit (ParamID id, ParamValue v) override
	{
		noteCallbackThread ("IComponentHandler::performEdit");
		std::lock_guard<std::recursive_mutex> lk (mx);
		addEv ('p', id, v);
		if (openEdits[id] <= 0)
			violations.push_back (strf ("performEdit without beginEdit for param %s", pname (id).c_str ()));
		if (!(v >= 0.0 && v <= 1.0))
			violations.push_back (strf ("performEdit value out of [0,1] for param %s: %g", pname (id).c_str (), v));
		pending.emplace_back (id, v);
		print (strf ("performEdit(%s, %.6f)", pname (id).c_str (), v));
		return kResultOk;
	}
	tresult PLUGIN_API endEdit (ParamID id) override
	{
		noteCallbackThread ("IComponentHandler::endEdit");
		std::lock_guard<std::recursive_mutex> lk (mx);
		addEv ('e', id, 0);
		if (openEdits[id] <= 0)
			violations.push_back (strf ("endEdit without beginEdit for param %s", pname (id).c_str ()));
		else
			openEdits[id]--;
		print (strf ("endEdit(%s)", pname (id).c_str ()));
		return kResultOk;
	}
	tresult PLUGIN_API restartComponent (int32 flags) override
	{
		noteCallbackThread ("IComponentHandler::restartComponent");
		std::lock_guard<std::recursive_mutex> lk (mx);
		addEv ('r', 0, flags);
		restartFlagsSeen |= flags;
		std::string f;
		static const std::pair<int32, const char*> names[] = {
		    {kReloadComponent, "ReloadComponent"},   {kIoChanged, "IoChanged"},
		    {kParamValuesChanged, "ParamValuesChanged"}, {kLatencyChanged, "LatencyChanged"},
		    {kParamTitlesChanged, "ParamTitlesChanged"}, {kMidiCCAssignmentChanged, "MidiCCAssignmentChanged"},
		    {kNoteExpressionChanged, "NoteExpressionChanged"}, {kIoTitlesChanged, "IoTitlesChanged"},
		    {kPrefetchableSupportChanged, "PrefetchableSupportChanged"}, {kRoutingInfoChanged, "RoutingInfoChanged"},
		    {kKeyswitchChanged, "KeyswitchChanged"}, {kParamIDMappingChanged, "ParamIDMappingChanged"}};
		for (auto& n : names)
			if (flags & n.first)
				f += std::string (f.empty () ? "" : "|") + n.second;
		print (strf ("restartComponent(0x%X %s)", flags, f.c_str ()));
		return kResultOk;
	}
	// IComponentHandler2
	tresult PLUGIN_API setDirty (TBool state) override
	{
		noteCallbackThread ("IComponentHandler2::setDirty");
		std::lock_guard<std::recursive_mutex> lk (mx);
		addEv ('d', 0, state);
		return kResultOk;
	}
	tresult PLUGIN_API requestOpenEditor (FIDString name) override
	{
		noteCallbackThread ("IComponentHandler2::requestOpenEditor");
		print (strf ("requestOpenEditor(%s) -> ignored", name ? name : "null"));
		return kResultFalse;
	}
	tresult PLUGIN_API startGroupEdit () override { return kResultOk; }
	tresult PLUGIN_API finishGroupEdit () override { return kResultOk; }
	// IUnitHandler
	tresult PLUGIN_API notifyUnitSelection (UnitID unitId) override
	{
		print (strf ("notifyUnitSelection(%d)", unitId));
		return kResultOk;
	}
	tresult PLUGIN_API notifyProgramListChange (ProgramListID listId, int32 programIndex) override
	{
		print (strf ("notifyProgramListChange(%d, %d)", listId, programIndex));
		return kResultOk;
	}

	tresult PLUGIN_API queryInterface (const TUID _iid, void** obj) override
	{
		QI_ENTRY (IComponentHandler)
		QI_ENTRY (IComponentHandler2)
		QI_ENTRY (IUnitHandler)
		QI_UNKNOWN (IComponentHandler)
		noteUnsupportedQuery ("IComponentHandler", _iid);
		*obj = nullptr;
		return kNoInterface;
	}
	HOST_REFCOUNT

	// --- host-side helpers
	size_t mark ()
	{
		std::lock_guard<std::recursive_mutex> lk (mx);
		return events.size ();
	}
	std::vector<Ev> since (size_t m)
	{
		std::lock_guard<std::recursive_mutex> lk (mx);
		return std::vector<Ev> (events.begin () + (ptrdiff_t)std::min (m, events.size ()), events.end ());
	}
	template <class F>
	void drainPending (F&& f)
	{
		std::lock_guard<std::recursive_mutex> lk (mx);
		for (auto& p : pending)
			f (p.first, p.second);
		pending.clear ();
	}
};

//==============================================================================
// IParamValueQueue / IParameterChanges (preallocated: no allocation on the audio thread)
//==============================================================================
class ParamValueQueue final : public IParamValueQueue
{
public:
	struct Point
	{
		int32 offset;
		ParamValue value;
	};
	ParamID id = kNoParamId;
	std::vector<Point> points;
	ParamValueQueue () { points.reserve (1024); }

	ParamID PLUGIN_API getParameterId () override { return id; }
	int32 PLUGIN_API getPointCount () override { return (int32)points.size (); }
	tresult PLUGIN_API getPoint (int32 index, int32& sampleOffset, ParamValue& value) override
	{
		if (index < 0 || index >= (int32)points.size ())
			return kResultFalse;
		sampleOffset = points[(size_t)index].offset;
		value = points[(size_t)index].value;
		return kResultTrue;
	}
	tresult PLUGIN_API addPoint (int32 sampleOffset, ParamValue value, int32& index) override
	{
		// keep sorted by offset; replace a point at the same offset
		size_t i = 0;
		while (i < points.size () && points[i].offset < sampleOffset)
			i++;
		if (i < points.size () && points[i].offset == sampleOffset)
			points[i].value = value;
		else
		{
			if (points.size () >= points.capacity ())
				return kResultFalse;
			points.insert (points.begin () + (ptrdiff_t)i, {sampleOffset, value});
		}
		index = (int32)i;
		return kResultTrue;
	}
	tresult PLUGIN_API queryInterface (const TUID _iid, void** obj) override
	{
		QI_ENTRY (IParamValueQueue)
		QI_UNKNOWN (IParamValueQueue)
		*obj = nullptr;
		return kNoInterface;
	}
	// Owned by ParameterChanges: refcount is informational only.
	uint32 PLUGIN_API addRef () override { return 1; }
	uint32 PLUGIN_API release () override { return 1; }
};

class ParameterChanges final : public IParameterChanges
{
public:
	std::vector<std::unique_ptr<ParamValueQueue>> queues;
	int32 used = 0;
	ParameterChanges ()
	{
		for (int i = 0; i < 512; i++)
			queues.emplace_back (new ParamValueQueue ());
	}
	void clear ()
	{
		for (int32 i = 0; i < used; i++)
			queues[(size_t)i]->points.clear ();
		used = 0;
	}
	int32 PLUGIN_API getParameterCount () override { return used; }
	IParamValueQueue* PLUGIN_API getParameterData (int32 index) override
	{
		return (index >= 0 && index < used) ? queues[(size_t)index].get () : nullptr;
	}
	IParamValueQueue* PLUGIN_API addParameterData (const ParamID& id, int32& index) override
	{
		for (int32 i = 0; i < used; i++)
			if (queues[(size_t)i]->id == id)
			{
				index = i;
				return queues[(size_t)i].get ();
			}
		if (used >= (int32)queues.size ())
			return nullptr;
		auto* q = queues[(size_t)used].get ();
		q->id = id;
		q->points.clear ();
		index = used++;
		return q;
	}
	// host helper: append a point (host adds points in increasing offset order)
	void add (ParamID id, int32 offset, double value)
	{
		int32 idx = 0, pi = 0;
		if (auto* q = addParameterData (id, idx))
			q->addPoint (offset, value, pi);
	}
	tresult PLUGIN_API queryInterface (const TUID _iid, void** obj) override
	{
		QI_ENTRY (IParameterChanges)
		QI_UNKNOWN (IParameterChanges)
		*obj = nullptr;
		return kNoInterface;
	}
	uint32 PLUGIN_API addRef () override { return 1; }
	uint32 PLUGIN_API release () override { return 1; }
};

//==============================================================================
// IEventList
//==============================================================================
class EventList final : public IEventList
{
public:
	std::vector<Event> events;
	EventList () { events.reserve (4096); }
	void clear () { events.clear (); }
	int32 PLUGIN_API getEventCount () override { return (int32)events.size (); }
	tresult PLUGIN_API getEvent (int32 index, Event& e) override
	{
		if (index < 0 || index >= (int32)events.size ())
			return kResultFalse;
		e = events[(size_t)index];
		return kResultTrue;
	}
	tresult PLUGIN_API addEvent (Event& e) override
	{
		if (events.size () >= events.capacity ())
			return kResultFalse;
		events.push_back (e);
		return kResultTrue;
	}
	tresult PLUGIN_API queryInterface (const TUID _iid, void** obj) override
	{
		QI_ENTRY (IEventList)
		QI_UNKNOWN (IEventList)
		*obj = nullptr;
		return kNoInterface;
	}
	uint32 PLUGIN_API addRef () override { return 1; }
	uint32 PLUGIN_API release () override { return 1; }
};

//==============================================================================
// IPlugFrame: the plug-in asks the host to resize its editor window.
// Protocol: host resizes its window, then calls view->onSize(newSize).
//==============================================================================
static void setClientSize (HWND wnd, int w, int h)
{
	RECT wr, cr;
	GetWindowRect (wnd, &wr);
	GetClientRect (wnd, &cr);
	int dw = (wr.right - wr.left) - (cr.right - cr.left);
	int dh = (wr.bottom - wr.top) - (cr.bottom - cr.top);
	SetWindowPos (wnd, nullptr, 0, 0, w + dw, h + dh, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
}

class PlugFrame final : public IPlugFrame
{
public:
	HWND top = nullptr;       // top-level host window
	HWND container = nullptr; // child window passed to IPlugView::attached
	IPlugView* view = nullptr;
	int resizeCalls = 0;
	bool inResize = false;
	ViewRect lastRequest {};

	tresult PLUGIN_API resizeView (IPlugView* v, ViewRect* r) override
	{
		noteCallbackThread ("IPlugFrame::resizeView");
		resizeCalls++;
		if (!v || !r)
			return kInvalidArgument;
		lastRequest = *r;
		LOG ("  [frame] resizeView(%d x %d)%s", r->getWidth (), r->getHeight (),
		     v != view ? "  (WARNING: unexpected view pointer)" : "");
		if (top)
		{
			inResize = true;
			setClientSize (top, r->getWidth (), r->getHeight ());
			if (container)
				SetWindowPos (container, nullptr, 0, 0, r->getWidth (), r->getHeight (),
				              SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE);
			inResize = false;
		}
		ViewRect nr = *r;
		std::string err = tryCall ([&] { v->onSize (&nr); });
		if (!err.empty ())
			fail ("IPlugView::onSize (from resizeView) crashed", err);
		return kResultTrue;
	}
	tresult PLUGIN_API queryInterface (const TUID _iid, void** obj) override
	{
		QI_ENTRY (IPlugFrame)
		QI_UNKNOWN (IPlugFrame)
		noteUnsupportedQuery ("IPlugFrame", _iid);
		*obj = nullptr;
		return kNoInterface;
	}
	HOST_REFCOUNT
};
