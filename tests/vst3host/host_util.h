// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// host_util.h - utilities for vst3host (logging, check bookkeeping, crash/hang
// protection, WAV writing, signal analysis, PE inspection).
//
// Header-only and included by host.cpp only (single translation unit), so the
// functions are simply `static`.
#pragma once

//==============================================================================
// Time
//==============================================================================
static double nowUs()
{
	static const double freq = [] {
		LARGE_INTEGER f;
		QueryPerformanceFrequency (&f);
		return (double)f.QuadPart;
	}();
	LARGE_INTEGER c;
	QueryPerformanceCounter (&c);
	return (double)c.QuadPart * 1e6 / freq;
}
static double nowMs () { return nowUs () / 1000.0; }

//==============================================================================
// Strings
//==============================================================================
static std::string strf (const char* fmt, ...)
{
	va_list ap;
	va_start (ap, fmt);
	va_list ap2;
	va_copy (ap2, ap);
	int n = vsnprintf (nullptr, 0, fmt, ap);
	va_end (ap);
	std::vector<char> buf (n > 0 ? (size_t)n + 1 : 1, '\0');
	if (n > 0)
		vsnprintf (buf.data (), buf.size (), fmt, ap2);
	va_end (ap2);
	return std::string (buf.data ());
}

static std::string w2u (const std::wstring& w)
{
	if (w.empty ())
		return {};
	int n = WideCharToMultiByte (CP_UTF8, 0, w.data (), (int)w.size (), nullptr, 0, nullptr, nullptr);
	std::string s ((size_t)n, '\0');
	WideCharToMultiByte (CP_UTF8, 0, w.data (), (int)w.size (), &s[0], n, nullptr, nullptr);
	return s;
}

static std::wstring u2w (const std::string& s)
{
	if (s.empty ())
		return {};
	int n = MultiByteToWideChar (CP_UTF8, 0, s.data (), (int)s.size (), nullptr, 0);
	std::wstring w ((size_t)n, L'\0');
	MultiByteToWideChar (CP_UTF8, 0, s.data (), (int)s.size (), &w[0], n);
	return w;
}

// VST3 strings are UTF-16 (char16 == char16_t, same size as wchar_t on Windows).
static std::string s16 (const Steinberg::char16* s, int maxLen = 128)
{
	if (!s)
		return "(null)";
	int n = 0;
	while (n < maxLen && s[n])
		n++;
	return w2u (std::wstring (reinterpret_cast<const wchar_t*> (s), (size_t)n));
}

static void toS16 (const std::string& u, Steinberg::char16* dst, int maxLen)
{
	std::wstring w = u2w (u);
	int n = (int)std::min<size_t> (w.size (), (size_t)maxLen - 1);
	memcpy (dst, w.data (), (size_t)n * sizeof (wchar_t));
	dst[n] = 0;
}

static std::string lower (std::string s)
{
	for (auto& c : s)
		c = (char)tolower ((unsigned char)c);
	return s;
}

static std::string baseName (const std::string& path)
{
	size_t p = path.find_last_of ("/\\");
	return p == std::string::npos ? path : path.substr (p + 1);
}

static bool fileExists (const std::wstring& p)
{
	DWORD a = GetFileAttributesW (p.c_str ());
	return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

static bool dirExists (const std::wstring& p)
{
	DWORD a = GetFileAttributesW (p.c_str ());
	return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}

static bool makeDirs (const std::wstring& path)
{
	if (path.empty () || dirExists (path))
		return true;
	size_t p = path.find_last_of (L"/\\");
	if (p != std::wstring::npos && p > 2)
		makeDirs (path.substr (0, p));
	return CreateDirectoryW (path.c_str (), nullptr) || GetLastError () == ERROR_ALREADY_EXISTS;
}

static std::string winErr (DWORD e)
{
	wchar_t* msg = nullptr;
	FormatMessageW (FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
	                nullptr, e, 0, (LPWSTR)&msg, 0, nullptr);
	std::string s = msg ? w2u (msg) : std::string ();
	if (msg)
		LocalFree (msg);
	while (!s.empty () && (s.back () == '\n' || s.back () == '\r' || s.back () == ' '))
		s.pop_back ();
	return strf ("error %lu (%s)", (unsigned long)e, s.c_str ());
}

//==============================================================================
// Logging and check bookkeeping
//==============================================================================
static FILE* g_report = nullptr;              // <outdir>/report.txt
static std::recursive_timed_mutex g_logMutex; // console + report
static std::wstring g_outDir;

static void logLine (const std::string& s)
{
	// try_lock_for: a crash/watchdog path must never deadlock on the log lock.
	bool locked = g_logMutex.try_lock_for (std::chrono::milliseconds (500));
	fputs (s.c_str (), stdout);
	fputc ('\n', stdout);
	fflush (stdout);
	if (g_report)
	{
		fputs (s.c_str (), g_report);
		fputc ('\n', g_report);
		fflush (g_report);
	}
	if (locked)
		g_logMutex.unlock ();
}
#define LOG(...) logLine (strf (__VA_ARGS__))

enum class Sev
{
	Pass,
	Warn,
	Fail
};
struct CheckResult
{
	Sev sev;
	std::string section, name, detail;
};
static std::vector<CheckResult> g_results;
static std::mutex g_resultsMutex;
static std::string g_section = "startup";

static void record (Sev s, const std::string& name, const std::string& detail = {})
{
	{
		std::lock_guard<std::mutex> lk (g_resultsMutex);
		g_results.push_back ({s, g_section, name, detail});
	}
	const char* tag = s == Sev::Pass ? "PASS" : s == Sev::Warn ? "WARN" : "FAIL";
	logLine (strf ("  [%s] %s%s%s", tag, name.c_str (), detail.empty () ? "" : "  -- ", detail.c_str ()));
}

// Records PASS when ok, otherwise `failSev` (FAIL by default). Returns ok.
static bool check (bool ok, const std::string& name, const std::string& detail = {}, Sev failSev = Sev::Fail)
{
	record (ok ? Sev::Pass : failSev, name, detail);
	return ok;
}
static void warn (const std::string& name, const std::string& detail = {}) { record (Sev::Warn, name, detail); }
static void fail (const std::string& name, const std::string& detail = {}) { record (Sev::Fail, name, detail); }
static void pass (const std::string& name, const std::string& detail = {}) { record (Sev::Pass, name, detail); }

//==============================================================================
// Step tracking, heartbeat (for the hang watchdog) and summary
//==============================================================================
static char g_step[256] = "startup";
static std::atomic<double> g_heartbeat {0.0};
static std::atomic<double> g_timeoutMs {90000.0};
static std::atomic<bool> g_summaryWritten {false};
static std::string g_pluginPathForSummary;

static void beat () { g_heartbeat.store (nowMs ()); }
static void setStep (const std::string& s)
{
	snprintf (g_step, sizeof g_step, "%s", s.c_str ());
	beat ();
}

static void beginSection (const char* name)
{
	g_section = name;
	LOG ("");
	LOG ("=== %s ===", name);
	setStep (name);
}

// Writes the final PASS/WARN/FAIL summary. Returns the number of failures.
static int writeSummary (const char* abortReason = nullptr)
{
	if (g_summaryWritten.exchange (true))
		return 1;
	std::vector<CheckResult> res;
	{
		// copy without blocking forever (may be called from a crash handler)
		if (g_resultsMutex.try_lock ())
		{
			res = g_results;
			g_resultsMutex.unlock ();
		}
		else
			res = g_results;
	}
	int nPass = 0, nWarn = 0, nFail = 0;
	for (auto& r : res)
		(r.sev == Sev::Pass ? nPass : r.sev == Sev::Warn ? nWarn : nFail)++;
	LOG ("");
	LOG ("==================================== SUMMARY ====================================");
	LOG ("Plugin : %s", g_pluginPathForSummary.c_str ());
	if (abortReason)
		LOG ("RUN ABORTED: %s (during step: %s)", abortReason, g_step);
	LOG ("Checks : %d PASS, %d WARN, %d FAIL", nPass, nWarn, nFail);
	if (nFail)
	{
		LOG ("FAILURES:");
		for (auto& r : res)
			if (r.sev == Sev::Fail)
				LOG ("  - [%s] %s%s%s", r.section.c_str (), r.name.c_str (), r.detail.empty () ? "" : "  -- ",
				     r.detail.c_str ());
	}
	if (nWarn)
	{
		LOG ("WARNINGS:");
		for (auto& r : res)
			if (r.sev == Sev::Warn)
				LOG ("  - [%s] %s%s%s", r.section.c_str (), r.name.c_str (), r.detail.empty () ? "" : "  -- ",
				     r.detail.c_str ());
	}
	LOG ("RESULT: %s", (nFail || abortReason) ? "FAIL" : "PASS");
	return nFail + (abortReason ? 1 : 0);
}

//==============================================================================
// Crash protection
//==============================================================================
static const char* exceptionName (DWORD code)
{
	switch (code)
	{
		case EXCEPTION_ACCESS_VIOLATION: return "ACCESS_VIOLATION";
		case EXCEPTION_INT_DIVIDE_BY_ZERO: return "INT_DIVIDE_BY_ZERO";
		case EXCEPTION_STACK_OVERFLOW: return "STACK_OVERFLOW";
		case EXCEPTION_ILLEGAL_INSTRUCTION: return "ILLEGAL_INSTRUCTION";
		case EXCEPTION_BREAKPOINT: return "BREAKPOINT (assert/debugbreak)";
		case EXCEPTION_ARRAY_BOUNDS_EXCEEDED: return "ARRAY_BOUNDS_EXCEEDED";
		case EXCEPTION_FLT_DIVIDE_BY_ZERO: return "FLT_DIVIDE_BY_ZERO";
		case EXCEPTION_FLT_INVALID_OPERATION: return "FLT_INVALID_OPERATION";
		case EXCEPTION_PRIV_INSTRUCTION: return "PRIV_INSTRUCTION";
		case EXCEPTION_IN_PAGE_ERROR: return "IN_PAGE_ERROR";
		case 0xC0000409: return "STACK_BUFFER_OVERRUN/FAST_FAIL";
		case 0xC0000374: return "HEAP_CORRUPTION";
		case 0x20474343: return "C++ exception (mingw)";
		case 0xE06D7363: return "C++ exception (msvc)";
		default: return "exception";
	}
}

static std::string describeAddress (void* addr)
{
	HMODULE m = nullptr;
	if (GetModuleHandleExW (GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
	                        (LPCWSTR)addr, &m) &&
	    m)
	{
		wchar_t name[MAX_PATH] = {};
		GetModuleFileNameW (m, name, MAX_PATH);
		return strf ("%s+0x%llX", baseName (w2u (name)).c_str (),
		             (unsigned long long)((uintptr_t)addr - (uintptr_t)m));
	}
	return strf ("%p (no module)", addr);
}

struct SehInfo
{
	DWORD code = 0;
	void* addr = nullptr;
};

static int sehFilter (EXCEPTION_POINTERS* ep, SehInfo* info)
{
	info->code = ep->ExceptionRecord->ExceptionCode;
	info->addr = ep->ExceptionRecord->ExceptionAddress;
	// Let C++ exceptions propagate to the surrounding try/catch (keeps the message).
	if (info->code == 0x20474343 || info->code == 0xE06D7363)
		return EXCEPTION_CONTINUE_SEARCH;
	// Debug output / thread naming "exceptions" are not crashes.
	if (info->code == 0x406D1388 || info->code == DBG_PRINTEXCEPTION_C || info->code == 0x4001000A)
		return EXCEPTION_CONTINUE_EXECUTION;
	return EXCEPTION_EXECUTE_HANDLER;
}

// No C++ objects with destructors in this function (SEH restriction).
static bool sehInvoke (void (*fn) (void*), void* ctx, SehInfo* info)
{
	__try
	{
		fn (ctx);
		return true;
	}
	__except (sehFilter (GetExceptionInformation (), info))
	{
		return false;
	}
}

// Runs f() catching both SEH crashes (access violations, ...) and C++ exceptions.
// Returns "" on success or a description of the crash.
template <class F>
static std::string tryCall (F&& f)
{
	SehInfo info;
	try
	{
		if (sehInvoke ([] (void* p) { (*static_cast<std::remove_reference_t<F>*> (p)) (); }, (void*)&f, &info))
			return {};
		return strf ("crashed with %s (0x%08lX) at %s", exceptionName (info.code), (unsigned long)info.code,
		             describeAddress (info.addr).c_str ());
	}
	catch (const std::exception& e)
	{
		return strf ("threw C++ exception: %s", e.what ());
	}
	catch (...)
	{
		return "threw an unknown C++ exception";
	}
}

// Like tryCall, but records a FAIL entry named after `what` when it crashes.
template <class F>
static bool guarded (const std::string& what, F&& f)
{
	setStep (what);
	std::string err = tryCall (std::forward<F> (f));
	beat ();
	if (err.empty ())
		return true;
	fail (what + " crashed", err);
	return false;
}

static void writeMinidump (EXCEPTION_POINTERS* ep, const wchar_t* fileName)
{
	if (g_outDir.empty ())
		return;
	std::wstring path = g_outDir + L"\\" + fileName;
	HANDLE f = CreateFileW (path.c_str (), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
	if (f == INVALID_HANDLE_VALUE)
		return;
	MINIDUMP_EXCEPTION_INFORMATION mei {};
	mei.ThreadId = GetCurrentThreadId ();
	mei.ExceptionPointers = ep;
	mei.ClientPointers = FALSE;
	MiniDumpWriteDump (GetCurrentProcess (), GetCurrentProcessId (), f,
	                   (MINIDUMP_TYPE)(MiniDumpWithThreadInfo | MiniDumpWithIndirectlyReferencedMemory),
	                   ep ? &mei : nullptr, nullptr, nullptr);
	CloseHandle (f);
	LOG ("  minidump written: %s", w2u (path).c_str ());
}

static LONG WINAPI unhandledCrashFilter (EXCEPTION_POINTERS* ep)
{
	DWORD code = ep->ExceptionRecord->ExceptionCode;
	fail ("unhandled crash (process cannot continue)",
	      strf ("%s (0x%08lX) at %s on thread %lu", exceptionName (code), (unsigned long)code,
	            describeAddress (ep->ExceptionRecord->ExceptionAddress).c_str (), GetCurrentThreadId ()));
	writeMinidump (ep, L"crash.dmp");
	writeSummary ("unhandled crash");
	if (g_report)
		fflush (g_report);
	TerminateProcess (GetCurrentProcess (), 3);
	return EXCEPTION_EXECUTE_HANDLER;
}

static void abortSignalHandler (int)
{
	fail ("abort() called", "the plugin (or the C runtime) called abort()/std::terminate (e.g. an uncaught "
	                         "exception or failed assert)");
	writeSummary ("abort()");
	if (g_report)
		fflush (g_report);
	_exit (3);
}

// Watchdog: if no heartbeat for g_timeoutMs, the plugin is considered hung.
static std::atomic<bool> g_watchdogRun {true};
static void watchdogThread ()
{
	while (g_watchdogRun.load ())
	{
		Sleep (250);
		double hb = g_heartbeat.load ();
		if (hb > 0 && nowMs () - hb > g_timeoutMs.load ())
		{
			fail ("hang detected", strf ("no progress for %.0f s during step '%s'", g_timeoutMs.load () / 1000.0, g_step));
			writeMinidump (nullptr, L"hang.dmp");
			writeSummary ("hang (watchdog timeout)");
			if (g_report)
				fflush (g_report);
			TerminateProcess (GetCurrentProcess (), 4);
		}
	}
}

//==============================================================================
// WAV writer (32-bit float stereo, WAVE_FORMAT_IEEE_FLOAT)
//==============================================================================
static bool writeWavFloatStereo (const std::wstring& path, const std::vector<float>& L, const std::vector<float>& R,
                                 int sampleRate)
{
	FILE* f = _wfopen (path.c_str (), L"wb");
	if (!f)
		return false;
	const uint32_t frames = (uint32_t)std::min (L.size (), R.size ());
	const uint32_t dataBytes = frames * 8;
	auto u32 = [&] (uint32_t v) { fwrite (&v, 4, 1, f); };
	auto u16 = [&] (uint16_t v) { fwrite (&v, 2, 1, f); };
	fwrite ("RIFF", 1, 4, f);
	u32 (4 + (8 + 18) + (8 + 4) + (8 + dataBytes));
	fwrite ("WAVE", 1, 4, f);
	fwrite ("fmt ", 1, 4, f);
	u32 (18);
	u16 (3);                       // WAVE_FORMAT_IEEE_FLOAT
	u16 (2);                       // channels
	u32 ((uint32_t)sampleRate);    // sample rate
	u32 ((uint32_t)sampleRate * 8); // byte rate
	u16 (8);                       // block align
	u16 (32);                      // bits per sample
	u16 (0);                       // cbSize
	fwrite ("fact", 1, 4, f);
	u32 (4);
	u32 (frames);
	fwrite ("data", 1, 4, f);
	u32 (dataBytes);
	std::vector<float> inter ((size_t)frames * 2);
	for (uint32_t i = 0; i < frames; i++)
	{
		inter[2 * i] = L[i];
		inter[2 * i + 1] = R[i];
	}
	fwrite (inter.data (), 4, inter.size (), f);
	fclose (f);
	return true;
}

//==============================================================================
// Signal analysis
//==============================================================================
static double dbfs (double x) { return 20.0 * std::log10 (std::max (x, 1e-12)); }

struct SegStats
{
	double peak = 0, rms = 0, dcL = 0, dcR = 0;
};

static SegStats segStats (const std::vector<float>& L, const std::vector<float>& R, int64_t from, int64_t to)
{
	SegStats s;
	from = std::max<int64_t> (0, from);
	to = std::min<int64_t> ((int64_t)L.size (), to);
	if (to <= from)
		return s;
	double sum2 = 0, sL = 0, sR = 0;
	for (int64_t i = from; i < to; i++)
	{
		double l = L[(size_t)i], r = R[(size_t)i];
		s.peak = std::max (s.peak, std::max (std::fabs (l), std::fabs (r)));
		sum2 += l * l + r * r;
		sL += l;
		sR += r;
	}
	double n = (double)(to - from);
	s.rms = std::sqrt (sum2 / (2 * n));
	s.dcL = sL / n;
	s.dcR = sR / n;
	return s;
}

// RMS envelope in dBFS over windows of `win` samples.
static std::vector<double> envelopeDb (const std::vector<float>& L, const std::vector<float>& R, int win)
{
	std::vector<double> env;
	for (size_t i = 0; i + (size_t)win <= L.size (); i += (size_t)win)
		env.push_back (dbfs (segStats (L, R, (int64_t)i, (int64_t)(i + win)).rms));
	return env;
}

struct Comparison
{
	double maxAbsDiff = 0;     // max |a-b| sample-wise
	double maxEnvDiffDb = 0;   // max RMS-envelope difference (10 ms windows above -60 dBFS)
	double rmsDiffDb = -240;   // RMS of the difference signal (dBFS)
	int64_t firstDiff = -1;    // first sample index where |a-b| > 1e-6 (-1: none)
};

static Comparison compareAudio (const std::vector<float>& aL, const std::vector<float>& aR, const std::vector<float>& bL,
                                const std::vector<float>& bR, int sampleRate)
{
	Comparison c;
	size_t n = std::min (aL.size (), bL.size ());
	double sum2 = 0;
	for (size_t i = 0; i < n; i++)
	{
		double dl = (double)aL[i] - bL[i], dr = (double)aR[i] - bR[i];
		c.maxAbsDiff = std::max (c.maxAbsDiff, std::max (std::fabs (dl), std::fabs (dr)));
		if (c.firstDiff < 0 && (std::fabs (dl) > 1e-6 || std::fabs (dr) > 1e-6))
			c.firstDiff = (int64_t)i;
		sum2 += dl * dl + dr * dr;
	}
	if (n)
		c.rmsDiffDb = dbfs (std::sqrt (sum2 / (2.0 * n)));
	int win = std::max (1, sampleRate / 100);
	auto ea = envelopeDb (aL, aR, win), eb = envelopeDb (bL, bR, win);
	for (size_t i = 0; i < std::min (ea.size (), eb.size ()); i++)
		if (ea[i] > -60 || eb[i] > -60)
			c.maxEnvDiffDb = std::max (c.maxEnvDiffDb, std::fabs (std::max (ea[i], -80.0) - std::max (eb[i], -80.0)));
	return c;
}

// First sample index >= from where |x| exceeds thr (or -1).
static int64_t firstAbove (const std::vector<float>& L, const std::vector<float>& R, int64_t from, double thr)
{
	for (int64_t i = std::max<int64_t> (0, from); i < (int64_t)L.size (); i++)
		if (std::fabs (L[(size_t)i]) > thr || std::fabs (R[(size_t)i]) > thr)
			return i;
	return -1;
}

// Fundamental frequency estimate by normalized autocorrelation (mono sum).
// Returns 0 when no clear periodicity is found.
static double estimatePitchHz (const std::vector<float>& L, const std::vector<float>& R, int64_t from, int64_t len,
                               double sr, double* clarity = nullptr)
{
	if (from < 0 || from + len > (int64_t)L.size () || len < 64)
		return 0;
	std::vector<double> x ((size_t)len);
	for (int64_t i = 0; i < len; i++)
		x[(size_t)i] = 0.5 * ((double)L[(size_t)(from + i)] + R[(size_t)(from + i)]);
	int minLag = std::max (2, (int)(sr / 2000.0)), maxLag = std::min ((int)(len / 2), (int)(sr / 40.0));
	int n = (int)len - maxLag;
	if (n <= 0)
		return 0;
	auto ac = [&] (int lag) {
		double s = 0, e0 = 0, e1 = 0;
		for (int i = 0; i < n; i++)
		{
			s += x[(size_t)i] * x[(size_t)(i + lag)];
			e0 += x[(size_t)i] * x[(size_t)i];
			e1 += x[(size_t)(i + lag)] * x[(size_t)(i + lag)];
		}
		return (e0 > 0 && e1 > 0) ? s / std::sqrt (e0 * e1) : 0.0;
	};
	std::vector<double> r ((size_t)maxLag + 2, 0.0);
	double best = 0;
	for (int lag = minLag; lag <= maxLag + 1; lag++)
	{
		r[(size_t)lag] = ac (lag);
		if (lag <= maxLag)
			best = std::max (best, r[(size_t)lag]);
	}
	if (best < 0.5)
		return 0;
	// first local maximum that reaches 90% of the global maximum (avoids octave errors)
	for (int lag = minLag + 1; lag <= maxLag; lag++)
	{
		if (r[(size_t)lag] >= 0.9 * best && r[(size_t)lag] >= r[(size_t)lag - 1] && r[(size_t)lag] >= r[(size_t)lag + 1])
		{
			double a = r[(size_t)lag - 1], b = r[(size_t)lag], c = r[(size_t)lag + 1];
			double denom = a - 2 * b + c;
			double off = std::fabs (denom) > 1e-12 ? 0.5 * (a - c) / denom : 0.0;
			if (clarity)
				*clarity = b;
			return sr / (lag + off);
		}
	}
	return 0;
}

//==============================================================================
// PE inspection (imports / exports / machine) of the plugin DLL
//==============================================================================
struct PeInfo
{
	bool ok = false;
	std::string error;
	uint16_t machine = 0;
	bool isDll = false;
	std::vector<std::string> imports;      // normal imports
	std::vector<std::string> delayImports; // delay-loaded imports
	std::vector<std::string> exports;
};

static PeInfo inspectPe (const std::wstring& path)
{
	PeInfo pe;
	FILE* f = _wfopen (path.c_str (), L"rb");
	if (!f)
	{
		pe.error = "cannot open file";
		return pe;
	}
	std::vector<uint8_t> d;
	fseek (f, 0, SEEK_END);
	long sz = ftell (f);
	fseek (f, 0, SEEK_SET);
	if (sz > 0)
	{
		d.resize ((size_t)sz);
		if (fread (d.data (), 1, d.size (), f) != d.size ())
			d.clear ();
	}
	fclose (f);
	auto in = [&] (size_t off, size_t len) { return off + len <= d.size () && off + len >= off; };
	if (!in (0, sizeof (IMAGE_DOS_HEADER)))
	{
		pe.error = "file too small";
		return pe;
	}
	auto dos = (const IMAGE_DOS_HEADER*)d.data ();
	if (dos->e_magic != IMAGE_DOS_SIGNATURE || !in ((size_t)dos->e_lfanew, sizeof (IMAGE_NT_HEADERS64)))
	{
		pe.error = "not a PE file (no MZ header)";
		return pe;
	}
	auto nt = (const IMAGE_NT_HEADERS64*)(d.data () + dos->e_lfanew);
	if (nt->Signature != IMAGE_NT_SIGNATURE)
	{
		pe.error = "bad PE signature";
		return pe;
	}
	pe.machine = nt->FileHeader.Machine;
	pe.isDll = (nt->FileHeader.Characteristics & IMAGE_FILE_DLL) != 0;
	if (nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR64_MAGIC)
	{
		pe.error = "not a 64-bit (PE32+) image";
		pe.ok = true; // still report machine
		return pe;
	}
	auto sec = IMAGE_FIRST_SECTION (nt);
	int nsec = nt->FileHeader.NumberOfSections;
	if (!in ((size_t)((const uint8_t*)sec - d.data ()), (size_t)nsec * sizeof (IMAGE_SECTION_HEADER)))
	{
		pe.error = "bad section table";
		return pe;
	}
	auto rva2off = [&] (uint32_t rva) -> size_t {
		for (int i = 0; i < nsec; i++)
		{
			uint32_t va = sec[i].VirtualAddress, vs = std::max (sec[i].Misc.VirtualSize, sec[i].SizeOfRawData);
			if (rva >= va && rva < va + vs)
				return (size_t)(rva - va + sec[i].PointerToRawData);
		}
		return (size_t)-1;
	};
	auto cstr = [&] (uint32_t rva) -> std::string {
		size_t o = rva2off (rva);
		if (o == (size_t)-1 || o >= d.size ())
			return "?";
		std::string s;
		while (o < d.size () && d[o] && s.size () < 512)
			s += (char)d[o++];
		return s;
	};
	const auto& dd = nt->OptionalHeader.DataDirectory;
	// imports
	if (dd[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress)
	{
		size_t o = rva2off (dd[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress);
		while (o != (size_t)-1 && in (o, sizeof (IMAGE_IMPORT_DESCRIPTOR)))
		{
			auto imp = (const IMAGE_IMPORT_DESCRIPTOR*)(d.data () + o);
			if (!imp->Name)
				break;
			pe.imports.push_back (cstr (imp->Name));
			o += sizeof (IMAGE_IMPORT_DESCRIPTOR);
		}
	}
	// delay imports
	if (dd[IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT].VirtualAddress)
	{
		size_t o = rva2off (dd[IMAGE_DIRECTORY_ENTRY_DELAY_IMPORT].VirtualAddress);
		while (o != (size_t)-1 && in (o, sizeof (IMAGE_DELAYLOAD_DESCRIPTOR)))
		{
			auto imp = (const IMAGE_DELAYLOAD_DESCRIPTOR*)(d.data () + o);
			if (!imp->DllNameRVA)
				break;
			pe.delayImports.push_back (cstr (imp->DllNameRVA));
			o += sizeof (IMAGE_DELAYLOAD_DESCRIPTOR);
		}
	}
	// exports
	if (dd[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress)
	{
		size_t o = rva2off (dd[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress);
		if (o != (size_t)-1 && in (o, sizeof (IMAGE_EXPORT_DIRECTORY)))
		{
			auto ex = (const IMAGE_EXPORT_DIRECTORY*)(d.data () + o);
			size_t no = rva2off (ex->AddressOfNames);
			for (DWORD i = 0; no != (size_t)-1 && i < ex->NumberOfNames && in (no + i * 4, 4); i++)
				pe.exports.push_back (cstr (*(const uint32_t*)(d.data () + no + i * 4)));
		}
	}
	pe.ok = true;
	return pe;
}

// Where would Windows find this dependency on an end-user machine running a DAW?
//  0 = system (System32 / API set), 1 = only next to the plugin DLL, 2 = missing
static int classifyDependency (const std::string& dll, const std::wstring& pluginDir, std::string& why)
{
	std::string l = lower (dll);
	if (l.rfind ("api-ms-win-", 0) == 0 || l.rfind ("ext-ms-", 0) == 0)
	{
		why = "system (API set)";
		return 0;
	}
	if (l.rfind ("vcruntime", 0) == 0 || l.rfind ("msvcp", 0) == 0 || l.rfind ("concrt", 0) == 0)
	{
		why = "Visual C++ redistributable (not guaranteed on user machines)";
		return 1;
	}
	wchar_t sys[MAX_PATH] = {};
	GetSystemDirectoryW (sys, MAX_PATH);
	if (fileExists (std::wstring (sys) + L"\\" + u2w (dll)))
	{
		why = "system (System32)";
		return 0;
	}
	if (fileExists (pluginDir + L"\\" + u2w (dll)))
	{
		why = "only next to the plugin DLL (a DAW's LoadLibrary will NOT search there)";
		return 1;
	}
	why = "NOT a system DLL - missing on a clean machine (link it statically, e.g. -static)";
	return 2;
}
