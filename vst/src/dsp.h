// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Okto MultiWave Synth — created by Pierre Arnaud GUYOT (OktoPierre); based on his Wavelet Synthesizer (beta 0.7).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// DSP core (C++ port of web/js/core.js, same algorithm 1:1).
#pragma once
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include "generated/spec.h"
// CPU optimisations (CLAUDE.md "CPU optimisations", Revue_CPU.md): SSE2 (x86) and, since version 1.0.7, NEON (Apple silicon) do the same double-precision operations as the scalar code,
// lane by lane, so the output is bit-identical; without either (other platforms, or -DWS_NO_NEON, which the macOS workflow uses to prove it) the scalar form is used.
// No FMA, no fast-math, no reassociation anywhere.
#if defined(__clang__)
#pragma STDC FP_CONTRACT OFF
#endif
#if defined(__SSE2__)
#include <emmintrin.h>
#define WS_V2 1
#elif defined(__aarch64__) && defined(__ARM_NEON) && !defined(WS_NO_NEON)
#include <arm_neon.h>
#define WS_V2 1
#endif
// The kernels that use the layer. On Apple silicon each can be left out (-DWS_NO_NEON_BAND, -DWS_NO_NEON_FILTER, -DWS_NO_NEON_REVERB) to measure what it is worth there.
#if defined(WS_V2)
#if defined(__SSE2__) || !defined(WS_NO_NEON_BAND)
#define WS_V2_BAND 1
#endif
#if defined(__SSE2__) || !defined(WS_NO_NEON_FILTER)
#define WS_V2_FILTER 1
#endif
#if defined(__SSE2__) || !defined(WS_NO_NEON_REVERB)
#define WS_V2_REVERB 1
#endif
#endif

namespace ws {

#if defined(WS_V2)
// Two doubles in one register, the operations the kernels use: each one is one instruction on both platforms, with the same result (no fused multiply-add: v2_mul and v2_add stay two
// operations; the compiler is told not to contract them). v2_min / v2_max keep a NaN as it is (SSE2 returns its second operand, NEON the NaN: the same value for the clamp the kernels make).
#if defined(__SSE2__)
using v2d = __m128d;
inline v2d v2_set1(double x) { return _mm_set1_pd(x); }
inline v2d v2_set(double hi, double lo) { return _mm_set_pd(hi, lo); }                       // lane 0 = lo, lane 1 = hi
inline v2d v2_load(const double* p) { return _mm_load_pd(p); }                              // 16-byte aligned
inline v2d v2_loadu(const double* p) { return _mm_loadu_pd(p); }
inline void v2_store(double* p, v2d v) { _mm_store_pd(p, v); }                              // 16-byte aligned
inline void v2_storeu(double* p, v2d v) { _mm_storeu_pd(p, v); }
inline v2d v2_add(v2d a, v2d b) { return _mm_add_pd(a, b); }
inline v2d v2_sub(v2d a, v2d b) { return _mm_sub_pd(a, b); }
inline v2d v2_mul(v2d a, v2d b) { return _mm_mul_pd(a, b); }
inline v2d v2_div(v2d a, v2d b) { return _mm_div_pd(a, b); }
inline v2d v2_min(v2d a, v2d b) { return _mm_min_pd(a, b); }
inline v2d v2_max(v2d a, v2d b) { return _mm_max_pd(a, b); }
inline v2d v2_cvt(const float* p) { return _mm_cvtps_pd(_mm_castsi128_ps(_mm_loadl_epi64((const __m128i*)p))); }   // the two floats at p, as doubles
inline void v2_f32(v2d v, float& lo, float& hi) { const __m128 r = _mm_cvtpd_ps(v); lo = _mm_cvtss_f32(r); hi = _mm_cvtss_f32(_mm_shuffle_ps(r, r, 1)); }   // each lane rounded to a float
inline double v2_lo(v2d v) { return _mm_cvtsd_f64(v); }
inline double v2_hi(v2d v) { return _mm_cvtsd_f64(_mm_unpackhi_pd(v, v)); }
#else
using v2d = float64x2_t;
inline v2d v2_set1(double x) { return vdupq_n_f64(x); }
inline v2d v2_set(double hi, double lo) { return vsetq_lane_f64(hi, vdupq_n_f64(lo), 1); }
inline v2d v2_load(const double* p) { return vld1q_f64(p); }
inline v2d v2_loadu(const double* p) { return vld1q_f64(p); }
inline void v2_store(double* p, v2d v) { vst1q_f64(p, v); }
inline void v2_storeu(double* p, v2d v) { vst1q_f64(p, v); }
inline v2d v2_add(v2d a, v2d b) { return vaddq_f64(a, b); }
inline v2d v2_sub(v2d a, v2d b) { return vsubq_f64(a, b); }
inline v2d v2_mul(v2d a, v2d b) { return vmulq_f64(a, b); }
inline v2d v2_div(v2d a, v2d b) { return vdivq_f64(a, b); }
inline v2d v2_min(v2d a, v2d b) { return vminq_f64(a, b); }
inline v2d v2_max(v2d a, v2d b) { return vmaxq_f64(a, b); }
inline v2d v2_cvt(const float* p) { return vcvt_f64_f32(vld1_f32(p)); }
inline void v2_f32(v2d v, float& lo, float& hi) { const float32x2_t r = vcvt_f32_f64(v); lo = vget_lane_f32(r, 0); hi = vget_lane_f32(r, 1); }
inline double v2_lo(v2d v) { return vgetq_lane_f64(v, 0); }
inline double v2_hi(v2d v) { return vgetq_lane_f64(v, 1); }
#endif
#endif

constexpr int N = 2048;           // samples per cycle
constexpr int NB = 11;            // detail bands (band 1 = coarsest)
constexpr int NL = 12;            // table layers: 11 bands + dry
constexpr int DRY = 11;
constexpr int NMIP = 11;          // mip m keeps harmonics 1..(1024 >> m)
constexpr int TW = (N + 1) * NL;  // floats per mip table
constexpr int CTRL = 32;          // control-rate block
constexpr int MAXV = 16;
constexpr int NS = kNumSlots;    // oscillators: A1 A2 B1 (kSlots; beta 0.3: B2 was removed)
// SOURCE PHASE moved by LFO 2 (beta 0.4): the engine-A tables are also built at PHASE_K positions round the cycle
// (phase + k / PHASE_K); 12 is not a power of two, so neighbouring positions differ in every band (core.js PHASE_K)
constexpr int PHASE_K = 12;
// SUPERMODULATION (Okto MultiWave Synth beta 0.2): the same for SPARSITY and SOURCE WIDTH of the subtractive oscillators, moved by LFO 1
// (sparsity) or LFO 2: the tables are built at SPARSE_K sparsities 0, 1/8 .. 1 (or WIDTH_K widths 0.02 .. 0.98), see slotVariant
constexpr int SPARSE_K = 9, WIDTH_K = 9, VK_PHASE = 0, VK_SPARSITY = 1, VK_WIDTH = 2, VK_MAX = 12;
constexpr int VK_N[3] = {PHASE_K, SPARSE_K, WIDTH_K};
constexpr double WIDTH_MIN = 0.02, WIDTH_MAX = 0.98;
constexpr double BASS_GAIN = 1.4;    // the chord's bass note plays this much louder (about +3 dB)
constexpr double QUICK_REL = 0.06;   // a chord note dropped by a live chord change fades out in at most this many seconds
constexpr double LN1000 = 6.907755278982137;
constexpr double LN10 = 2.302585092994046;   // Math.LN10
constexpr double LVL_EPS = 1e-5;   // an oscillator whose smoothed level is below this is not rendered
constexpr double VOICE_GAIN = 0.4;   // about -8 dB per voice: headroom for chords
constexpr double LIMIT_T = 0.7;      // output soft limiter: transparent below -3 dBFS, never above 0 dBFS
// beta 0.3.2 (the crackle of a loud chord): in front of the soft limiter, a peak guard rides the output gain so that the signal that reaches the limiter never goes past GUARD_T
// (core.js, operation for operation). Below GUARD_T the gain is exactly 1 (bit-identical with the earlier versions); above it the gain falls with GUARD_ATT (s), is held for
// GUARD_HOLD (s) so that it does not ripple at the pitch of the sound, and comes back with GUARD_REL (s).
constexpr double GUARD_T = 0.9, GUARD_ATT = 0.0003, GUARD_HOLD = 0.015, GUARD_REL = 0.15;
// beta 0.3.2: the presets' masters are set for about three notes; a denser chord drove the soft limiter into audible distortion (the same fix as the Wavelet Synthesizer's beta 0.7.1).
// The voice sum is scaled by sqrt(POLY_FREE / n) when n > POLY_FREE voices sound (n weighted by their energy relative to the loudest one, so release tails count little), smoothed:
// up to POLY_FREE voices nothing changes.
constexpr double POLY_FREE = 3;
constexpr double POLY_DOWN = 0.02, POLY_UP = 0.05;   // time constants (s) of the compensation going down / back up
constexpr double PI = 3.14159265358979323846;
constexpr double CH_BASE = 0.006, CH_DEPTH = 0.003, CH_FAST = 9.7;   // chorus: base delay, sweep per unit of depth (s), fast/slow LFO ratio
// the three chorus taps are 120 degrees apart: sin(a + 2*pi*c/3) = sin(a) * CH_COS[c] + cos(a) * CH_SIN[c]
constexpr double CH_COS[3] = {1, -0.5, -0.5}, CH_SIN[3] = {0, 0.8660254037844386, -0.8660254037844386};
// an effect that has nothing left to give is skipped: no voice, and the output under QUIET_PEAK for a whole echo (see block)
constexpr double QUIET_PEAK = 1e-9, QUIET_EXTRA = 4096;
// the smoothing constants below are given per sample at 48 kHz (as in the earlier versions); other rates get the same time constant
inline double rateCoef(double a48, double sr) { return sr == 48000 ? a48 : 1 - std::pow(1 - a48, 48000 / sr); }
constexpr double DLY_MAX = 4;   // beta 0.6: the longest delay (s): a whole note at 60 BPM (tempo sync)

inline double jsRound(double x) { return std::floor(x + 0.5); }  // Math.round semantics

struct Rng {
  uint32_t s;
  explicit Rng(uint32_t seed) : s(seed ? seed : 1u) {}
  double next() { s = s * 1664525u + 1013904223u; return s / 4294967296.0; }
};

// ------------------------------------------------------------------ parameter mapping
inline double toPlain(const ParamDef& p, double n) {
  n = std::min(1.0, std::max(0.0, n));
  switch (p.curve) {
    case CURVE_EXP: return p.min * std::pow(p.max / p.min, n);
    case CURVE_POW2: return p.min + (p.max - p.min) * n * n;
    case CURVE_INT: case CURVE_CHOICE: return p.min + jsRound(n * (p.max - p.min));
    default: return p.min + (p.max - p.min) * n;
  }
}
inline double toNorm(const ParamDef& p, double v) {
  v = std::min(p.max, std::max(p.min, v));
  switch (p.curve) {
    case CURVE_EXP: return std::log(v / p.min) / std::log(p.max / p.min);
    case CURVE_POW2: return std::sqrt((v - p.min) / (p.max - p.min));
    default: return (v - p.min) / (p.max - p.min);
  }
}

inline std::string fmtNum(const char* f, double v) { char b[64]; std::snprintf(b, sizeof b, f, v); return b; }
inline std::string sgn(double v, const std::string& s) { return (v > 0 ? "+" : v < 0 ? "\xE2\x88\x92" : "") + s; }

// UTF-8 display string (same text as the web UI)
inline std::string formatValue(const ParamDef& p, double v) {
  switch (p.fmt) {
    case FMT_PCT: return fmtNum("%.0f", jsRound(v * 100)) + "%";
    case FMT_BIPCT: return sgn(v, fmtNum("%.0f", std::fabs(jsRound(v * 100))) + "%");
    case FMT_DB: return std::string(v >= 0 ? "" : "\xE2\x88\x92") + fmtNum("%.1f", std::fabs(v)) + " dB";
    case FMT_DBBAND: return std::string(v > 0 ? "+" : v < 0 ? "\xE2\x88\x92" : "") + fmtNum("%.1f", std::fabs(v)) + " dB/band";
    case FMT_SEC:
      if (p.curve == CURVE_POW2 && v < 0.0005) return "off";
      return v < 0.9995 ? fmtNum(v < 0.01 ? "%.1f" : "%.0f", v * 1000) + " ms" : fmtNum("%.2f", v) + " s";
    case FMT_HZ: return fmtNum(v < 1 ? "%.2f" : "%.1f", v) + " Hz";
    case FMT_CENTS: return sgn(v, fmtNum("%.0f", std::fabs(jsRound(v))) + " ct");
    case FMT_BAND: return p.min < 0 ? sgn(v, fmtNum("%.1f", std::fabs(v)) + " bands") : "band " + fmtNum("%.1f", v);
    case FMT_INT: { double r = jsRound(v); return p.min < 0 ? sgn(r, fmtNum("%.0f", std::fabs(r))) : fmtNum("%.0f", r); }
    case FMT_CHOICE: { int i = (int)jsRound(v); return (i >= 0 && i < p.numChoices) ? p.choices[i] : ""; }
    case FMT_DEG: return fmtNum("%.0f", jsRound(v * 360)) + "\xC2\xB0";
    case FMT_CYC: return "\xC2\xB1" + fmtNum("%.0f", jsRound(v * 360)) + "\xC2\xB0";
    case FMT_BANDAMT: return "\xC2\xB1" + fmtNum("%.1f", v) + " bands";
    case FMT_SEMI: { double r = jsRound(v); return sgn(r, fmtNum("%.0f", std::fabs(r)) + " st"); }
    default: return fmtNum("%.2f", v);
  }
}

inline bool parseValue(const ParamDef& p, std::string s, double& out) {
  auto lower = [](std::string x) { for (auto& c : x) c = (char)std::tolower((unsigned char)c); return x; };
  if (p.fmt == FMT_CHOICE) {
    std::string t = s; while (!t.empty() && t.back() == ' ') t.pop_back(); while (!t.empty() && t[0] == ' ') t.erase(0, 1);
    for (int i = 0; i < p.numChoices; i++) if (lower(p.choices[i]) == lower(t)) { out = i; return true; }
  }
  size_t m = s.find("\xE2\x88\x92"); if (m != std::string::npos) s.replace(m, 3, "-");
  if (p.fmt == FMT_SEC && lower(s).find("off") != std::string::npos) { out = p.min; return true; }
  const char* c = s.c_str();
  while (*c && !((*c >= '0' && *c <= '9') || *c == '-' || *c == '.')) c++;  // skip prefixes such as "band ", "±"
  char* end = nullptr; double v = std::strtod(c, &end);
  if (end == c) return false;
  switch (p.fmt) {
    case FMT_PCT: case FMT_BIPCT: v /= 100; break;
    case FMT_DEG: case FMT_CYC: v /= 360; break;
    case FMT_SEC: if (lower(s).find("ms") != std::string::npos) v /= 1000; break;
    default: break;
  }
  out = std::min(p.max, std::max(p.min, v));
  return true;
}

// ------------------------------------------------------------------ wavelets
struct Filter { double h[kMaxWaveletLen], g[kMaxWaveletLen]; int L; };
struct FilterBank {   // built by the first call, once, whichever thread it is (a function-local static)
  Filter f[kNumWavelets];
  FilterBank() {
    for (int k = 0; k < kNumWavelets; k++) {
      int L = kWaveletLen[k]; f[k].L = L;
      for (int n = 0; n < L; n++) { f[k].h[n] = kWaveletH[k][n]; f[k].g[n] = ((n & 1) ? -1.0 : 1.0) * kWaveletH[k][L - 1 - n]; }
    }
  }
};
inline const Filter& filter(int w) {
  static const FilterBank bank;
  return bank.f[std::min(kNumWavelets - 1, std::max(0, w))];
}

// periodic orthogonal DWT; c[0] = approximation, band b at c[2^(b-1) .. 2^b - 1]
inline void dwt(const double* x, const Filter& f, double* c) {
  std::vector<double> a(x, x + N), na(N);
  int M = N;
  while (M > 1) {
    int half = M >> 1;
    for (int k = 0; k < half; k++) {
      double sa = 0, sd = 0;
      for (int n = 0; n < f.L; n++) { double v = a[(2 * k + n) & (M - 1)]; sa += f.h[n] * v; sd += f.g[n] * v; }
      na[k] = sa; c[half + k] = sd;
    }
    std::copy(na.begin(), na.begin() + half, a.begin());
    M = half;
  }
  c[0] = a[0];
}
inline void idwt(const double* c, const Filter& f, double* out) {
  std::vector<double> a(N, 0.0), x(N);
  a[0] = c[0];
  for (int M = 2; M <= N; M <<= 1) {
    int half = M >> 1;
    std::fill(x.begin(), x.begin() + M, 0.0);
    for (int k = 0; k < half; k++) {
      double ak = a[k], dk = c[half + k];
      if (ak == 0 && dk == 0) continue;
      for (int n = 0; n < f.L; n++) { int i = (2 * k + n) & (M - 1); x[i] += f.h[n] * ak + f.g[n] * dk; }
    }
    std::copy(x.begin(), x.begin() + M, a.begin());
  }
  std::copy(a.begin(), a.end(), out);
}

// ------------------------------------------------------------------ FFT
struct FFT {
  uint16_t rev[N]; double cosT[N / 2], sinT[N / 2];
  FFT() {
    for (int i = 0; i < N; i++) { int r = 0; for (int b = 0; b < 11; b++) if (i & (1 << b)) r |= 1 << (10 - b); rev[i] = (uint16_t)r; }
    for (int i = 0; i < N / 2; i++) { cosT[i] = std::cos(2 * PI * i / N); sinT[i] = std::sin(2 * PI * i / N); }
  }
  void run(double* re, double* im, bool inverse) const {
    for (int i = 0; i < N; i++) { int j = rev[i]; if (j > i) { std::swap(re[i], re[j]); std::swap(im[i], im[j]); } }
    for (int size = 2; size <= N; size <<= 1) {
      int half = size >> 1, step = N / size;
      for (int i = 0; i < N; i += size)
        for (int j = 0; j < half; j++) {
          int k = j * step; double wr = cosT[k], wi = inverse ? sinT[k] : -sinT[k];
          int a = i + j, b = a + half;
          double tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
    }
  }
};
inline const FFT& fft() { static FFT f; return f; }

// ------------------------------------------------------------------ tables
// SOURCE PHASE (beta 0.4): the wave is read at frac(i/N + phase), exactly (no interpolation); the noise cycle is shifted
// by round(phase·N) whole samples. phase 0 gives the source of beta 0.3 bit for bit.
// sin(2·pi·t) from additions and multiplications only, the very same operations as core.js sinTurn (see there: sparsity and equal atoms)
inline double sinTurn(double t) {
  bool neg = false;
  if (t >= 0.5) { t -= 0.5; neg = true; }
  if (t > 0.25) t = 0.5 - t;
  const double x = 2 * PI * t, y = x * x;
  const double s = x * (1 + y * (-1.6666666666666666e-1 + y * (8.333333333333333e-3 + y * (-1.984126984126984e-4 + y * (2.7557319223985893e-6 +
    y * (-2.505210838544172e-8 + y * (1.6059043836821613e-10 + y * (-7.647163731819816e-13 + y * (2.8114572543455206e-15 +
    y * (-8.22063524662433e-18 + y * (1.957294106339126e-20 + y * -3.868170170630684e-23)))))))))));
  return neg ? -s : s;
}
inline void sourceCycle(int wave, double width, double* x, double phase = 0) {
  Rng r(12345);
  for (int i = 0; i < N; i++) {
    double ph = (double)i / N + phase; ph -= std::floor(ph);
    switch (wave) {
      case 0: x[i] = 1 - 2 * ph; break;
      case 1: x[i] = ph < 0.5 ? 1 : -1; break;
      case 2: x[i] = ph < width ? 1 : -1; break;
      case 3: x[i] = ph < width ? -1 + 2 * ph / width : 1 - 2 * (ph - width) / (1 - width); break;
      case 4: x[i] = sinTurn(ph); break;
      default: x[i] = r.next() * 2 - 1; break;
    }
  }
  if (wave >= 5) {
    const int s = ((int)jsRound(phase * N) % N + N) % N;
    if (s) { std::vector<double> y(x, x + N); for (int i = 0; i < N; i++) x[i] = y[(i + s) % N]; }
  }
  double mean = 0; for (int i = 0; i < N; i++) mean += x[i]; mean /= N;
  double peak = 0; for (int i = 0; i < N; i++) { x[i] -= mean; peak = std::max(peak, std::fabs(x[i])); }
  if (peak > 0) for (int i = 0; i < N; i++) x[i] /= peak;
}

// Keeps the K largest atoms, K = nz^(1-s), nz = number of non-zero atoms of this source.
inline int sparsify(double* c, double s, int& nz) {
  double mx = 0; for (int i = 1; i < N; i++) mx = std::max(mx, std::fabs(c[i]));
  std::vector<int> idx;
  for (int i = 1; i < N; i++) { if (std::fabs(c[i]) > mx * 1e-9) idx.push_back(i); else c[i] = 0; }
  nz = (int)idx.size();
  int K = std::min(nz, s <= 0 ? nz : std::max(1, (int)jsRound(std::pow((double)nz, 1 - s))));
  if (K >= nz) return K;
  std::sort(idx.begin(), idx.end(), [&](int a, int b) {
    double da = std::fabs(c[a]), db = std::fabs(c[b]);
    if (da != db) return da > db;
    return a < b;
  });
  for (size_t j = K; j < idx.size(); j++) c[idx[j]] = 0;
  return K;
}

inline void patternCoeffs(int pattern, int seed, double* c) {
  std::fill(c, c + N, 0.0);
  Rng r((uint32_t)((uint64_t)seed * 2654435761ull + 12345ull));
  for (int b = 1; b <= NB; b++) {
    int n = 1 << (b - 1);
    for (int k = 0; k < n; k++) {
      double v;
      switch (pattern) {
        case 0: v = 1; break;
        case 1: v = b == 1 ? 1 : (k < n / 2 ? 1 : -1); break;
        case 2: v = (b & 1) ? 1 : -1; break;
        case 3: v = (k & 1) ? -1 : 1; break;
        case 4: v = k == 0 ? 1 : 0; break;
        default: v = r.next() * 2 - 1; break;
      }
      c[n + k] = v;
    }
  }
}

// Everything that depends only on the structural parameters.
// Okto MultiWave Synth: three oscillators A1 A2 B1 (kSlots). The tables of one oscillator that plays (Tables::slot): its mip
// tables, with WAVELET MORPH the same oscillator built with WAVELET 2, and with SOURCE PHASE moved by LFO 2 the other
// PHASE_K - 1 phases of the set (and of the WAVELET 2 set): phase + k / PHASE_K, k = 1 .. PHASE_K - 1 (empty: none).
struct SlotTables {
  bool on = false; int mode = 0;
  std::vector<float> mips, rms;                      // NMIP * TW, NMIP * NL
  bool hasW2 = false; std::vector<float> w2Mips, w2Rms;
  // the variants (slotVariant): kind vk (-1 none) and the other sets; PHASE: k = 1 .. PHASE_K - 1 (set 0 is the oscillator's own);
  // SPARSITY and WIDTH: all SPARSE_K / WIDTH_K sets
  int vk = -1;
  std::vector<std::vector<float>> phMips, phRms, w2PhMips, w2PhRms;
  // version 1.0.7: a build writes into the vectors this object already holds (the 1 MB tables of a set are not freed and allocated again at every build);
  // begin() clears the flags, end() frees the vectors the build did not use (so an object never keeps more than its last build needs)
  void begin() { on = false; mode = 0; hasW2 = false; vk = -1; }
  void end() {
    auto drop = [](std::vector<float>& v) { std::vector<float>().swap(v); };
    auto dropAll = [](std::vector<std::vector<float>>& v) { std::vector<std::vector<float>>().swap(v); };
    if (!on) { drop(mips); drop(rms); }
    if (!hasW2) { drop(w2Mips); drop(w2Rms); }
    if (vk < 0) { dropAll(phMips); dropAll(phRms); }
    if (vk < 0 || !hasW2) { dropAll(w2PhMips); dropAll(w2PhRms); }
  }
};
struct Tables {
  // displays (buildTables without mips): the raw layers of the oscillator shown on the panel; also where buildSet works
  int mode = 0, kept = 0, nonzero = 0;
  std::vector<double> layers;   // NL * N (raw, for displays; allocated by buildSet, version 1.0.7: the sound sets of the plug-in never need them)
  std::vector<double> coeffs;   // N
  double bandScale[NB];
  std::vector<float> mips;      // NMIP * TW (empty when built without mips)
  std::vector<float> rms;       // NMIP * NL
  // the sound (buildTables with mips): the oscillators that play
  int needs = 0;
  SlotTables slot[NS];
  void ensureWork() { if (layers.size() != (size_t)NL * N) layers.assign((size_t)NL * N, 0.0); if (coeffs.size() != (size_t)N) coeffs.assign(N, 0.0); }
  const double* layer(int l) const { return layers.data() + (size_t)l * N; }
};

// Which oscillators the sound needs: bit s = oscillator s has a level above 0.
inline int tableNeeds(const double* params) {
  int m = 0;
  for (int s = 0; s < NS; s++) if (params[kSlots[s].lvl] > 0) m |= 1 << s;
  return m;
}
// WAVELET MORPH (beta 0.3): the amounts that can move the sound away from WAVELET; an oscillator whose wavelet is WAVELET 2 has
// nothing to morph to
// the role LFO 2 moves now (-1: its amount is 0)
inline int lfo2Role(const double* params) { return params[P_LFO2_AMT] != 0 ? kLfo2Role[(int)jsRound(params[P_LFO2_TARGET])] : -1; }
// beta 0.3: LFO 3, a second LFO like LFO 2 (the same roles; its move adds to LFO 2's when both aim at the same control)
inline int lfo3Role(const double* params) { return params[P_LFO3_AMT] != 0 ? kLfo2Role[(int)jsRound(params[P_LFO3_TARGET])] : -1; }
inline bool morphOn(const double* params) {
  return params[P_WMORPH] > 0 || params[P_LFO_WAV] > 0 || params[P_ENV_WAV] != 0 || params[P_LFO_EW] > 0 || lfo2Role(params) == ROLE_MORPH || lfo3Role(params) == ROLE_MORPH;
}
inline bool slotMorph(const double* params, int s) { return morphOn(params) && (int)jsRound(params[P_WAV2]) != (int)jsRound(params[kSlots[s].wavelet]); }
inline bool morphNeeded(const double* params) {
  for (int s = 0; s < NS; s++) if (params[kSlots[s].lvl] > 0 && slotMorph(params, s)) return true;
  return false;
}
// SOURCE PHASE (beta 0.4), SPARSITY and SOURCE WIDTH (beta 0.2) moved by an LFO: a subtractive oscillator that plays gets its tables
// built at several values (the kind of variant, VK_*, or -1 for none). One kind per oscillator: SPARSITY (LFO 1's amount above 0, or
// LFO 2 on SPARSITY) before PHASE (LFO 2) before WIDTH (LFO 2; only a pulse or triangle source has a width). The roles are ROLE_* (spec.js ROLES).
inline int slotVariant(const double* params, int s) {
  if (kSlots[s].mode != 0 || !(params[kSlots[s].lvl] > 0)) return -1;
  const int r = lfo2Role(params), r3 = lfo3Role(params);
  if (params[P_LFO_SP] > 0 || r == ROLE_SPARSITY || r3 == ROLE_SPARSITY) return VK_SPARSITY;
  if (r == ROLE_PHASE || r3 == ROLE_PHASE) return VK_PHASE;
  if (r == ROLE_WIDTH || r3 == ROLE_WIDTH) { const int w = (int)jsRound(params[kSlots[s].wave]); if (w == 2 || w == 3) return VK_WIDTH; }
  return -1;
}
inline bool variantNeeded(const double* params) {
  for (int s = 0; s < NS; s++) if (slotVariant(params, s) >= 0) return true;
  return false;
}
// the kinds of all oscillators in one number: the tables are rebuilt when it changes
inline int variantSig(const double* params) {
  int m = 0;
  for (int s = 0; s < NS; s++) m |= (slotVariant(params, s) + 1) << (2 * s);
  return m;
}

// Builds the tables of oscillator s into t (raw layers, coefficients, and with mips the mip tables). ovWavelet / ovPhase (>= 0)
// replace the oscillator's own wavelet / source phase (the WAVELET MORPH set, the phase sets).
// outMips / outRms (version 1.0.7): where the mip tables are written (default: t.mips, t.rms), so that a build can fill the vectors of its destination directly.
inline void buildSet(const double* params, int s, bool withMips, Tables& t, double ovWavelet = -1, double ovPhase = -1, double ovSparsity = -1, double ovWidth = -1,
                     std::vector<float>* outMips = nullptr, std::vector<float>* outRms = nullptr) {
  const SlotDef& k = kSlots[s];
  t.ensureWork();
  t.mode = k.mode;
  const Filter& f = filter((int)jsRound(ovWavelet >= 0 ? ovWavelet : params[k.wavelet]));
  double* c = t.coeffs.data();
  std::vector<double> band(N), l(N);
  std::fill(t.layers.begin(), t.layers.end(), 0.0);
  for (int b = 0; b < NB; b++) t.bandScale[b] = 1;
  if (t.mode == 0) {
    std::vector<double> src(N);
    sourceCycle((int)jsRound(params[k.wave]), ovWidth >= 0 ? ovWidth : params[k.width], src.data(), ovPhase >= 0 ? ovPhase : params[k.phase]);
    dwt(src.data(), f, c);
    c[0] = 0;
    t.kept = sparsify(c, ovSparsity >= 0 ? ovSparsity : params[k.sparsity], t.nonzero);
    double* dry = t.layers.data() + (size_t)DRY * N;
    for (int b = 1; b <= NB; b++) {
      std::fill(band.begin(), band.end(), 0.0);
      for (int i = 1 << (b - 1); i < (1 << b); i++) band[i] = c[i];
      double* dst = t.layers.data() + (size_t)(b - 1) * N;
      idwt(band.data(), f, dst);
      for (int i = 0; i < N; i++) dry[i] += dst[i];
    }
  } else {
    patternCoeffs((int)jsRound(params[k.pattern]), (int)jsRound(params[k.seed]), c);
    for (int b = 1; b <= NB; b++) {
      std::fill(band.begin(), band.end(), 0.0);
      for (int i = 1 << (b - 1); i < (1 << b); i++) band[i] = c[i];
      double* dst = t.layers.data() + (size_t)(b - 1) * N;
      idwt(band.data(), f, dst);
      double peak = 0; for (int i = 0; i < N; i++) peak = std::max(peak, std::fabs(dst[i]));
      if (peak > 0) { for (int i = 0; i < N; i++) dst[i] /= peak; t.bandScale[b - 1] = 1 / peak; }
    }
    t.kept = t.nonzero = N - 1;
  }
  if (!withMips) return;

  std::vector<float>& mipsOut = outMips ? *outMips : t.mips;
  std::vector<float>& rmsOut = outRms ? *outRms : t.rms;
  mipsOut.assign((size_t)NMIP * TW, 0.0f);
  rmsOut.assign((size_t)NMIP * NL, 0.0f);
  std::vector<double> re(N), im(N), yr(N), yi(N);
  const FFT& F = fft();
  for (int L = 0; L < NL; L++) {
    const double* src = t.layer(L);
    bool any = false;
    for (int i = 0; i < N; i++) { re[i] = src[i]; im[i] = 0; if (src[i] != 0) any = true; }
    if (!any) continue;
    F.run(re.data(), im.data(), false);
    for (int m = 0; m < NMIP; m++) {
      int H = 1024 >> m;
      std::fill(yr.begin(), yr.end(), 0.0); std::fill(yi.begin(), yi.end(), 0.0);
      for (int h = 1; h <= H; h++) { yr[h] = re[h]; yi[h] = im[h]; }
      for (int h = 1; h <= std::min(H, N / 2 - 1); h++) { yr[N - h] = re[N - h]; yi[N - h] = im[N - h]; }
      F.run(yr.data(), yi.data(), true);
      float* dst = mipsOut.data() + (size_t)m * TW;
      double e = 0;
      for (int i = 0; i < N; i++) { double v = yr[i] / N; dst[i * NL + L] = (float)v; e += v * v; }
      dst[N * NL + L] = dst[L];
      rmsOut[m * NL + L] = (float)std::sqrt(e / N);
    }
  }
}

// One set to build: the arguments of buildSet and where its mip tables go.
struct BuildJob { std::vector<float>* mips; std::vector<float>* rms; int s; double wavelet, phase, sparsity, width; };

// The other sets of a variant of subtractive oscillator s with wavelet wav (core.js variantSets), as jobs. PHASE: phase a_phase + k / PHASE_K for
// k = 1 .. PHASE_K - 1 (set 0 is the oscillator's own). SPARSITY and WIDTH: the SPARSE_K sparsities k / (SPARSE_K - 1) and the WIDTH_K
// widths WIDTH_MIN + k (WIDTH_MAX - WIDTH_MIN) / (WIDTH_K - 1), k = 0 .. K - 1 (all of them; the oscillator's own set is not one of them).
inline void variantJobs(const double* params, int s, double wav, int vk, std::vector<std::vector<float>>& mips, std::vector<std::vector<float>>& rms, std::vector<BuildJob>& jobs) {
  const int first = vk == VK_PHASE ? 1 : 0, cnt = VK_N[vk] - first;
  mips.resize(cnt); rms.resize(cnt);   // (before the jobs hold pointers into them)
  for (int k = first; k < VK_N[vk]; k++) {
    BuildJob j{&mips[k - first], &rms[k - first], s, wav, -1, -1, -1};
    if (vk == VK_PHASE) { double v = params[kSlots[s].phase] + (double)k / PHASE_K; v -= std::floor(v); j.phase = v; }
    else if (vk == VK_SPARSITY) j.sparsity = (double)k / (SPARSE_K - 1);
    else j.width = WIDTH_MIN + k * (WIDTH_MAX - WIDTH_MIN) / (WIDTH_K - 1);
    jobs.push_back(j);
  }
}

// Called by the helper threads of a parallel build (version 1.0.7) before they start: the plug-in lowers their priority so that they do not take the cores of the DAW's audio threads.
inline void (*gBuildThreadInit)() = nullptr;

// withMips=false: the oscillator shown on the panel (displays). withMips=true: the oscillators the sound needs.
// threads > 1 (version 1.0.7, CPU review 3.4): the sets of the preset (the oscillators' own, their WAVELET 2 twins, the sets of the LFO variants: up to 49) are independent, each built by
// buildSet from the parameters alone into its own vectors, so they are built by up to `threads` threads: the same bits as one after the other, in a third of the time on a heavy preset.
inline void buildTables(const double* params, bool withMips, Tables& t, int threads = 1) {
  t.needs = 0;
  for (int s = 0; s < NS; s++) t.slot[s].begin();
  if (!withMips) { buildSet(params, (int)jsRound(params[P_OSC_VIEW]), false, t); return; }
  const int need = tableNeeds(params);
  t.needs = need;
  std::vector<BuildJob> jobs;
  for (int s = 0; s < NS; s++) {
    if (!(need & (1 << s))) continue;
    SlotTables& st = t.slot[s];
    st.on = true; st.mode = kSlots[s].mode;
    jobs.push_back(BuildJob{&st.mips, &st.rms, s, -1, -1, -1, -1});
    if (slotMorph(params, s)) {   // WAVELET MORPH
      st.hasW2 = true;
      jobs.push_back(BuildJob{&st.w2Mips, &st.w2Rms, s, params[P_WAV2], -1, -1, -1});
    }
    const int vk = slotVariant(params, s);
    if (vk >= 0) {   // SOURCE PHASE / SPARSITY / SOURCE WIDTH moved by an LFO: every set also at the other values (also for WAVELET 2)
      st.vk = vk;
      variantJobs(params, s, params[kSlots[s].wavelet], vk, st.phMips, st.phRms, jobs);
      if (st.hasW2) variantJobs(params, s, params[P_WAV2], vk, st.w2PhMips, st.w2PhRms, jobs);
    }
  }
  auto run = [&](const BuildJob& j, Tables& sc) { buildSet(params, j.s, true, sc, j.wavelet, j.phase, j.sparsity, j.width, j.mips, j.rms); };
  const int nt = std::min<int>(threads, (int)jobs.size());
  if (nt <= 1 || jobs.size() < 4) {
    Tables sc;
    for (const BuildJob& j : jobs) run(j, sc);
  } else {
    std::atomic<size_t> next{0};
    std::exception_ptr err; std::mutex errMutex;
    auto work = [&](bool helper) {
      try {
        if (helper && gBuildThreadInit) gBuildThreadInit();
        Tables sc;
        for (;;) { const size_t i = next.fetch_add(1); if (i >= jobs.size()) break; run(jobs[i], sc); }
      } catch (...) { std::lock_guard<std::mutex> lk(errMutex); if (!err) err = std::current_exception(); next.store(jobs.size()); }
    };
    std::vector<std::thread> helpers;
    try { for (int i = 1; i < nt; i++) helpers.emplace_back(work, true); } catch (...) { /* no more threads: the ones started and this one do the work */ }
    work(false);
    for (std::thread& th : helpers) th.join();
    if (err) std::rethrow_exception(err);
  }
  for (int s = 0; s < NS; s++) t.slot[s].end();
}

// ------------------------------------------------------------------ gains & window
// below -9.5 exp(4x) is under 3.2e-17, 1 + exp(4x) is exactly 1, its log exactly 0: no call needed (the same value)
inline double softplus(double x) { return x > 10 ? x : x < -9.5 ? 0.0 : std::log(1 + std::exp(4 * x)) / 4; }
inline void filterGains(int type, double cut, double slope, double res, double* out) {
  for (int b = 0; b < NB; b++) {
    double d = (b + 1) - cut, g;
    if (type == 3) {
      double w = 0.25 + 12 / slope;
      g = 1 - std::exp(-(d / w) * (d / w));
    } else {
      double att;
      if (type == 0) att = slope * softplus(d);
      else if (type == 1) att = slope * softplus(-d);
      else att = slope * softplus(std::fabs(d) - 0.5);
      double boost = res == 0 && !std::signbit(res) ? 0.0 : res * std::exp(-d * d / (2 * 0.36));   // +0 times a finite number is +0
      att = std::min(att, 140.0);
      g = std::exp((boost - att) * (LN10 / 20));
    }
    out[b] = g;
  }
}
// PolyBLEP correction for the band-limited square of the sub oscillator
inline double polyBlep(double t, double dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
// Sub oscillator sample at phase ph (0..1), shape 0 sine, 1 triangle, 2 square
inline double subWave(double ph, double dt, int shape) {
  if (shape == 0) return std::sin(2 * PI * ph);
  if (shape == 1) return 1 - 4 * std::fabs(ph - 0.5);
  double t2 = ph + 0.5; if (t2 >= 1) t2 -= 1;
  return (ph < 0.5 ? 1.0 : -1.0) + polyBlep(ph, dt) - polyBlep(t2, dt);
}

inline double softLimit(double x) {
  double a = std::fabs(x);
  if (a <= LIMIT_T) return x;
  double y = LIMIT_T + (1 - LIMIT_T) * std::tanh((a - LIMIT_T) / (1 - LIMIT_T));
  return x < 0 ? -y : y;
}
inline double windowValue(double ph, double pc, double w, double D) {
  double d = std::fabs(ph - pc); if (d > 0.5) d = 1 - d;
  double bump = d < w * 0.5 ? 0.5 + 0.5 * std::cos(2 * PI * d / w) : 0;
  return (1 - D) + D * bump;
}

inline void staticGains(const double* params, double* out, int s = -1) {   // oscillator s (beta 0.3), the one shown on the panel when s < 0
  const int view = s >= 0 ? s : (int)jsRound(params[P_OSC_VIEW]); const SlotDef& k = kSlots[view];
  double fg[NB];
  filterGains((int)jsRound(params[k.ftype]), params[k.fcut], params[k.fslope], params[k.fres], fg);
  if (k.mode == 0) { for (int b = 0; b < NB; b++) out[b] = fg[b]; return; }
  double norm = 0;
  for (int b = 0; b < NB; b++) { double bar = params[k.bar1 + b] * std::exp(params[k.tilt] * b * (LN10 / 20)); norm += bar; out[b] = bar * fg[b]; }
  norm = std::max(1.0, norm);
  for (int b = 0; b < NB; b++) out[b] /= norm;
}

inline void displayCycle(const Tables& tb, const double* gains, double center, double width, double depth, double* out) {
  for (int i = 0; i < N; i++) {
    double ph = (double)i / N, y;
    if (tb.mode == 0) {
      double sum = 0; for (int b = 0; b < NB; b++) sum += gains[b] * tb.layer(b)[i];
      double dry = tb.layer(DRY)[i];
      y = depth > 0 ? dry + windowValue(ph, center, width, depth) * (sum - dry) : sum;
    } else {
      double sum = 0; for (int b = 1; b < NB; b++) sum += gains[b] * tb.layer(b)[i];
      y = gains[0] * tb.layer(0)[i] + (depth > 0 ? windowValue(ph, center, width, depth) : 1) * sum;
    }
    out[i] = y;
  }
}

// beta 0.3 (Okto MultiWave Synth): the SCOPE and the SCALOGRAM show the whole sound, not the oscillator shown. ScopeSets holds the raw layers of every oscillator
// that plays (level above 0; mask bit s), built by buildScopeSets (the set of the oscillator shown, already built for the other displays, is copied, not built again).
struct ScopeSets { int mask = 0; Tables set[NS]; };
inline void buildScopeSets(const double* params, const Tables& shown, ScopeSets& ss) {
  const int view = (int)jsRound(params[P_OSC_VIEW]);
  ss.mask = 0;
  for (int s = 0; s < NS; s++) {
    if (!(params[kSlots[s].lvl] > 0)) continue;
    ss.mask |= 1 << s;
    if (s == view) { ss.set[s].mode = shown.mode; ss.set[s].layers = shown.layers; ss.set[s].coeffs = shown.coeffs; for (int b = 0; b < NB; b++) ss.set[s].bandScale[b] = shown.bandScale[b]; }
    else buildSet(params, s, false, ss.set[s]);
  }
}
// One cycle of the mix at the reference note (C4, full velocity): each oscillator that plays through its own scale filter and position window, at its level and
// tuning (an octave up shows two of its cycles), plus the sub oscillator; dry (no envelope, no effect). Same as core.js globalCycle.
// beta 0.3.1: ScopeLive = the live gains and window of every oscillator that plays in the last voice (mask bit s), published by the engine (Display): the oscillator then
// shows them instead of its static ones, so the displays move with the sound (the cutoff the LFOs and the envelopes move, the note). Same as core.js.
struct ScopeLive { uint32_t mask = 0; float sg[NS][NB] = {}; float win[NS][3] = {}; };
inline void globalCycle(const double* params, const ScopeSets& ss, double* out, const ScopeLive* live = nullptr) {
  for (int i = 0; i < N; i++) out[i] = 0;
  double g[NB]; std::vector<double> cyc(N);
  for (int s = 0; s < NS; s++) {
    if (!(ss.mask & (1 << s))) continue;
    const SlotDef& k = kSlots[s];
    double c = params[k.pcen], w = params[k.pwid], d = params[k.pdep];
    if (live && (live->mask & (1u << s))) { for (int b = 0; b < NB; b++) g[b] = live->sg[s][b]; c = live->win[s][0]; w = live->win[s][1]; d = live->win[s][2]; }
    else staticGains(params, g, s);
    displayCycle(ss.set[s], g, c, w, d, cyc.data());
    const double lvl = params[k.lvl], ratio = std::pow(2.0, (12 * params[k.oct] + params[k.semi] + params[k.fine] / 100) / 12);
    for (int i = 0; i < N; i++) {
      const double x = i * ratio, f = std::floor(x), fr = x - f;
      const int i0 = (int)f % N, i1 = (i0 + 1) % N;
      out[i] += lvl * (cyc[i0] + fr * (cyc[i1] - cyc[i0]));
    }
  }
  const double sub = params[P_SUB_LEVEL];
  if (sub > 0) {
    const double ratio = (int)jsRound(params[P_SUB_OCT]) == 1 ? 0.25 : 0.5; const int shape = (int)jsRound(params[P_SUB_SHAPE]);
    for (int i = 0; i < N; i++) out[i] += sub * subWave((double)i / N * ratio, ratio / N, shape);
  }
}
// The scalogram of the mix: for each oscillator that plays, the scale of each band (level, band scale, size of the atoms, the band's filter gain); the screen
// shows the root of the sum of the squares of what each oscillator's coefficients give.
struct ScopeBand { const double* coeffs; double sc[NB]; };
inline int scopeBands(const double* params, const ScopeSets& ss, ScopeBand* out, const ScopeLive* live = nullptr) {
  int n = 0; double g[NB]; const double sq = 1 / std::sqrt((double)N);
  for (int s = 0; s < NS; s++) {
    if (!(ss.mask & (1 << s))) continue;
    if (live && (live->mask & (1u << s))) { for (int b = 0; b < NB; b++) g[b] = live->sg[s][b]; }
    else staticGains(params, g, s);
    out[n].coeffs = ss.set[s].coeffs.data();
    for (int b = 1; b <= NB; b++) out[n].sc[b - 1] = params[kSlots[s].lvl] * ss.set[s].bandScale[b - 1] * std::pow(2.0, (b - 1) / 2.0) * sq * std::fabs(g[b - 1]);
    n++;
  }
  return n;
}

struct Atom { std::vector<double> x; int lo = N, hi = 0; };
inline Atom atomShape(int w) {
  std::vector<double> c(N, 0.0); c[64 + 32] = 1;
  Atom a; a.x.resize(N);
  idwt(c.data(), filter(w), a.x.data());
  for (int i = 0; i < N; i++) if (std::fabs(a.x[i]) > 1e-9) { a.lo = std::min(a.lo, i); a.hi = std::max(a.hi, i); }
  return a;
}

// ------------------------------------------------------------------ FILTER (Okto MultiWave Synth beta 0.3; the same operations as core.js)
// The size of a move of LFO 2 / LFO 3 at full amount: half the range of its target in plain units; the filter cutoff is exponential: half its range in octaves.
inline double roleSpan(const ParamDef& tp, int role) { return role == ROLE_VFCUT ? std::log2(tp.max / tp.min) : tp.max - tp.min; }
// a rational tanh (no library call)
inline double tnh(double x) {
  if (x > 3) x = 3; else if (x < -3) x = -3;
  const double x2 = x * x;
  return x * (27 + x2) / (27 + 9 * x2);
}
constexpr double FLT_K = 4.05;   // feedback gain at RESO 100 %: just above the 4 where a four-pole ladder sings
// one sample of one channel (its four states are st[o .. o + 3]) through the four-pole ladder; G = g / (1 + g), g = tan(pi fc / sr); k the feedback gain; type 0
// LADDER (every stage saturates), 1 OTA (only the input of the loop saturates). The feedback is solved without delay for the linear ladder.
inline double ladder(double* st, int o, double u, double G, double k, int type) {
  const double g1 = 1 - G, G2 = G * G, G3 = G2 * G, G4 = G2 * G2;
  const double s1 = st[o], s2 = st[o + 1], s3 = st[o + 2], s4 = st[o + 3];
  const double S = g1 * (G3 * s1 + G2 * s2 + G * s3 + s4);
  const double y4l = (G4 * u + S) / (1 + k * G4);
  double x = u - k * y4l;
  if (type == 0) {
    const double a = tnh(x), v1 = (a - s1) * G, y1 = v1 + s1; st[o] = y1 + v1;
    const double b = tnh(y1), v2 = (b - s2) * G, y2 = v2 + s2; st[o + 1] = y2 + v2;
    const double c = tnh(y2), v3 = (c - s3) * G, y3 = v3 + s3; st[o + 2] = y3 + v3;
    const double d = tnh(y3), v4 = (d - s4) * G, y4 = v4 + s4; st[o + 3] = y4 + v4;
    return y4;
  }
  x = tnh(x);
  const double v1 = (x - s1) * G, y1 = v1 + s1; st[o] = y1 + v1;
  const double v2 = (y1 - s2) * G, y2 = v2 + s2; st[o + 1] = y2 + v2;
  const double v3 = (y2 - s3) * G, y3 = v3 + s3; st[o + 2] = y3 + v3;
  const double v4 = (y3 - s4) * G, y4 = v4 + s4; st[o + 3] = y4 + v4;
  return y4;
}

// ------------------------------------------------------------------ engine
// renderVoice's two per-sample kernels. bandTerms: for the layers of one table row (base) and the next one (nx), t[b] = lg[b] * (v0 + fr * (nx[b] - v0)) with v0 the float of
// base[b] as a double, exactly the scalar expression (the floats are converted, then everything is done in double, one operation after the other). SSE2: two layers at a time, the
// pairs (2q, 2q + 1) listed in pq[0 .. npq - 1] (every pair that holds an active layer; the other layer of a pair is computed too and never used); otherwise the layers of the
// active list act[0 .. na - 1]. lg and t must be 16-byte aligned (NL entries each). rampGains: lg[b] += d[b] for the same pairs of layers.
inline void bandTerms(const float* base, const float* nx, double fr, const double* lg, double* t, const int* pq, int npq, const int* act, int na) {
#if defined(WS_V2_BAND)
  (void)act; (void)na;
  const v2d f = v2_set1(fr);
  for (int e = 0; e < npq; e++) {
    const int b = 2 * pq[e];
    const v2d a = v2_cvt(base + b), c = v2_cvt(nx + b);
    v2_store(t + b, v2_mul(v2_load(lg + b), v2_add(a, v2_mul(f, v2_sub(c, a)))));
  }
#else
  (void)pq; (void)npq;
  for (int j = 0; j < na; j++) { const int b = act[j]; const double v0 = base[b]; t[b] = lg[b] * (v0 + fr * (nx[b] - v0)); }
#endif
}
inline void rampGains(double* lg, const double* d, const int* pq, int npq) {
#if defined(WS_V2_BAND)
  for (int e = 0; e < npq; e++) { const int b = 2 * pq[e]; v2_store(lg + b, v2_add(v2_load(lg + b), v2_load(d + b))); }
#else
  (void)pq; (void)npq;
  for (int b = 0; b < NL; b++) lg[b] += d[b];
#endif
}

// exp() of an argument that is the same in every call of a block (it depends on the settings and on the block length only, not on the voice): computed once, the same value
// as the call it replaces (the memo is keyed on the exact argument)
struct ExpMemo {
  double arg = std::nan(""), val = 0;
  double get(double a) { if (a != arg) { arg = a; val = std::exp(a); } return val; }
};
struct Env {
  int stage = 0; double level = 0;  // 0 idle, 1 attack, 2 decay/sustain, 3 release
  void gate(bool on) { stage = on ? 1 : (stage ? 3 : 0); }
  double step(int n, double sr, double a, double d, double s, double r, ExpMemo& decay, ExpMemo& release) {
    if (stage == 1) { level += n / (a * sr); if (level >= 1) { level = 1; stage = 2; } }
    else if (stage == 2) level = s + (level - s) * decay.get(-n * LN1000 / (d * sr));
    else if (stage == 3) { level *= release.get(-n * LN1000 / (r * sr)); if (level < 1e-5) { level = 0; stage = 0; } }
    return level;
  }
};

// The state of one oscillator of one voice.
struct Slot {
  double phase[4] = {0, 0, 0, 0};                        // the unison copies' phases
  double g[NB] = {}, dg[NB] = {}, tg[NB] = {};           // band gains: now, step, target
  double scale[NB] = {}; bool scaleAtk[NB] = {};         // additive oscillators: the band envelopes
  double f0 = 261.63; int mip = 0; double pc = 0, pw = 1, pd = 0;   // its pitch, mip level and position window
  Env own; double pe = 1;                                // its own envelope; its pitch envelope (1 -> 0)
  bool live = false;                                     // rendered in the last block
  // its place among the sets of each kind of variant (VK_*: phase, sparsity, width), from the start to the end of the block
  double vq0[3] = {0, 0, 0}, vq1[3] = {0, 0, 0};
  // memos of what the last block computed from the same inputs (the results of pure functions of their inputs, compared exactly): the oscillator's pitch, the scale filter's
  // gains, the mip level. A held note with a static sound recomputes none of them.
  double mA = std::nan(""), mF0 = 0;                                     // pow(2, a): the oscillator's frequency
  double mL2f0 = std::nan(""), mL2 = 0;                                  // log2(261.63 / f0)
  double mTop = std::nan(""), mFmax = std::nan(""); int mMip = 0;        // the mip level for the highest unison frequency
  int mType = -1; double mCut = 0, mSlope = 0, mRes = 0, mFg[NB] = {};   // filterGains(type, cut, slope, res)
};
struct Voice {
  bool active = false, gate = false, held = false, fresh = true;
  int note = 60; double vel = 1; uint64_t age = 0;
  double pitch = 60, target = 60, f0 = 261.63;
  bool glide = false;
  double subPhase = 0;
  Env amp, mod;
  Env fe; double fs[8] = {}; bool fOn = false;   // the filter's envelope and states (stage q of the left channel at fs[2q], of the right one at fs[2q + 1]: one SSE2 pair per stage); filtered in the last block
  double fG0 = 0, fG1 = 0, fk = 0;               // its coefficient G at the start and the end of the block, the feedback gain
  Slot sl[NS];
  double mSemis = std::nan(""), mPitchF0 = 0;   // memo: the voice's frequency for its last pitch in semitones
  double wm0 = 0, wm1 = 0;   // WAVELET MORPH position at the start / end of the block
  double gain = 1; bool quick = false;   // the chord's bass note plays louder; a note dropped by a live chord change fades out quickly
};
// releases the voice's own envelopes (with the AMP and MOD envelopes)
inline void relOwn(Voice& v) { for (int s = 0; s < NS; s++) v.sl[s].own.gate(false); }

// What the audio thread plays: per oscillator its tables (see SlotTables); the pointers stay valid while `owner` lives.
struct SetRef { int mode = 0; const float* mips = nullptr; const float* rms = nullptr; };
struct SlotRef {
  bool on = false;
  SetRef main;
  bool hasW2 = false; SetRef w2;                       // WAVELET MORPH: the tables of WAVELET 2
  int vk = -1; SetRef var[VK_MAX];                     // the variant sets (kind vk; PHASE: index 0 = main; SPARSITY / WIDTH: the grid)
  bool hasW2Var = false; SetRef w2var[VK_MAX];         // ... and those of WAVELET 2 (same layout)
};
struct TableRef {
  SlotRef slot[NS];
  const void* owner = nullptr;
};
inline TableRef tableRef(const Tables& t) {
  TableRef r; r.owner = &t;
  for (int s = 0; s < NS; s++) {
    const SlotTables& st = t.slot[s]; SlotRef& o = r.slot[s];
    if (!st.on) continue;
    o.on = true;
    o.main.mode = st.mode; o.main.mips = st.mips.data(); o.main.rms = st.rms.data();
    if (st.hasW2) { o.hasW2 = true; o.w2.mode = st.mode; o.w2.mips = st.w2Mips.data(); o.w2.rms = st.w2Rms.data(); }
    if (st.vk >= 0 && (int)st.phMips.size() == VK_N[st.vk] - (st.vk == VK_PHASE ? 1 : 0)) {
      const int first = st.vk == VK_PHASE ? 1 : 0;
      o.vk = st.vk;
      if (first) o.var[0] = o.main;
      for (int k = first; k < VK_N[st.vk]; k++) { o.var[k].mode = st.mode; o.var[k].mips = st.phMips[k - first].data(); o.var[k].rms = st.phRms[k - first].data(); }
      if (st.hasW2 && (int)st.w2PhMips.size() == (int)st.phMips.size()) {
        o.hasW2Var = true;
        if (first) o.w2var[0] = o.w2;
        for (int k = first; k < VK_N[st.vk]; k++) { o.w2var[k].mode = st.mode; o.w2var[k].mips = st.w2PhMips[k - first].data(); o.w2var[k].rms = st.w2PhRms[k - first].data(); }
      }
    }
  }
  return r;
}

// ---------------------------------------------------------------- Okto MultiWave Synth: chord names and the strum plate (core.js, 1:1)
inline constexpr const char* kNoteNames[12] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
inline std::string chordName(int root, int type) { return std::string(kNoteNames[((root % 12) + 12) % 12]) + kChords[type].suffix; }
// the notes of the strum plate, lowest first: the chord's pitch classes over the three octaves above the C..B octave
// holding the root, at most 12 strings; returns their number
inline int plateNotes(int root, int type, int* out) {
  const int win = 12 * (int)std::floor(root / 12.0) + 12;
  const ChordDef& c = kChords[type];
  int pcs[kMaxChordNotes]; int np = 0;
  for (int i = 0; i < c.n; i++) { const int pc = (root + c.iv[i]) % 12; bool dup = false; for (int k = 0; k < np; k++) if (pcs[k] == pc) dup = true; if (!dup) pcs[np++] = pc; }
  std::sort(pcs, pcs + np);
  int n = 0;
  for (int o = 0; o < 3 && n < 12; o++) for (int k = 0; k < np; k++) { const int x = win + 12 * o + pcs[k]; if (x <= 127 && n < 12) out[n++] = x; }
  return n;
}

struct Display {
  float gains[NB] = {}; int mode = 0, view = 0; uint32_t voices = 0; float peakL = 0, peakR = 0;
  float center = 0, width = 1, depth = 0; int note = -1; bool slotLive = false;
  float sg[NS][NB] = {}; float swin[NS][3] = {}; uint32_t mask = 0;   // beta 0.3.1: the live gains and window of every oscillator that plays in the last voice (ScopeLive)
};

class Engine {
 public:
  double p[kNumParams];
  Voice voices[MAXV];
  TableRef cur, prev; bool hasCur = false, hasPrev = false; double fade = 1;
  const void* released[4]; int nReleased = 0;   // owners no longer referenced (for the host to recycle)
  uint64_t counter = 0; double lastPitch = 60;
  int stack[128]; int stackN = 0;
  double lfoPhase = 0, lfo = 0, sh = 0; Rng lfoRng{777};
  double lfo2Phase = 0, lfo2 = 0, sh2 = 0; Rng lfo2Rng{778};   // LFO 2 (beta 0.3)
  double lfo3Phase = 0, lfo3 = 0, sh3 = 0; Rng lfo3Rng{779};   // LFO 3 (beta 0.3 of Okto MultiWave Synth)
  uint8_t keys[128] = {};
  Display disp; int lastVoice = -1;
  double sr = 48000, fmax = 29000;
  double tempo = 0;   // beta 0.6: the host's tempo (BPM), 0 = none
  bool started = false;   // the first block has been rendered
  // Okto MultiWave Synth: the chord layer (keyOn / keyOff, see there)
  uint8_t holdCnt[128] = {};    // how many held keys and chord notes want each note sounding (reference count)
  uint8_t plainHeld[128] = {};  // keys played as themselves (below the selector octave, or over the chord)
  uint8_t selHeld[128] = {};    // the selector keys held (they make no sound, so the panel's keyboard lights them from here)
  uint8_t plateHeld[128] = {};  // notes of the strum plate being touched
  int chordRoot = -1, chordN = 0, chordLastRoot = 60; double chordVel = 0;
  int16_t chordNote[MAXV] = {}; uint8_t chordOn[MAXV] = {}; double strumDue[MAXV] = {};
  double clock = 0;   // samples rendered since the start (the strum's timing)
  bool chordTypeChanged = false;   // a selector key set chord_type: the host reads it and tells its controller / panel
  bool noMicro = false;            // the demo and the evaluation passage play in equal temperament whatever the oriental tuning says
  bool chordHasBass = false;       // the first note of the chord is the bass (louder)
  double chordTrim = 1;            // the level of a chord's notes: a chord of more than a triad's power is scaled down (see chordNotes)
  double nextGain = 1;             // the gain the next note on gives its voice (the chord's bass note)

  explicit Engine(double sampleRate = 48000) {
    for (int i = 0; i < kNumParams; i++) p[i] = kParams[i].def;
    setSampleRate(sampleRate);
  }

  // beta 0.6: TEMPO SYNC. The plug-in gives the host's tempo; 0 = none (as the web app): the delay's TIME and the LFOs' RATE
  // then stay in seconds and hertz whatever SYNC says. With SYNC off every sound is bit-identical with beta 0.5.
  // At most 1000 BPM (DAWs stop at 999): a broken host's huge tempo would make the LFO phase infinite (security review).
  void setTempo(double bpm) { tempo = bpm > 0 && std::isfinite(bpm) ? std::min(bpm, 1000.0) : 0; }
  static double noteAt(const double* list, int n, double v) { return list[std::max(0, std::min(n - 1, (int)jsRound(v)))]; }
  double delaySec() const {
    if (!(tempo > 0) || p[P_FX_DSYNC] < 0.5) return p[P_FX_DTIME];
    return std::min(DLY_MAX, noteAt(kDelayBeats, (int)(sizeof kDelayBeats / sizeof *kDelayBeats), p[P_FX_DDIV]) * 60 / tempo);
  }
  double lfoHz(int sync, int div, int rate) const {
    if (!(tempo > 0) || p[sync] < 0.5) return p[rate];
    return tempo / 60 / noteAt(kLfoBeats, (int)(sizeof kLfoBeats / sizeof *kLfoBeats), p[div]);
  }

  void setSampleRate(double s) {
    sr = s;
    fmax = std::max(0.45 * sr, sr - 19000);
    dlyLen = (int)std::ceil(sr * (DLY_MAX + 0.1)) + 4;   // beta 0.6: 4 s (was 1.1 s; the reads never reach further back)
    dlyL.assign(dlyLen, 0.0f); dlyR.assign(dlyLen, 0.0f);
    dlyW = 0; dlyT = delaySec() * sr; lpL = lpR = 0;
    const int cT[8] = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617}, aT[4] = {556, 441, 341, 225};
    double sc = sr / 44100;
    for (int ch = 0; ch < 2; ch++) {
      for (int k = 0; k < 8; k++) { Comb& c = combs[ch * 8 + k]; c.buf.assign((size_t)std::lround((cT[k] + ch * 23) * sc), 0.0f); c.i = 0; c.f = 0; }
      for (int k = 0; k < 4; k++) { AP& a = aps[ch * 4 + k]; a.buf.assign((size_t)std::lround((aT[k] + ch * 23) * sc), 0.0f); a.i = 0; }
    }
    kDly = rateCoef(0.0005, sr); kLp = rateCoef(0.35, sr); kVol = rateCoef(0.002, sr);
    polyG = 1; polyDown = 1 - std::exp(-1 / (POLY_DOWN * sr)); polyUp = 1 - std::exp(-1 / (POLY_UP * sr));
    gd = 1; gHold = 0;
    kGa = rateCoef(1 - std::exp(-1 / (GUARD_ATT * 48000)), sr); kGr = rateCoef(1 - std::exp(-1 / (GUARD_REL * 48000)), sr); gHoldN = (int)std::lround(GUARD_HOLD * sr);
    damp = sr == 48000 ? 0.25 : std::pow(0.25, 48000 / sr);
    quiet = 0; quietNeed = 1e18;   // samples of silence so far, and how many an idle skip needs (set by every block)
    vol = std::exp(p[P_MASTER] * (LN10 / 20));
    dcR = 1 - 2 * PI * 10 / sr; dcxL = dcyL = dcxR = dcyR = 0;
    chLen = (int)std::ceil(sr * 0.03) + 4;
    chBuf.assign(chLen, 0.0f); chW = 0; chPh = 0; chPh2 = 0;
    for (int s2 = 0; s2 < NS; s2++) lvlSm[s2] = p[kSlots[s2].lvl];
  }

  // Called on deactivation: also forgets the voices' pitch memory so that a render (export, freeze)
  // never glides in from notes played before it.
  void reset() {
    for (auto& v : voices) {
      v.active = false; v.gate = false; v.held = false; v.amp = Env(); v.mod = Env(); v.age = 0; v.pitch = v.target = 60;
      for (auto& sl : v.sl) { sl.own = Env(); sl.pe = 1; sl.live = false; }
    }
    counter = 0; lastPitch = 60;
    stackN = 0; std::memset(keys, 0, sizeof keys); chordClear();
    std::fill(dlyL.begin(), dlyL.end(), 0.0f); std::fill(dlyR.begin(), dlyR.end(), 0.0f);
    for (auto& c : combs) { std::fill(c.buf.begin(), c.buf.end(), 0.0f); c.f = 0; }
    for (auto& a : aps) std::fill(a.buf.begin(), a.buf.end(), 0.0f);
    std::fill(chBuf.begin(), chBuf.end(), 0.0f);
    dcxL = dcyL = dcxR = dcyR = 0;
    quiet = 0;
    polyG = 1; gd = 1; gHold = 0;
    started = false;
    for (int s = 0; s < NS; s++) lvlSm[s] = p[kSlots[s].lvl];
  }

  void setParam(int id, double v) {
    if (id < 0 || id >= kNumParams) return;
    double old = p[id];
    p[id] = v;
    if (id == P_HOLD && old >= 0.5 && v < 0.5)
      for (auto& vc : voices) if (vc.active && vc.held) { vc.held = false; vc.gate = false; vc.amp.gate(false); vc.mod.gate(false); vc.fe.gate(false); relOwn(vc); }
    // Okto MultiWave Synth: CHORD switched on / off or the selector octave moved while keys are held: the chord and the counted keys
    // are released first (nothing generated stays behind)
    if ((id == P_CHORD_MODE || id == P_CHORD_OCT) && old != v) chordReset();
    // beta 0.2: the chord type, voicing or BASS changed while a root is held: the held chord changes at once
    else if ((id == P_CHORD_TYPE || id == P_CHORD_VOICING || id == P_CHORD_BASS) && old != v && chordRoot >= 0) rechord();
    // before the first block an oscillator's level (smoothed over 20 ms while the audio runs) simply takes its value
    if (!started) for (int s = 0; s < NS; s++) if (id == kSlots[s].lvl) lvlSm[s] = v;
  }

  // Switch tables with a short crossfade. A table that is dropped is reported in released[].
  void setTables(const TableRef& t) {
    if (!hasCur) { cur = t; hasCur = true; fade = 1; return; }
    if (hasPrev && nReleased < 4) released[nReleased++] = prev.owner;
    prev = cur; hasPrev = true; cur = t; fade = 0;
  }

  void noteOn(int note, double vel) {
    if (note < 0 || note > 127) return;
    if (!(vel > 0)) { noteOff(note); return; }   // also a NaN
    if (vel > 1) vel = 1;
    bool othersHeld = false;
    for (int k = 0; k < 128; k++) if (k != note && keys[k]) { othersHeld = true; break; }
    const int porta = (int)jsRound(p[P_V_PORTA]);
    keys[note] = 1;
    int maxV = (int)jsRound(p[P_V_VOICES]);
    if (maxV <= 1) {
      removeFromStack(note);
      Voice& vc = voices[0];
      bool legato = vc.active && stackN > 0;   // another key is still held down
      if (stackN < 128) stack[stackN++] = note;
      for (int k = 1; k < MAXV; k++) if (voices[k].active) { voices[k].gate = false; voices[k].amp.gate(false); voices[k].mod.gate(false), voices[k].fe.gate(false), relOwn(voices[k]); }
      trigger(vc, note, vel, legato, porta == 1 || (porta == 2 && legato));
      lastVoice = 0;
      return;
    }
    const bool glideOn = porta == 1 || (porta == 2 && othersHeld);
    int pick = -1;
    for (int k = 0; k < MAXV; k++) if (voices[k].active && voices[k].note == note) { pick = k; break; }
    if (pick < 0 && glideOn && p[P_V_GLIDE] > 0) pick = glideVoice(note, maxV, othersHeld);
    if (pick < 0) for (int k = 0; k < maxV; k++) if (!voices[k].active) { pick = k; break; }
    if (pick < 0) {
      int best = -1; uint64_t bestAge = UINT64_MAX;
      for (int k = 0; k < maxV; k++) if (!voices[k].gate && voices[k].age < bestAge) { best = k; bestAge = voices[k].age; }
      if (best < 0) for (int k = 0; k < maxV; k++) if (voices[k].age < bestAge) { best = k; bestAge = voices[k].age; }
      pick = best;
    }
    const double from = lastPitch;
    trigger(voices[pick], note, vel, false, glideOn);
    // Legato only, polyphonic: like a mono legato line, glide from the note still held (the last one played)
    if (porta == 2 && glideOn && p[P_V_GLIDE] > 0) voices[pick].pitch = from;
    lastVoice = pick;
  }

  // Polyphonic portamento: which free voice glides to the new note. Playing one note at a time it is the
  // voice of the previous note (the melody glides while older release tails continue); with other keys held
  // (chords) it is the free voice whose last pitch is nearest, so chord changes glide voice by voice.
  int glideVoice(int note, int maxV, bool othersHeld) const {
    int pick = -1; double best = 1e300;
    for (int k = 0; k < maxV; k++) {
      const Voice& v = voices[k];
      if (v.gate || !v.age) continue;
      double score = othersHeld ? std::fabs(v.pitch - note) - (double)v.age * 1e-9 : -(double)v.age;
      if (score < best) { best = score; pick = k; }
    }
    return pick;
  }

  // beta 0.4 fix: a note is released whatever VOICES is now — a preset change between its note on and its note off may
  // have switched mono <-> poly (before, the note off then missed its voice, which played on for ever)
  // quick (beta 0.2): the chord note dropped by a live chord change: its release is at most QUICK_REL long
  void noteOff(int note, bool quick = false) {
    if (note < 0 || note > 127) return;
    keys[note] = 0;
    bool hold = p[P_HOLD] >= 0.5;
    removeFromStack(note);   // the mono list keeps held keys only
    if ((int)jsRound(p[P_V_VOICES]) <= 1) {
      Voice& vc = voices[0];
      if (vc.active && vc.gate && vc.note == note && stackN) {   // mono legato: back to the last key held
        int n = stack[stackN - 1];
        vc.note = n; vc.target = n; vc.glide = (int)jsRound(p[P_V_PORTA]) != 0;
        if (!vc.glide || p[P_V_GLIDE] <= 0) vc.pitch = n;
        lastPitch = n;
        return;
      }
    }
    for (auto& vc : voices) if (vc.active && vc.gate && vc.note == note) {
      vc.quick = quick;
      if (hold) vc.held = true; else { vc.gate = false; vc.amp.gate(false); vc.mod.gate(false), vc.fe.gate(false), relOwn(vc); }
    }
  }

  void allNotesOff() {
    stackN = 0; std::memset(keys, 0, sizeof keys); chordClear();
    for (auto& vc : voices) if (vc.active) { vc.gate = false; vc.held = false; vc.amp.gate(false); vc.mod.gate(false), vc.fe.gate(false), relOwn(vc); }
  }

  // MIDI CC120: silence immediately (voices and effect tails)
  void allSoundOff() {
    for (auto& vc : voices) { vc.active = vc.gate = vc.held = false; vc.amp = Env(); vc.mod = Env(); vc.fe = Env(); std::memset(vc.fs, 0, sizeof vc.fs); vc.fOn = false; }
    stackN = 0; std::memset(keys, 0, sizeof keys); chordClear();
    std::fill(dlyL.begin(), dlyL.end(), 0.0f); std::fill(dlyR.begin(), dlyR.end(), 0.0f); lpL = lpR = 0;
    for (auto& c : combs) { std::fill(c.buf.begin(), c.buf.end(), 0.0f); c.f = 0; }
    for (auto& a : aps) std::fill(a.buf.begin(), a.buf.end(), 0.0f);
    std::fill(chBuf.begin(), chBuf.end(), 0.0f);
    quiet = 0;
    polyG = 1; gd = 1; gHold = 0;
  }

  // ---------------------------------------------------------------- Okto MultiWave Synth: the chord layer (core.js keyOn, 1:1)
  // Every key a player presses comes here (MIDI, the on-screen keyboard); CHORD off: keyOn is exactly noteOn. CHORD on:
  // the selector octave sets chord_type and makes no sound; above it, a key pressed while no root is held becomes the root
  // and the whole chord sounds, other keys play as themselves; below it, keys play as themselves. Notes are reference-
  // counted (holdCnt) so that a note shared by the chord and a held key keeps sounding until both release it.
  int chordBase() const { return 24 + 12 * (int)jsRound(p[P_CHORD_OCT]); }
  // gain (beta 0.2): the chord's bass note plays louder (the voice keeps it until it is triggered again)
  void holdOn(int note, double vel, double gain = 1) { holdCnt[note]++; nextGain = gain; noteOn(note, vel); nextGain = 1; }
  void holdOff(int note, bool quick = false) { if (holdCnt[note] > 0 && --holdCnt[note] == 0) noteOff(note, quick); }
  // the gain of chord note k: the bass (the first note of a chord that has one) plays louder
  double chordGain(int k) const { return (k == 0 && chordHasBass ? BASS_GAIN : 1.0) * chordTrim; }
  void keyOn(int note, double vel) {
    if (note < 0 || note > 127) return;
    if (!(vel > 0)) { keyOff(note); return; }
    if (p[P_CHORD_MODE] < 0.5) { noteOn(note, vel); return; }
    const int base = chordBase();
    if (note >= base && note < base + 12) {   // the selector octave: a chord type, no sound
      selHeld[note] = 1;
      const int t = kChordKeys[note - base];
      if (p[P_CHORD_TYPE] != t) {
        p[P_CHORD_TYPE] = t; chordTypeChanged = true;
        rechord();   // beta 0.2: a held root takes the new chord at once (the left hand remembers its last chord for the next root)
      }
      return;
    }
    if (note == chordRoot) {   // the root pressed again (a host repeating a note on): the chord notes start again
      for (int k = 0; k < chordN; k++) if (chordOn[k]) { nextGain = chordGain(k); noteOn(chordNote[k], vel); nextGain = 1; }
      return;
    }
    if (plainHeld[note]) { noteOn(note, vel); return; }   // a key repeated without its release: once in the count
    if (note >= base + 12 && chordRoot < 0) { startChord(note, vel); return; }
    plainHeld[note] = 1; holdOn(note, vel);
  }
  void keyOff(int note) {
    if (note < 0 || note > 127) return;
    selHeld[note] = 0;
    if (p[P_CHORD_MODE] < 0.5) { noteOff(note); return; }
    if (note == chordRoot) { endChord(); return; }
    if (plainHeld[note]) { plainHeld[note] = 0; holdOff(note); return; }
    const int base = chordBase();
    if (note >= base && note < base + 12) return;
    noteOff(note);   // a key held since before CHORD was switched on
  }
  // The chord's notes for a root, ascending, into out (MAXV); returns their number (core.js chordNotes)
  // beta 0.2: BASS = the root two octaves below (never under C1: an octave up when it would be), played louder (chordGain); it is the
  // first note of the list (chordHasBass).
  int chordNotes(int root, int16_t* out) {
    const ChordDef& c = kChords[(int)jsRound(p[P_CHORD_TYPE])];
    const bool folded = p[P_CHORD_VOICING] >= 0.5;
    const int win = 12 * (int)std::floor(root / 12.0), rootNote = folded ? win + root % 12 : root;
    int bassNote = rootNote - 24;
    while (bassNote < 24) bassNote += 12;
    int list[kMaxChordNotes]; int ln = 0;
    for (int i = 0; i < c.n; i++) {
      const int n = folded ? win + (root + c.iv[i]) % 12 : root + c.iv[i];
      bool dup = false; for (int k = 0; k < ln; k++) if (list[k] == n) dup = true;
      if (n <= 127 && !dup) list[ln++] = n;
    }
    std::sort(list, list + ln);
    const int maxV = std::max(1, (int)jsRound(p[P_V_VOICES]));
    const bool withBass = p[P_CHORD_BASS] >= 0.5 && bassNote < rootNote && maxV >= 2;
    chordHasBass = withBass;
    while (ln + (withBass ? 1 : 0) > maxV) {
      int k = ln - 1;
      while (k > 0 && list[k] == rootNote) k--;
      if (list[k] == rootNote) break;
      for (int i = k; i + 1 < ln; i++) list[i] = list[i + 1];
      ln--;
    }
    // a chord keeps the level of a triad: the notes' total power (the bass counts BASS_GAIN squared) over that of three notes scales them
    // down, so that a seventh with its bass does not hit the limiter (a triad, a power chord or a single note: 1)
    const double power = ln + (withBass ? BASS_GAIN * BASS_GAIN : 0);
    chordTrim = power > 3 ? std::sqrt(3 / power) : 1;
    int n = 0;
    if (withBass) out[n++] = (int16_t)bassNote;
    for (int i = 0; i < ln; i++) if (n < MAXV) out[n++] = (int16_t)list[i];
    return n;
  }
  void startChord(int root, double vel) {
    const int n = chordNotes(root, chordNote);
    chordRoot = root; chordLastRoot = root; chordN = n; chordVel = vel;
    const double strum = p[P_CHORD_STRUM] * sr;   // STRUM: samples between two notes, lowest first
    for (int k = 0; k < n; k++) { chordOn[k] = 0; strumDue[k] = clock + k * strum; }
    strumTick();   // the first note starts now (all of them without STRUM)
  }
  void strumTick() {   // at every block: the chord notes whose time has come
    if (chordRoot < 0) return;
    for (int k = 0; k < chordN; k++) if (!chordOn[k] && strumDue[k] <= clock) { chordOn[k] = 1; holdOn(chordNote[k], chordVel, chordGain(k)); }
  }
  void endChord() {   // the root released: its notes (pending ones are forgotten)
    if (chordRoot < 0) return;
    for (int k = 0; k < chordN; k++) if (chordOn[k]) holdOff(chordNote[k]);
    chordRoot = -1; chordN = 0;
  }
  // beta 0.2: the held root takes the chord of the new type / voicing / BASS at once (core.js rechord). Only the notes of the chord now
  // played sound: the notes that are not in the new chord fade out quickly (QUICK_REL), the ones in both go on untouched, the new ones
  // start with the root's velocity (without STRUM). A note held by hand over the chord is not touched (it is counted apart).
  void rechord() {
    if (chordRoot < 0) return;
    const int oldN = chordN; int16_t oldNote[MAXV]; uint8_t oldOn[MAXV];
    for (int i = 0; i < oldN; i++) { oldNote[i] = chordNote[i]; oldOn[i] = chordOn[i]; }
    int16_t next[MAXV]; const int n = chordNotes(chordRoot, next);
    for (int i = 0; i < oldN; i++) {
      if (!oldOn[i]) continue;
      bool stays = false;
      for (int j = 0; j < n; j++) if (next[j] == oldNote[i]) stays = true;
      if (!stays) holdOff(oldNote[i], true);
    }
    for (int j = 0; j < n; j++) {
      bool was = false;
      for (int i = 0; i < oldN; i++) if (oldOn[i] && oldNote[i] == next[j]) was = true;
      chordNote[j] = next[j]; chordOn[j] = 1;
      if (!was) holdOn(next[j], chordVel, chordGain(j));
    }
    chordN = n;
  }
  void chordReset() {   // the chord and the counted keys released (CHORD or KEYS OCT changed)
    endChord();
    for (int n = 0; n < 128; n++) {
      if (plainHeld[n]) { plainHeld[n] = 0; holdOff(n); }
      if (plateHeld[n]) { plateHeld[n] = 0; holdOff(n); }
      holdCnt[n] = 0;
    }
  }
  void chordClear() {   // allNotesOff / allSoundOff: the layer forgets everything (the voices are released there)
    chordRoot = -1; chordN = 0;
    std::memset(holdCnt, 0, sizeof holdCnt); std::memset(plainHeld, 0, sizeof plainHeld); std::memset(plateHeld, 0, sizeof plateHeld); std::memset(selHeld, 0, sizeof selHeld);
  }
  // The strum plate: its notes play as themselves, whatever CHORD says, counted like held keys
  void plateOn(int note, double vel) {
    if (note < 0 || note > 127) return;
    if (plateHeld[note]) { noteOn(note, vel); return; }
    plateHeld[note] = 1; holdOn(note, vel);
  }
  void plateOff(int note) {
    if (note < 0 || note > 127 || !plateHeld[note]) return;
    plateHeld[note] = 0; holdOff(note);
  }

  // Process n samples (any n) into outL/outR (overwrites).
  bool anyVoice() const { for (int k = 0; k < MAXV; k++) if (voices[k].active) return true; return false; }
  void process(float* outL, float* outR, int n) {
    int done = 0;
    while (done < n) { int m = std::min(CTRL, n - done); block(outL, outR, done, m); done += m; }
  }

 private:
  struct Comb { std::vector<float> buf; int i = 0; double f = 0; };
  struct AP { std::vector<float> buf; int i = 0; };
  std::vector<float> dlyL, dlyR; int dlyLen = 0, dlyW = 0; double dlyT = 0, lpL = 0, lpR = 0;
  Comb combs[16]; AP aps[8];
  double vol = 0.5, dcR = 0.999, dcxL = 0, dcyL = 0, dcxR = 0, dcyR = 0;
  double kDly = 0.0005, kLp = 0.35, kVol = 0.002, damp = 0.25;   // smoothing per sample (setSampleRate)
  double polyG = 1, polyDown = 0, polyUp = 0;                    // beta 0.3.2: chord compensation
  double gd = 1, kGa = 0, kGr = 0; int gHold = 0, gHoldN = 0;      // beta 0.3.2: the peak guard (gain, its coefficients, the samples it is still held for)
  double quiet = 0, quietNeed = 1e18;   // the idle rule (block)
  std::vector<float> chBuf; int chLen = 0, chW = 0; double chPh = 0, chPh2 = 0;   // triple chorus
  float bufL[CTRL], bufR[CTRL];
  float vtL[MAXV][CTRL], vtR[MAXV][CTRL];   // each voice before its filter (the sum of its oscillators with a unit envelope)
  double envOne[CTRL] = {};
  bool fltOn = false; double dFltOct = 0, dFltRes = 0;   // the filter is in the path; the moves LFO 2 / LFO 3 give its cutoff (octaves) and resonance
  float *wL = nullptr, *wR = nullptr; const double* eP = nullptr;   // where the oscillators of a voice are rendered and the envelope they follow (the mix and the amp envelope, or the voice buffers and a unit envelope)
  double fg[NB], tmpB[NB], panL[4], panR[4], inc[4], detMul[4];
  // exp() memos of the envelopes' factors (amp, mod, filter, each oscillator's own envelope and pitch envelope) and of the filter gains of the last voice that asked (per oscillator)
  ExpMemo mAmpD, mAmpR, mAmpQ, mModD, mModR, mFeD, mFeR, mOwnD[NS], mOwnR[NS], mOwnStepD[NS], mOwnStepR[NS], mPe[NS];
  ExpMemo mKd, mVol, mLvl; double mCompKd = std::nan(""), mComp = 0;   // the output stage's and the level smoothing's factors
  int uMemoU = -1; double uMemoDet = std::nan(""), uMemoWidth = std::nan("");   // the unison copies' detune and pan, for the settings they were computed with
  struct FgMemo { int type = -1; double cut = 0, slope = 0, res = 0, fg[NB] = {}; } fgMemo[NS];
  // per block, computed once for all voices (prepBlock): the oscillators' levels (smoothed over 20 ms) and settings
  struct Prep {
    double tune = 0; int ftype = 0; double fcut = 0, fslope = 0, fres = 0, fkey = 0, fenv = 0, fvel = 0, pcen = 0, pwid = 0, pdep = 0;
    double bar[NB] = {}, atkRate[NB] = {}, decay[NB] = {}; double norm = 1, sus = 1;
  } pr[NS];
  double lvlSm[NS] = {}, m0[NS] = {}, m1[NS] = {}; bool live[NS] = {};
  int U = 1; double topMul = 1; int role2 = -1; double d2 = 0; int role3 = -1; double d3 = 0; double dMorph = 0;
  // per voice and block: the amp envelope (with the velocity gain) per sample, each oscillator's own envelope, end states
  double envAv[MAXV][CTRL], ownBuf[NS][CTRL], endPh[NS][4];   // envAv: each voice's amp envelope for the block (the filtered voices go through the filter first, see filterVoices)
  bool ownOn[NS] = {}, ownZero[NS] = {}; double ownLevel[NS] = {}; int ownStage[NS] = {};   // ownZero: the own envelope is exactly 0 for the whole block
  double endLevel = 0, endSubPhase = 0; int endStage = 0;

  void removeFromStack(int note) {
    for (int i = 0; i < stackN; i++) if (stack[i] == note) { std::memmove(stack + i, stack + i + 1, sizeof(int) * (stackN - i - 1)); stackN--; break; }
  }

  // glideOn: this note slides from the previous pitch (portamento mode and legato decide)
  void trigger(Voice& vc, int note, double vel, bool legato, bool glideOn) {
    vc.glide = glideOn;
    double glide = glideOn ? p[P_V_GLIDE] : 0;
    if (!vc.active) {
      vc.fresh = true;
      for (int s = 0; s < NS; s++) {
        Slot& sl = vc.sl[s];
        for (int u = 0; u < 4; u++) sl.phase[u] = std::fmod(u * 0.618034, 1.0);
        for (int b = 0; b < NB; b++) sl.scale[b] = 0;
        sl.live = false; sl.own.level = 0; sl.own.stage = 0; sl.pe = 1;
      }
      vc.subPhase = 0;
      vc.amp.level = 0; vc.mod.level = 0; vc.fe.level = 0; std::memset(vc.fs, 0, sizeof vc.fs); vc.fOn = false;
      // polyphonic portamento: an idle voice glides from its own last pitch (a never-used voice from the last note)
      vc.pitch = glide > 0 ? (vc.age ? vc.pitch : lastPitch) : note;
    } else if (glide <= 0) vc.pitch = note;
    vc.active = true; vc.gate = true; vc.held = false;
    vc.note = note; vc.target = note; vc.vel = vel;
    vc.gain = nextGain; vc.quick = false;
    vc.age = ++counter;
    if (!legato) {
      vc.amp.gate(true); vc.mod.gate(true); vc.fe.gate(true);
      for (int s = 0; s < NS; s++) { Slot& sl = vc.sl[s]; for (int b = 0; b < NB; b++) sl.scaleAtk[b] = true; sl.own.gate(true); sl.pe = 1; }
    }
    lastPitch = note;
  }

  // ORIENTAL KEYBOARD (beta 0.2, core.js microSemis): how far, in semitones, the key playing this pitch is moved from its equal-tempered pitch
  double microSemis(double pitch) const {
    const int mode = (int)jsRound(p[P_MT_MODE]);
    if (mode == 0 || noMicro) return 0;
    const double* t = kMicro[mode - 1][(int)jsRound(p[P_MT_SCALE])];
    const double x = pitch - (int)jsRound(p[P_MT_TONIC]), f = std::floor(x), fr = x - f;
    const int a = (((int)f % 12) + 12) % 12, b = (a + 1) % 12;
    return (t[a] + fr * (t[b] - t[a])) / 100;
  }
  void lfoTick(int n) {
    int shape = (int)jsRound(p[P_LFO_SHAPE]); double ph = lfoPhase, v;
    switch (shape) {
      case 0: v = std::sin(2 * PI * ph); break;
      case 1: v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
      case 2: v = 1 - 2 * ph; break;
      case 3: v = ph < 0.5 ? 1 : -1; break;
      default: v = sh; break;
    }
    lfo = v;
    lfoPhase += lfoHz(P_LFO_SYNC, P_LFO_DIV, P_LFO_RATE) * n / sr;
    if (lfoPhase >= 1) { lfoPhase -= std::floor(lfoPhase); sh = lfoRng.next() * 2 - 1; }
  }
  // LFO 2 (beta 0.3): the same shapes, its own phase and sample & hold sequence
  void lfo2Tick(int n) {
    int shape = (int)jsRound(p[P_LFO2_SHAPE]); double ph = lfo2Phase, v;
    switch (shape) {
      case 0: v = std::sin(2 * PI * ph); break;
      case 1: v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
      case 2: v = 1 - 2 * ph; break;
      case 3: v = ph < 0.5 ? 1 : -1; break;
      default: v = sh2; break;
    }
    lfo2 = v;
    lfo2Phase += lfoHz(P_LFO2_SYNC, P_LFO2_DIV, P_LFO2_RATE) * n / sr;
    if (lfo2Phase >= 1) { lfo2Phase -= std::floor(lfo2Phase); sh2 = lfo2Rng.next() * 2 - 1; }
  }
  // LFO 3 (Okto MultiWave Synth beta 0.3): LFO 2 again, with its own phase and sample & hold sequence
  void lfo3Tick(int n) {
    int shape = (int)jsRound(p[P_LFO3_SHAPE]); double ph = lfo3Phase, v;
    switch (shape) {
      case 0: v = std::sin(2 * PI * ph); break;
      case 1: v = ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph; break;
      case 2: v = 1 - 2 * ph; break;
      case 3: v = ph < 0.5 ? 1 : -1; break;
      default: v = sh3; break;
    }
    lfo3 = v;
    lfo3Phase += lfoHz(P_LFO3_SYNC, P_LFO3_DIV, P_LFO3_RATE) * n / sr;
    if (lfo3Phase >= 1) { lfo3Phase -= std::floor(lfo3Phase); sh3 = lfo3Rng.next() * 2 - 1; }
  }
  // LFO 2 (beta 0.3) moves the parameter of a role (cutoff, slope ... position width) by d2 in plain units: the value of that
  // field of oscillator s as LFO 2 moves it (kept in range, POSITION wraps later)
  static double roleVal(const double* p, int s, int role, int role2, double d2, int role3, double d3) {
    const int i = kSlotRole[s][role]; const double v = p[i];
    const bool m2 = role2 == role, m3 = role3 == role;   // beta 0.3: LFO 3's move (role3, d3) adds to LFO 2's
    if (!m2 && !m3) return v;
    const double w = v + (m2 ? d2 : 0) + (m3 ? d3 : 0);
    return role == ROLE_PCEN ? w : std::min(kParams[i].max, std::max(kParams[i].min, w));
  }

  // Everything the voices share in a block of n samples, computed once: LFO 2, the unison copies, the oscillators' levels
  // (smoothed over 20 ms) and settings, the additive oscillators' band terms. live[s]: oscillator s is rendered.
  void prepBlock(int n, bool fading) {
    const int t2 = (int)jsRound(p[P_LFO2_TARGET]);
    const ParamDef& tp = kParams[kLfo2Targets[t2]];
    role2 = kLfo2Role[t2]; d2 = p[P_LFO2_AMT] * lfo2 * 0.5 * roleSpan(tp, role2);
    const int t3 = (int)jsRound(p[P_LFO3_TARGET]);
    const ParamDef& tp3 = kParams[kLfo2Targets[t3]];
    role3 = p[P_LFO3_AMT] != 0 ? kLfo2Role[t3] : -1; d3 = p[P_LFO3_AMT] * lfo3 * 0.5 * roleSpan(tp3, role3);
    // the odd (1, 3, 5 ...) or even (2, 4 ...) bands' drawbars that LFO 2 and LFO 3 move, and the morph position they add
    const double dOdd = (role2 == ROLE_ODD ? d2 : 0) + (role3 == ROLE_ODD ? d3 : 0), dEven = (role2 == ROLE_EVEN ? d2 : 0) + (role3 == ROLE_EVEN ? d3 : 0);
    dMorph = (role2 == ROLE_MORPH ? d2 : 0) + (role3 == ROLE_MORPH ? d3 : 0);
    // the filter: LFO 2 / LFO 3 moves of its cutoff (octaves) and resonance; in the path unless it is open
    const bool l2on = p[P_LFO2_AMT] != 0;
    const bool c2 = l2on && role2 == ROLE_VFCUT, r2 = l2on && role2 == ROLE_VFRES, c3 = role3 == ROLE_VFCUT, r3 = role3 == ROLE_VFRES;
    dFltOct = (c2 ? d2 : 0) + (c3 ? d3 : 0); dFltRes = (r2 ? d2 : 0) + (r3 ? d3 : 0);
    const bool velF = p[P_VEL_AMT] > 0 && (int)jsRound(p[P_VEL_TARGET]) != 0;   // version 1.0.13: the PLAY card's VELOCITY moves the cutoff
    fltOn = !(p[P_VF_CUT] >= 20000 && p[P_VF_RES] == 0 && p[P_VF_DRIVE] == 0 && p[P_VF_ENV] == 0 && !c2 && !r2 && !c3 && !r3 && !velF);
    // unison copies (detune and pan are the same for every oscillator)
    const int Un = (int)jsRound(p[P_V_UNISON]); const double det = p[P_V_DETUNE], width = p[P_V_WIDTH];
    U = std::max(1, std::min(4, Un));
    if (U != uMemoU || det != uMemoDet || width != uMemoWidth) {   // topMul, detMul, panL, panR depend on these three only
      uMemoU = U; uMemoDet = det; uMemoWidth = width;
      const double uGain = 1 / std::sqrt((double)U);
      topMul = std::pow(2.0, (U > 1 ? det : 0) / 1200);
      for (int u = 0; u < U; u++) {
        const double pos = U > 1 ? 2.0 * u / (U - 1) - 1 : 0;
        detMul[u] = std::pow(2.0, det * pos / 1200);
        const double th = (pos * width + 1) * PI / 4;
        panL[u] = std::sqrt(2.0) * std::cos(th) * uGain; panR[u] = std::sqrt(2.0) * std::sin(th) * uGain;
      }
    }
    const double a = 1 - mLvl.get(-n / (0.02 * sr));
    for (int s = 0; s < NS; s++) {
      const SlotDef& k = kSlots[s]; Prep& q = pr[s];
      m0[s] = lvlSm[s];
      lvlSm[s] += (p[k.lvl] - lvlSm[s]) * a;
      m1[s] = lvlSm[s];
      const bool has = (hasCur && cur.slot[s].on) || (fading && hasPrev && prev.slot[s].on);
      live[s] = has && (m0[s] > LVL_EPS || m1[s] > LVL_EPS);
      if (!live[s]) continue;
      q.tune = 12 * p[k.oct] + p[k.fine] / 100 + p[k.semi];
      q.ftype = (int)jsRound(p[k.ftype]);
      q.fcut = roleVal(p, s, 0, role2, d2, role3, d3); q.fslope = roleVal(p, s, 1, role2, d2, role3, d3); q.fres = roleVal(p, s, 2, role2, d2, role3, d3);
      q.fkey = roleVal(p, s, 3, role2, d2, role3, d3); q.fenv = roleVal(p, s, 4, role2, d2, role3, d3); q.fvel = roleVal(p, s, 5, role2, d2, role3, d3);
      q.pcen = roleVal(p, s, 6, role2, d2, role3, d3); q.pwid = roleVal(p, s, 7, role2, d2, role3, d3); q.pdep = roleVal(p, s, 8, role2, d2, role3, d3);
      if (k.mode == 1) {   // additive: drawbars x tilt, their sum, the band envelopes' steps (the same for every voice)
        const double atk = p[k.atk], spread = p[k.spread], body = p[k.body], bright = p[k.bright];
        const double tilt = roleVal(p, s, ROLE_TILT, role2, d2, role3, d3);
        double norm = 0;
        for (int b = 0; b < NB; b++) {
          double bv = p[k.bar1 + b];
          const double dBar = (b & 1) == 0 ? dOdd : dEven;   // band b + 1 is odd when b is even
          if (dBar != 0) bv = std::min(1.0, std::max(0.0, bv + dBar));
          const double bar = bv * std::exp(tilt * b * (LN10 / 20));
          q.bar[b] = bar; norm += bar;
          const double t = b / 10.0;
          q.atkRate[b] = n / (atk * std::pow(16.0, spread * (t - 0.5)) * sr);
          const double dt = body * std::pow(bright / body, t);
          q.decay[b] = std::exp(-n * LN1000 / (dt * sr));
        }
        q.norm = std::max(1.0, norm); q.sus = roleVal(p, s, ROLE_SUS, role2, d2, role3, d3);
      }
    }
  }

  // Per-voice control update for a block of n samples.
  void control(Voice& vc, int n) {
    double glide = vc.glide ? p[P_V_GLIDE] : 0;
    if (glide > 0 && vc.pitch != vc.target) {
      vc.pitch += (vc.target - vc.pitch) * (1 - std::exp(-n * 4.6 / (glide * sr)));
      if (std::fabs(vc.target - vc.pitch) < 1e-3) vc.pitch = vc.target;
    } else vc.pitch = vc.target;
    const double semis = vc.pitch + microSemis(vc.pitch) + 12 * p[P_V_OCT] + p[P_V_FINE] / 100 + 2 * p[P_BEND] + lfo * (p[P_LFO_PITCH] + 50 * p[P_MODWHEEL]) / 100;
    if (semis != vc.mSemis) { vc.mSemis = semis; vc.mPitchF0 = 440 * std::pow(2.0, (semis - 69) / 12); }
    vc.f0 = vc.mPitchF0;   // the voice's pitch (the sub oscillator follows it); each oscillator adds its tuning
    const double mod = vc.mod.step(n, sr, p[P_MOD_A], p[P_MOD_D], p[P_MOD_S], p[P_MOD_R], mModD, mModR);
    // WAVELET MORPH position of this voice (0 = WAVELET, 1 = WAVELET 2): MORPH + LFO + mod envelope
    // (beta 0.2: LFO 2 can add to the morph, LFO 1 can swing the envelope's reach: ENV>WAV + LFO1 TO ENV>WAV * LFO)
    const double wm = std::min(1.0, std::max(0.0, p[P_WMORPH] + dMorph + p[P_LFO_WAV] * lfo + (p[P_ENV_WAV] + p[P_LFO_EW] * lfo) * mod));
    vc.wm0 = vc.fresh ? wm : vc.wm1; vc.wm1 = wm;
    vc.fresh = false;

    for (int s = 0; s < NS; s++) {
      Slot& sl = vc.sl[s]; const SlotDef& k = kSlots[s]; const Prep& q = pr[s];
      // the pitch envelope and the own envelope go on whether the oscillator sounds or not
      if (p[k.pamt] != 0) sl.pe *= mPe[s].get(-n * LN1000 / (p[k.ptime] * sr));
      if (!live[s]) {
        if (p[k.eon] >= 0.5) sl.own.step(n, sr, p[k.ea], p[k.ed], p[k.es], p[k.er], mOwnStepD[s], mOwnStepR[s]);
        sl.live = false;
        continue;
      }
      const double pa = (semis + q.tune + p[k.pamt] * sl.pe - 69) / 12;
      if (pa != sl.mA) { sl.mA = pa; sl.mF0 = 440 * std::pow(2.0, pa); }
      const double f0 = sl.mF0;
      sl.f0 = f0;
      const double fTop = f0 * topMul;
      if (fTop != sl.mTop || fmax != sl.mFmax) {
        sl.mTop = fTop; sl.mFmax = fmax;
        const double maxH = std::floor(fmax / fTop);
        sl.mMip = maxH >= 1024 ? 0 : maxH < 1 ? NMIP - 1 : std::min(NMIP - 1, (int)std::ceil(std::log2(1024 / maxH) - 1e-9));
      }
      sl.mip = sl.mMip;
      // scale filter
      if (f0 != sl.mL2f0) { sl.mL2f0 = f0; sl.mL2 = std::log2(261.63 / f0); }
      const double cut = q.fcut + (1 - q.fkey) * sl.mL2 + q.fenv * mod + p[P_LFO_CUT] * lfo + q.fvel * (vc.vel - 1);
      // LFO 1 TO RESO: the resonance swings by +- the amount (dB), kept in 0 .. 24
      const double res = p[P_LFO_RES] > 0 ? std::min(24.0, std::max(0.0, q.fres + p[P_LFO_RES] * lfo)) : q.fres;
      // the band gains are a function of (type, cut, slope, res) only: the voice's last ones, or the last ones computed for this oscillator (the voices of a chord that
      // share a cutoff), are reused when those four are the same
      if (sl.mType == q.ftype && sl.mCut == cut && sl.mSlope == q.fslope && sl.mRes == res) std::memcpy(fg, sl.mFg, sizeof fg);
      else {
        FgMemo& m = fgMemo[s];
        if (m.type == q.ftype && m.cut == cut && m.slope == q.fslope && m.res == res) std::memcpy(fg, m.fg, sizeof fg);
        else { filterGains(q.ftype, cut, q.fslope, res, fg); m.type = q.ftype; m.cut = cut; m.slope = q.fslope; m.res = res; std::memcpy(m.fg, fg, sizeof fg); }
        sl.mType = q.ftype; sl.mCut = cut; sl.mSlope = q.fslope; sl.mRes = res; std::memcpy(sl.mFg, fg, sizeof fg);
      }
      const bool fresh = !sl.live;   // a note's first block, or the oscillator just came in: the gains start at their target
      if (k.mode == 0) {
        // the voice's place among the sets of each kind of variant (the tables' own kind decides which one is read, renderTable): PHASE:
        // LFO 2's move round the cycle; SPARSITY: the oscillator's sparsity + LFO 1 * LFO 1 TO SPARSITY + LFO 2's move; WIDTH: the
        // source width + LFO 2's move
        double qp = ((role2 == ROLE_PHASE ? d2 : 0) + (role3 == ROLE_PHASE ? d3 : 0)) * PHASE_K; qp -= std::floor(qp / PHASE_K) * PHASE_K;
        const double sp = std::min(1.0, std::max(0.0, p[k.sparsity] + p[P_LFO_SP] * lfo + (role2 == ROLE_SPARSITY ? d2 : 0) + (role3 == ROLE_SPARSITY ? d3 : 0)));
        const double wd = std::min(WIDTH_MAX, std::max(WIDTH_MIN, p[k.width] + (role2 == ROLE_WIDTH ? d2 : 0) + (role3 == ROLE_WIDTH ? d3 : 0)));
        const double qs = sp * (SPARSE_K - 1), qw = (wd - WIDTH_MIN) / (WIDTH_MAX - WIDTH_MIN) * (WIDTH_K - 1);
        sl.vq0[VK_PHASE] = fresh ? qp : sl.vq1[VK_PHASE]; sl.vq1[VK_PHASE] = qp;
        sl.vq0[VK_SPARSITY] = fresh ? qs : sl.vq1[VK_SPARSITY]; sl.vq1[VK_SPARSITY] = qs;
        sl.vq0[VK_WIDTH] = fresh ? qw : sl.vq1[VK_WIDTH]; sl.vq1[VK_WIDTH] = qw;
      }
      if (k.mode == 1) {   // additive: the band envelopes (a returning oscillator starts them again)
        if (fresh) for (int b = 0; b < NB; b++) { sl.scale[b] = 0; sl.scaleAtk[b] = true; }
        for (int b = 0; b < NB; b++) {
          double lv = sl.scale[b];
          if (sl.scaleAtk[b]) {
            lv += q.atkRate[b];
            if (lv >= 1) { lv = 1; sl.scaleAtk[b] = false; }
          } else lv = q.sus + (lv - q.sus) * q.decay[b];
          sl.scale[b] = lv;
          tmpB[b] = q.bar[b] * lv * fg[b];
        }
        for (int b = 0; b < NB; b++) {
          const double t = tmpB[b] / q.norm;
          if (fresh) sl.g[b] = t;
          sl.tg[b] = t; sl.dg[b] = (t - sl.g[b]) / n;
        }
      } else {
        for (int b = 0; b < NB; b++) {
          const double t = fg[b];
          if (fresh) sl.g[b] = t;
          sl.tg[b] = t; sl.dg[b] = (t - sl.g[b]) / n;
        }
      }
      double pc = q.pcen + p[P_LFO_POS] * lfo; pc -= std::floor(pc);
      sl.pc = pc;
      sl.pw = std::min(1.0, std::max(q.pwid, 16 * fTop / sr));
      sl.pd = q.pdep;
    }
  }

  // The voice's AMP ENVELOPE for the block, per sample, with the velocity gain (envA); its end state in endLevel / endStage.
  void ampPass(const Voice& vc, int n, double* envA) {
    double lev = vc.amp.level; int st = vc.amp.stage;
    const double s = p[P_AMP_S];
    const double aInc = 1 / (p[P_AMP_A] * sr), dC = mAmpD.get(-LN1000 / (p[P_AMP_D] * sr)), rC = mAmpR.get(-LN1000 / (p[P_AMP_R] * sr));
    // beta 0.2: the chord's bass note plays louder (vc.gain; exactly the old value when it is 1), and a note dropped by a live chord
    // change fades out in QUICK_REL at most
    const double velGain = VOICE_GAIN * (1 - p[P_AMP_VEL] * (1 - vc.vel)) * vc.gain * velVolume(vc);
    const double rQ = vc.quick && p[P_AMP_R] > QUICK_REL ? mAmpQ.get(-LN1000 / (QUICK_REL * sr)) : rC;
    for (int i = 0; i < n; i++) {
      if (st == 1) { lev += aInc; if (lev >= 1) { lev = 1; st = 2; } }
      else if (st == 2) lev = s + (lev - s) * dC;
      else if (st == 3) { lev *= rQ; if (lev < 1e-5) { lev = 0; st = 0; } }
      envA[i] = lev * velGain;
    }
    endLevel = lev; endStage = st;
  }
  // Oscillator s's OWN ENVELOPE for the block, per sample (ownBuf[s]); its end state in ownLevel[s] / ownStage[s].
  void ownPass(const Voice& vc, int s, int n) {
    const SlotDef& k = kSlots[s]; const Slot& sl = vc.sl[s];
    double lev = sl.own.level; int st = sl.own.stage;
    bool zero = true;
    const double sus = p[k.es];
    const double aInc = 1 / (p[k.ea] * sr), dC = mOwnD[s].get(-LN1000 / (p[k.ed] * sr)), rC = mOwnR[s].get(-LN1000 / (p[k.er] * sr));
    for (int i = 0; i < n; i++) {
      if (st == 1) { lev += aInc; if (lev >= 1) { lev = 1; st = 2; } }
      else if (st == 2) { lev = sus + (lev - sus) * dC; if (std::fabs(lev - sus) < 1e-9) lev = sus; }
      else if (st == 3) { lev *= rC; if (lev < 1e-5) { lev = 0; st = 0; } }
      ownBuf[s][i] = lev;
      if (lev != 0) zero = false;
    }
    ownZero[s] = zero;
    ownLevel[s] = lev; ownStage[s] = st;
  }

  // One table set to render for an oscillator, and its share of the oscillator's level (gain0, then + gainInc per sample).
  struct Pass { int mode; const float* mips; const float* rms; double gain0, gainInc; };
  static constexpr int kMaxPasses = 16;   // (at most 8 happen: the two sets either side of the place q at the start and at the end of the block, for the oscillator and for its WAVELET 2 twin)

  // The loop of 1.0.6 for one set (a preset whose oscillators have one table set each: no WAVELET 2 twin, no LFO variant): the fused loop below costs a few per cent more
  // there. Same operations in the same order, so the same bits.
  void renderSingle(const Voice& vc, int n, int s, const Pass& pz, double fade0, double fadeInc, bool invert) {
    const int mode = pz.mode; const float* mips = pz.mips; const float* rms = pz.rms; const double gain0 = pz.gain0, gainInc = pz.gainInc;
    int act[NL];
    const Slot& sl = vc.sl[s];
    const size_t off = (size_t)sl.mip * TW;
    const double* g = sl.g; const double* dg = sl.dg;
    // A fundamental at or above Nyquist can only alias: the wavetable part of such a voice stays silent.
    const bool audible = sl.f0 < 0.5 * sr;
    int na = 0;
    if (audible)
      for (int b = 0; b < NB; b++)
        if (rms[sl.mip * NL + b] > 1e-7f && (std::fabs(g[b]) > 1e-6 || std::fabs(g[b] + dg[b] * n) > 1e-6)) act[na++] = b;
    const bool useDry = audible && mode == 0 && sl.pd > 0;
    double* ph = endPh[s];
    for (int u = 0; u < U; u++) { inc[u] = sl.f0 * detMul[u] / sr; ph[u] = sl.phase[u]; }
    // The band gains and their steps, padded to NL entries (pairs for SSE2). A band that is not in the active list keeps its gain (step 0) and its term is never added.
    // When every active step is exactly 0 the per-sample ramp (lg += 0) is skipped: the same values.
    alignas(16) double lg[NL], dgl[NL], tv[NL];
    for (int b = 0; b < NL; b++) { lg[b] = b < NB ? g[b] : 0; dgl[b] = 0; tv[b] = 0; }
    bool ramp = false;
    unsigned pairs = 0;   // the pairs of layers (2q, 2q + 1) that hold an active layer
    for (int j = 0; j < na; j++) { const int b = act[j]; dgl[b] = dg[b]; if (dg[b] != 0) ramp = true; pairs |= 1u << (b >> 1); }
    int pq[NL / 2], npq = 0;
    for (int q = 0; q < NL / 2; q++) if (pairs >> q & 1) pq[npq++] = q;
    const bool contig = na > 0 && act[na - 1] - act[0] + 1 == na;   // the active layers are consecutive: the sum runs straight along tv from the first one
    const double* tvA = tv + (na > 0 ? act[0] : 0);
    const double pc = sl.pc, pw = sl.pw, pd = sl.pd;
    const double* own = ownOn[s] ? ownBuf[s] : nullptr;
    if (own && ownZero[s]) {   // the output is the product of the envelope and the own envelope, which is 0 all block: every sample adds (float)(x * 0) = +-0, which changes no sum; the phases move as ever
      for (int i = 0; i < n; i++)
        for (int u = 0; u < U; u++) { double x = ph[u] + inc[u]; if (x >= 1) x -= std::floor(x); ph[u] = x; }
      return;
    }
    const bool unity = gain0 == 1 && gainInc == 0;
    double fade = fade0, gain = gain0;
    for (int i = 0; i < n; i++) {
      if (ramp) rampGains(lg, dgl, pq, npq);
      const double fg1 = fade >= 1 ? 1 : fade;
      double env = eP[i] * (invert ? 1 - fg1 : fg1);
      if (!unity) env *= gain;
      if (own) env *= own[i];
      fade += fadeInc; gain += gainInc;
      double oL = 0, oR = 0;
      for (int u = 0; u < U; u++) {
        double x = ph[u] + inc[u];
        if (x >= 1) x -= std::floor(x);   // keeps the table row inside [0, N) even for steps longer than a cycle
        ph[u] = x;
        double pos = x * N; int i0 = (int)pos; double fr = pos - i0;
        const float* base = mips + off + (size_t)i0 * NL; const float* nx = base + NL;
        bandTerms(base, nx, fr, lg, tv, pq, npq, act, na);   // tv[b] = lg[b] * (v0 + fr * (nx[b] - v0)) for the active layers, summed below in the order of the active list
        double y;
        if (mode == 0) {
          double sum = 0;
          if (contig) { for (int j = 0; j < na; j++) sum += tvA[j]; }
          else for (int j = 0; j < na; j++) sum += tv[act[j]];
          if (useDry) {
            double v0 = base[DRY], dry = v0 + fr * (nx[DRY] - v0);
            y = dry + windowValue(x, pc, pw, pd) * (sum - dry);
          } else y = sum;
        } else {
          double first = 0, sum = 0;
          if (contig) {
            int j = 0;
            if (act[0] == 0) { first = tv[0]; j = 1; }
            for (; j < na; j++) sum += tvA[j];
          } else
            for (int j = 0; j < na; j++) {
              int b = act[j]; double v = tv[b];
              if (b == 0) first = v; else sum += v;
            }
          y = pd > 0 ? first + windowValue(x, pc, pw, pd) * sum : first + sum;
        }
        oL += y * panL[u]; oR += y * panR[u];
      }
      wL[i] += (float)(oL * env); wR[i] += (float)(oR * env);
    }
  }

  // What one set needs: its active layers (from its rms at the voice's mip level and the band gains), the band gains and their steps padded to NL entries (pairs for SSE2; a band that
  // is not in the active list keeps its gain, step 0, and its term is never added; when every active step is exactly 0 the per-sample ramp lg += 0 is skipped: the same values).
  struct Run {
    const float* mips; int mode, na, npq; bool ramp, contig, useDry, unity; double gain, gainInc; const double* tvA;
    alignas(16) double lg[NL], dgl[NL], tv[NL];
    int act[NL], pq[NL / 2];
  };

  // The sample loop of renderPasses for K sets (K = 0: np sets, counted at run time).
  template <int K>
  void renderLoop(Run* rn, int npRun, int n, size_t off, const double* own, double fade0, double fadeInc, bool invert, bool needWin, double pc, double pw, double pd, double* ph) {
    const int np = K ? K : npRun;
    // the unison copies' steps, pans and phases in locals: the band terms are written through a pointer, which the compiler could take for the engine's own arrays
    const int Un = U;
    double incL[4], phL[4], pnL[4], pnR[4];
    for (int u = 0; u < Un; u++) { incL[u] = inc[u]; phL[u] = ph[u]; pnL[u] = panL[u]; pnR[u] = panR[u]; }
    double fade = fade0;
    for (int i = 0; i < n; i++) {
      const double fg1 = fade >= 1 ? 1 : fade;
      const double envF = eP[i] * (invert ? 1 - fg1 : fg1);
      fade += fadeInc;
      // the phases, the table row and the position window of every unison copy: the same for every set
      double fru[4], wu[4]; int i0u[4];
      for (int u = 0; u < Un; u++) {
        double x = phL[u] + incL[u];
        if (x >= 1) x -= std::floor(x);   // keeps the table row inside [0, N) even for steps longer than a cycle
        phL[u] = x;
        const double pos = x * N; const int i0 = (int)pos;
        i0u[u] = i0; fru[u] = pos - i0;
        wu[u] = needWin ? windowValue(x, pc, pw, pd) : 0;
      }
      float aL = wL[i], aR = wR[i];
      for (int k = 0; k < np; k++) {
        Run& r = rn[k];
        if (r.ramp) rampGains(r.lg, r.dgl, r.pq, r.npq);
        double env = envF;
        if (!r.unity) env *= r.gain;
        if (own) env *= own[i];
        r.gain += r.gainInc;
        double oL = 0, oR = 0;
        for (int u = 0; u < Un; u++) {
          const float* base = r.mips + off + (size_t)i0u[u] * NL; const float* nx = base + NL;
          const double fr = fru[u];
          bandTerms(base, nx, fr, r.lg, r.tv, r.pq, r.npq, r.act, r.na);   // tv[b] = lg[b] * (v0 + fr * (nx[b] - v0)) for the active layers, summed below in the order of the active list
          double y;
          if (r.mode == 0) {
            double sum = 0;
            if (r.contig) { for (int j = 0; j < r.na; j++) sum += r.tvA[j]; }
            else for (int j = 0; j < r.na; j++) sum += r.tv[r.act[j]];
            if (r.useDry) {
              double v0 = base[DRY], dry = v0 + fr * (nx[DRY] - v0);
              y = dry + wu[u] * (sum - dry);
            } else y = sum;
          } else {
            double first = 0, sum = 0;
            if (r.contig) {
              int j = 0;
              if (r.act[0] == 0) { first = r.tv[0]; j = 1; }
              for (; j < r.na; j++) sum += r.tvA[j];
            } else
              for (int j = 0; j < r.na; j++) {
                int b = r.act[j]; double v = r.tv[b];
                if (b == 0) first = v; else sum += v;
              }
            y = pd > 0 ? first + wu[u] * sum : first + sum;
          }
          oL += y * pnL[u]; oR += y * pnR[u];
        }
        aL += (float)(oL * env); aR += (float)(oR * env);
      }
      wL[i] = aL; wR[i] = aR;
    }
    for (int u = 0; u < Un; u++) ph[u] = phL[u];
  }

  // Render one voice's oscillator s for n samples with the table sets ps[0 .. np - 1] (the oscillator's own, its WAVELET 2 twin, the neighbouring sets of an LFO variant, in
  // the order they are listed), accumulating into wL / wR. Does not modify the voice: the end phases are left in endPh[s] so that several renders of the same oscillator (the table
  // crossfade) start from the same state. The output follows the amp envelope (eP), the own envelope when it is on, the crossfade (ramping from fade0 by fadeInc per sample;
  // invert: 1 - fade) and each set's share of the level.
  // Version 1.0.7 (CPU review 2.1): the sets are rendered together, sample by sample, instead of one pass over the block per set. What they have in common (the phases, the table
  // row, the position window, the envelope) is computed once instead of once per set, the mix is read and written once, and the sets' independent chains overlap. Each set does
  // exactly the operations it did as a pass of its own, in the same order, and its output is added to the mix in the order of the list, as the successive passes added it:
  // the sound is bit for bit the same (checked by cpu_bench --check and dsp_render against the engine of 1.0.6).
  void renderPasses(const Voice& vc, int n, int s, const Pass* ps, int np, double fade0, double fadeInc, bool invert) {
    if (np <= 0) return;
    if (np > kMaxPasses) np = kMaxPasses;
    if (np == 1) { renderSingle(vc, n, s, ps[0], fade0, fadeInc, invert); return; }
    const Slot& sl = vc.sl[s];
    const size_t off = (size_t)sl.mip * TW;
    const double* g = sl.g; const double* dg = sl.dg;
    // A fundamental at or above Nyquist can only alias: the wavetable part of such a voice stays silent.
    const bool audible = sl.f0 < 0.5 * sr;
    double* ph = endPh[s];
    for (int u = 0; u < U; u++) { inc[u] = sl.f0 * detMul[u] / sr; ph[u] = sl.phase[u]; }
    const double pc = sl.pc, pw = sl.pw, pd = sl.pd;
    const double* own = ownOn[s] ? ownBuf[s] : nullptr;
    if (own && ownZero[s]) {   // the output is the product of the envelope and the own envelope, which is 0 all block: every sample adds (float)(x * 0) = +-0, which changes no sum; the phases move as ever
      for (int i = 0; i < n; i++)
        for (int u = 0; u < U; u++) { double x = ph[u] + inc[u]; if (x >= 1) x -= std::floor(x); ph[u] = x; }
      return;
    }
    Run rn[kMaxPasses];
    bool needWin = false;
    for (int k = 0; k < np; k++) {
      Run& r = rn[k]; const Pass& pz = ps[k];
      r.mips = pz.mips; r.mode = pz.mode;
      int na = 0;
      if (audible)
        for (int b = 0; b < NB; b++)
          if (pz.rms[sl.mip * NL + b] > 1e-7f && (std::fabs(g[b]) > 1e-6 || std::fabs(g[b] + dg[b] * n) > 1e-6)) r.act[na++] = b;
      r.na = na;
      r.useDry = audible && pz.mode == 0 && pd > 0;
      for (int b = 0; b < NL; b++) { r.lg[b] = b < NB ? g[b] : 0; r.dgl[b] = 0; r.tv[b] = 0; }
      r.ramp = false;
      unsigned pairs = 0;   // the pairs of layers (2q, 2q + 1) that hold an active layer
      for (int j = 0; j < na; j++) { const int b = r.act[j]; r.dgl[b] = dg[b]; if (dg[b] != 0) r.ramp = true; pairs |= 1u << (b >> 1); }
      r.npq = 0;
      for (int q = 0; q < NL / 2; q++) if (pairs >> q & 1) r.pq[r.npq++] = q;
      r.contig = na > 0 && r.act[na - 1] - r.act[0] + 1 == na;   // the active layers are consecutive: the sum runs straight along tv from the first one
      r.tvA = r.tv + (na > 0 ? r.act[0] : 0);
      r.unity = pz.gain0 == 1 && pz.gainInc == 0;
      r.gain = pz.gain0; r.gainInc = pz.gainInc;
      if (pz.mode == 0 ? r.useDry : pd > 0) needWin = true;
    }
    switch (np) {   // the loop is compiled for 2 to 4 sets (the common cases) and for any number
      case 2: renderLoop<2>(rn, np, n, off, own, fade0, fadeInc, invert, needWin, pc, pw, pd, ph); break;
      case 3: renderLoop<3>(rn, np, n, off, own, fade0, fadeInc, invert, needWin, pc, pw, pd, ph); break;
      case 4: renderLoop<4>(rn, np, n, off, own, fade0, fadeInc, invert, needWin, pc, pw, pd, ph); break;
      default: renderLoop<0>(rn, np, n, off, own, fade0, fadeInc, invert, needWin, pc, pw, pd, ph); break;
    }
  }

  // The filter's coefficients for this voice and block (feLev: the level of its envelope at the end of the block)
  // version 1.0.13: the PLAY card's VELOCITY (tools/spec.js vel_amt, vel_target): the voice's gain (Volume) and the octaves its FILTER cutoff goes down (Filter); 1 and 0 when it is off
  // (core.js velVolume / velFilterOct, the same operations)
  double velVolume(const Voice& vc) const {
    const double amt = p[P_VEL_AMT]; const int t = (int)jsRound(p[P_VEL_TARGET]);
    return amt > 0 && t != 1 ? std::pow(std::max(vc.vel, 1e-3), 2 * amt) : 1;
  }
  double velFilterOct(const Voice& vc) const {
    const double amt = p[P_VEL_AMT]; const int t = (int)jsRound(p[P_VEL_TARGET]);
    return amt > 0 && t != 0 ? -amt * 4 * (1 - vc.vel) : 0;
  }
  void fltPrep(Voice& vc, int n, double feLev) {
    (void)n;
    const double octs = p[P_VF_ENV] * 8 * feLev + p[P_VF_KEY] * (vc.pitch - 60) / 12 + dFltOct + velFilterOct(vc);
    double fc = p[P_VF_CUT] * std::pow(2.0, octs);
    const double fmax = 0.45 * sr;
    if (fc > fmax) fc = fmax; else if (fc < 8) fc = 8;
    const double g = std::tan(PI * fc / sr), G = g / (1 + g);
    if (!vc.fOn) { std::memset(vc.fs, 0, sizeof vc.fs); vc.fG0 = G; vc.fOn = true; } else vc.fG0 = vc.fG1;   // a note starts with a cold filter at its cutoff
    vc.fG1 = G;
    const double res = std::min(1.0, std::max(0.0, p[P_VF_RES] + dFltRes));
    vc.fk = FLT_K * res;
  }
  // The voice buffers (vtL / vtR) of the voices list[0 .. nf - 1] (ascending) through the filter, times their amp envelopes, added to the mix, voice by voice: the same operations
  // as core.js fltProcess for each voice (the float sums of the mix are added in voice order, as when each voice was filtered as soon as it was rendered). The voices are interleaved
  // sample by sample so that their independent chains of divisions overlap, and a voice's two channels are the two lanes of an SSE2 pair.
  void filterVoices(const int* list, int nf, int n) {
    const int type = (int)jsRound(p[P_VF_TYPE]); const double drive = p[P_VF_DRIVE];
    const double gin = 1 + 7 * drive;
    const double mk = (1 + gin) / (2 * gin);
    double G0[MAXV], dG[MAXV], kf[MAXV], comp[MAXV];
    for (int f = 0; f < nf; f++) {
      const Voice& vc = voices[list[f]];
      kf[f] = vc.fk; comp[f] = type == 1 ? 1 + 0.6 * vc.fk : 1;   // OTA: the low end the resonance takes away comes back in part
      G0[f] = vc.fG0; dG[f] = (vc.fG1 - vc.fG0) / n;
    }
#if defined(WS_V2_FILTER)
    const v2d c27 = v2_set1(27), c9 = v2_set1(9), c3 = v2_set1(3), cm3 = v2_set1(-3), vgin = v2_set1(gin), vmk = v2_set1(mk);
    // tnh() on two lanes; min / max keep a NaN as it is, like the comparisons of the scalar form
    auto tnh2 = [&](v2d x) {
      x = v2_max(cm3, v2_min(c3, x));
      const v2d x2 = v2_mul(x, x);
      return v2_div(v2_mul(x, v2_add(c27, x2)), v2_add(c27, v2_mul(c9, x2)));
    };
    for (int i = 0; i < n; i++) {
      float aL = bufL[i], aR = bufR[i];
      for (int f = 0; f < nf; f++) {
        const int v = list[f]; double* st = voices[v].fs;
        const double G = G0[f] + dG[f] * (i + 1), k = kf[f];
        const double g1 = 1 - G, G2 = G * G, G3 = G2 * G, G4 = G2 * G2;
        v2d u = v2_set((double)vtR[v][i], (double)vtL[v][i]);
        if (drive > 0) u = v2_mul(tnh2(v2_mul(vgin, u)), vmk);
        u = v2_mul(u, v2_set1(comp[f]));
        const v2d s1 = v2_loadu(st), s2 = v2_loadu(st + 2), s3 = v2_loadu(st + 4), s4 = v2_loadu(st + 6);
        const v2d vG = v2_set1(G);
        // S = g1 * (G3 s1 + G2 s2 + G s3 + s4), y4l = (G4 u + S) / (1 + k G4), x = u - k y4l: the feedback solved without delay for the linear ladder
        const v2d S = v2_mul(v2_set1(g1), v2_add(v2_add(v2_add(v2_mul(v2_set1(G3), s1), v2_mul(v2_set1(G2), s2)), v2_mul(vG, s3)), s4));
        const v2d y4l = v2_div(v2_add(v2_mul(v2_set1(G4), u), S), v2_set1(1 + k * G4));
        v2d x = v2_sub(u, v2_mul(v2_set1(k), y4l)), y1, y2, y3, y4;
        if (type == 0) {   // LADDER: every stage saturates
          const v2d a = tnh2(x), v1 = v2_mul(v2_sub(a, s1), vG); y1 = v2_add(v1, s1); v2_storeu(st, v2_add(y1, v1));
          const v2d b = tnh2(y1), v2 = v2_mul(v2_sub(b, s2), vG); y2 = v2_add(v2, s2); v2_storeu(st + 2, v2_add(y2, v2));
          const v2d c = tnh2(y2), v3 = v2_mul(v2_sub(c, s3), vG); y3 = v2_add(v3, s3); v2_storeu(st + 4, v2_add(y3, v3));
          const v2d d = tnh2(y3), v4 = v2_mul(v2_sub(d, s4), vG); y4 = v2_add(v4, s4); v2_storeu(st + 6, v2_add(y4, v4));
        } else {           // OTA: only the input of the loop saturates
          x = tnh2(x);
          const v2d v1 = v2_mul(v2_sub(x, s1), vG); y1 = v2_add(v1, s1); v2_storeu(st, v2_add(y1, v1));
          const v2d v2 = v2_mul(v2_sub(y1, s2), vG); y2 = v2_add(v2, s2); v2_storeu(st + 2, v2_add(y2, v2));
          const v2d v3 = v2_mul(v2_sub(y2, s3), vG); y3 = v2_add(v3, s3); v2_storeu(st + 4, v2_add(y3, v3));
          const v2d v4 = v2_mul(v2_sub(y3, s4), vG); y4 = v2_add(v4, s4); v2_storeu(st + 6, v2_add(y4, v4));
        }
        float oL, oR; v2_f32(v2_mul(y4, v2_set1(envAv[v][i])), oL, oR);   // (float)(ladder(...) * env), left in lane 0, right in lane 1
        aL += oL; aR += oR;
      }
      bufL[i] = aL; bufR[i] = aR;
    }
#else
    for (int f = 0; f < nf; f++) {
      const int v = list[f]; double* fs = voices[v].fs; double st[8] = {fs[0], fs[2], fs[4], fs[6], fs[1], fs[3], fs[5], fs[7]};   // left states, then right ones, as ladder() reads them
      const double k = kf[f];
      for (int i = 0; i < n; i++) {
        const double G = G0[f] + dG[f] * (i + 1);
        double xl = vtL[v][i], xr = vtR[v][i];
        if (drive > 0) { xl = tnh(gin * xl) * mk; xr = tnh(gin * xr) * mk; }
        xl *= comp[f]; xr *= comp[f];
        bufL[i] += (float)(ladder(st, 0, xl, G, k, type) * envAv[v][i]);
        bufR[i] += (float)(ladder(st, 4, xr, G, k, type) * envAv[v][i]);
      }
      for (int q = 0; q < 4; q++) { fs[2 * q] = st[q]; fs[2 * q + 1] = st[4 + q]; }
    }
#endif
    for (int f = 0; f < nf; f++) {
      double* fs = voices[list[f]].fs;
      for (int q = 0; q < 8; q++) { const double x = fs[q]; if (std::fabs(x) < 1e-20 || !std::isfinite(x)) fs[q] = 0; }   // no denormals, no NaN left in a state
    }
  }

  // The sub oscillator: one per voice (not per unison voice), centred, not filtered, following the amp envelope.
  void renderSub(const Voice& vc, int n) {
    const double subLvl = p[P_SUB_LEVEL];
    endSubPhase = vc.subPhase;
    if (!(subLvl > 0)) return;
    const double subInc = vc.f0 * ((int)jsRound(p[P_SUB_OCT]) == 1 ? 0.25 : 0.5) / sr;
    const int subShape = (int)jsRound(p[P_SUB_SHAPE]);
    if (!(subInc < 0.5)) return;   // silent when it would alias (above Nyquist)
    double sph = vc.subPhase;
    for (int i = 0; i < n; i++) {
      sph += subInc; if (sph >= 1) sph -= std::floor(sph);
      const double sv = subLvl * subWave(sph, subInc, subShape) * eP[i];
      wL[i] += (float)sv; wR[i] += (float)sv;
    }
    endSubPhase = sph;
  }

  // The sets to render for one table (main, with ph its variants: SOURCE PHASE, SPARSITY or SOURCE WIDTH moved by an LFO), appended to the list ps (np entries) in the order the passes
  // of 1.0.6 were made; returns the new count. SOURCE PHASE moved by LFO 2 (beta 0.4): a subtractive set with its phase sets (ph, index 0 = the set itself) plays the sets on
  // each side of the voice's place q (share 1 - |q - k| round the cycle), q moving from ap0 to ap1 across the block; the shares of a block start and end each add up to 1.
  // Without variants exactly the set itself. A share of 0 at both ends renders nothing.
  int addPasses(Pass* ps, int np, const Voice& vc, int n, int s, const SetRef& main, const SetRef* ph, int vk, double gain0, double gainInc) {
    if (!ph) {
      if (gain0 == 0 && gainInc == 0) return np;
      ps[np++] = Pass{main.mode, main.mips, main.rms, gain0, gainInc};
      return np;
    }
    const double gain1 = gain0 + gainInc * n;
    const int KN = VK_N[vk]; const Slot& sl = vc.sl[s]; const double q0 = sl.vq0[vk], q1 = sl.vq1[vk];
    // PHASE wraps round the cycle; SPARSITY and WIDTH stop at their ends (the last set has no neighbour above it)
    const int a0 = std::min((int)std::floor(q0), KN - 1) % KN, b0 = vk == VK_PHASE ? (a0 + 1) % KN : std::min(a0 + 1, KN - 1);
    const int a1 = std::min((int)std::floor(q1), KN - 1) % KN, b1 = vk == VK_PHASE ? (a1 + 1) % KN : std::min(a1 + 1, KN - 1);
    const double f0 = q0 - std::floor(q0), f1 = q1 - std::floor(q1);
    for (int k = 0; k < KN; k++) {
      const double s0 = k == a0 ? 1 - f0 : k == b0 ? f0 : 0, s1 = k == a1 ? 1 - f1 : k == b1 ? f1 : 0;
      if (s0 == 0 && s1 == 0) continue;
      const double k0 = gain0 * s0, k1 = gain1 * s1;
      if (np < kMaxPasses) ps[np++] = Pass{ph[k].mode, ph[k].mips, ph[k].rms, k0, (k1 - k0) / n};
    }
    return np;
  }

  // WAVELET MORPH: without WAVELET 2 tables exactly the oscillator's own table (bit-identical sound when the morph is off); with them, the oscillator (share 1 - morph) and the
  // same oscillator built with WAVELET 2 (share morph), the voice's morph moving from wm0 to wm1. The oscillator's level moves from m0 to m1 across the block.
  void renderSlot(const Voice& vc, int n, int s, const SlotRef& t, double fade0, double fadeInc, bool invert, double lv0, double lv1) {
    const bool hv = t.vk >= 0;
    Pass ps[kMaxPasses]; int np = 0;
    if (!t.hasW2) np = addPasses(ps, np, vc, n, s, t.main, hv ? t.var : nullptr, t.vk, lv0, (lv1 - lv0) / n);
    else {
      const double a0 = lv0 * (1 - vc.wm0), a1 = lv1 * (1 - vc.wm1), b0 = lv0 * vc.wm0, b1 = lv1 * vc.wm1;
      np = addPasses(ps, np, vc, n, s, t.main, hv ? t.var : nullptr, t.vk, a0, (a1 - a0) / n);
      np = addPasses(ps, np, vc, n, s, t.w2, hv && t.hasW2Var ? t.w2var : nullptr, t.vk, b0, (b1 - b0) / n);
    }
    renderPasses(vc, n, s, ps, np, fade0, fadeInc, invert);
  }

  // The oscillator shown on the panel, and the level meters
  void publish(float pkL, float pkR, uint32_t vmask) {
    const int view = (int)jsRound(p[P_OSC_VIEW]);
    disp.peakL = pkL; disp.peakR = pkR; disp.voices = vmask;
    disp.view = view; disp.mode = kSlots[view].mode;
    if (lastVoice >= 0 && voices[lastVoice].active && voices[lastVoice].sl[view].live) {
      const Voice& lv = voices[lastVoice]; const Slot& sl = lv.sl[view];
      for (int b = 0; b < NB; b++) disp.gains[b] = (float)sl.g[b];
      disp.center = (float)sl.pc; disp.width = (float)sl.pw; disp.depth = (float)sl.pd; disp.note = lv.note; disp.slotLive = true;
    } else { disp.note = lastVoice >= 0 && voices[lastVoice].active ? voices[lastVoice].note : -1; disp.slotLive = false; }
    disp.mask = 0;
    if (lastVoice >= 0 && voices[lastVoice].active) {
      const Voice& lv = voices[lastVoice];
      for (int s = 0; s < NS; s++) {
        const Slot& sl = lv.sl[s];
        if (!sl.live) continue;
        disp.mask |= 1u << s;
        for (int b = 0; b < NB; b++) disp.sg[s][b] = (float)sl.g[b];
        disp.swin[s][0] = (float)sl.pc; disp.swin[s][1] = (float)sl.pw; disp.swin[s][2] = (float)sl.pd;
      }
    }
  }

  // beta 0.3.2 (the crackle of a loud chord): scales this block's voice sum (before the effects) when more than POLY_FREE voices sound (core.js polyComp, operation for operation).
  // nv = the sum of the voices' energies over the loudest one's (each voice's level at the end of the block, with its velocity gain; the notes of the chord keyboard are left out:
  // chordTrim already scales them); target sqrt(POLY_FREE / nv) reached with POLY_DOWN / POLY_UP per sample, snapped within 1e-6: up to POLY_FREE voices the gain is exactly 1
  // (bit-identical with beta 0.3.1); with no voice sounding it is 1 at once.
  void polyComp(float* L, float* R, int n) {
    double amax = 0, sum = 0; bool any = false;
    for (int k = 0; k < MAXV; k++) {
      const Voice& vc = voices[k];
      if (!vc.active || vc.gain != 1) continue;   // a chord keyboard note has its own level (chordTrim): it is not counted again
      any = true;
      const double a = vc.amp.level * (1 - p[P_AMP_VEL] * (1 - vc.vel));
      if (a > amax) amax = a;
      sum += a * a;
    }
    if (!any) { polyG = 1; return; }
    const double nv = amax > 0 ? sum / (amax * amax) : 0;
    // + 1e-6: three equal voices give nv = 3.0000000000000004 (rounding), which must still mean "no compensation"
    const double gT = nv > POLY_FREE + 1e-6 ? std::sqrt(POLY_FREE / nv) : 1;
    double g = polyG;
    if (g == 1 && gT == 1) return;
    if (g == gT) {   // settled: g += (gT - g) * c adds 0 and the snap keeps g, so every sample is scaled by the same g
      for (int i = 0; i < n; i++) { L[i] = (float)(L[i] * g); R[i] = (float)(R[i] * g); }
      return;
    }
    const double c = gT < g ? polyDown : polyUp;
    for (int i = 0; i < n; i++) {
      g += (gT - g) * c;
      if (std::fabs(gT - g) < 1e-6) g = gT;
      L[i] = (float)(L[i] * g); R[i] = (float)(R[i] * g);
    }
    polyG = g;
  }

  void block(float* outL, float* outR, int o, int n) {
    strumTick(); clock += n;   // Okto MultiWave Synth: the strummed chord notes whose time has come
    started = true;
    lfoTick(n);
    lfo2Tick(n);
    lfo3Tick(n);
    // Idle: no voice, no table fade, and the output has been silent for longer than any echo takes to come back (the delay's time
    // while it is on, the reverb's lines and the chorus's 4096 more samples): the effects have nothing left to give, so the block
    // is not computed. The master level and the delay time take their values at once, as they would have by the next note.
    if (quiet >= quietNeed && !hasPrev && !anyVoice()) {
      std::fill(outL + o, outL + o + n, 0.0f); std::fill(outR + o, outR + o + n, 0.0f);
      vol = std::exp(p[P_MASTER] * (LN10 / 20)); dlyT = delaySec() * sr;
      gd = 1; gHold = 0;
      publish(disp.peakL, disp.peakR, 0);
      return;
    }
    std::fill(bufL, bufL + n, 0.0f); std::fill(bufR, bufR + n, 0.0f);
    if (envOne[0] != 1.0) std::fill(envOne, envOne + CTRL, 1.0);
    uint32_t vmask = 0;
    int fl[MAXV], nf = 0;   // the voices that go through the filter this block
    const bool fading = hasPrev;
    const double fadeInc = fading ? 1.0 / 512 : 0, fade0 = fading ? fade : 1;
    prepBlock(n, fading);
    for (int k = 0; k < MAXV; k++) {
      Voice& vc = voices[k];
      if (!vc.active || !hasCur) continue;
      control(vc, n);
      ampPass(vc, n, envAv[k]);
      // the FILTER (beta 0.3): the voice is rendered with a unit envelope into its own buffers, filtered, then shaped by the real amp envelope and added to the mix
      const double feLev = vc.fe.step(n, sr, p[P_VF_A], p[P_VF_D], p[P_VF_S], p[P_VF_R], mFeD, mFeR);
      const bool filt = fltOn;
      eP = envAv[k]; wL = bufL; wR = bufR;
      if (filt) {
        fltPrep(vc, n, feLev);
        eP = envOne; wL = vtL[k]; wR = vtR[k];
        std::fill(vtL[k], vtL[k] + n, 0.0f); std::fill(vtR[k], vtR[k] + n, 0.0f);
        fl[nf++] = k;
      } else vc.fOn = false;
      for (int s = 0; s < NS; s++) {
        if (!live[s]) continue;
        const Slot& sl = vc.sl[s];
        ownOn[s] = p[kSlots[s].eon] >= 0.5;
        if (ownOn[s]) ownPass(vc, s, n);
        for (int u = 0; u < 4; u++) endPh[s][u] = sl.phase[u];   // a render that is skipped leaves the phases as they were
        if (fading && prev.slot[s].on) renderSlot(vc, n, s, prev.slot[s], fade0, fadeInc, true, m0[s], m1[s]);
        if (cur.slot[s].on) renderSlot(vc, n, s, cur.slot[s], fade0, fadeInc, false, m0[s], m1[s]);
      }
      renderSub(vc, n);
      // commit end-of-block state
      vc.amp.level = endLevel; vc.amp.stage = endStage;
      vc.subPhase = endSubPhase;
      for (int s = 0; s < NS; s++) {
        Slot& sl = vc.sl[s];
        if (live[s]) {
          for (int u = 0; u < 4; u++) sl.phase[u] = endPh[s][u];
          std::memcpy(sl.g, sl.tg, sizeof sl.g); sl.live = true;
          if (ownOn[s]) { sl.own.level = ownLevel[s]; sl.own.stage = ownStage[s]; }
        } else sl.live = false;
      }
      if (vc.amp.stage == 0) { vc.active = false; vc.gate = false; continue; }
      vmask |= 1u << k;
    }
    if (nf) filterVoices(fl, nf, n);
    if (fading) {
      fade += n * fadeInc;
      if (fade >= 1) { fade = 1; hasPrev = false; if (nReleased < 4) released[nReleased++] = prev.owner; }
    }
    polyComp(bufL, bufR, n);

    // effects
    const double drive = p[P_FX_DRIVE], kd = mKd.get(drive * 24 * (LN10 / 20));
    if (kd != mCompKd) { mCompKd = kd; mComp = 0.5 / std::tanh(0.5 * kd); }
    const double comp = mComp;
    const double fb = p[P_FX_DFB], dmix = p[P_FX_DMIX], rmix = p[P_FX_RMIX];
    const double dTarget = delaySec() * sr;
    const double feedback = 0.7 + 0.28 * p[P_FX_RSIZE];
    const double volT = mVol.get(p[P_MASTER] * (LN10 / 20));
    const double chMix = p[P_CH_MIX], chBase = CH_BASE * sr, chDepth = p[P_CH_DEPTH] * CH_DEPTH * sr;
    const double chInc = p[P_CH_RATE] / sr, chInc2 = chInc * CH_FAST;
    // the chorus's two LFOs as rotating vectors (sin and cos of the phase, turned by one step per sample): two sines and two
    // cosines per block instead of six sines per sample
    double sa = 0, ca = 0, sb = 0, cb = 0, cosA = 1, sinA = 0, cosB = 1, sinB = 0;
    if (chMix > 0) {
      sa = std::sin(2 * PI * chPh); ca = std::cos(2 * PI * chPh);
      sb = std::sin(2 * PI * chPh2); cb = std::cos(2 * PI * chPh2);
      cosA = std::cos(2 * PI * chInc); sinA = std::sin(2 * PI * chInc);
      cosB = std::cos(2 * PI * chInc2); sinB = std::sin(2 * PI * chInc2);
    }
    float pkL = disp.peakL, pkR = disp.peakR;
    double bpk = 0;
    double gdl = gd; int gHoldl = gHold;   // the peak guard's state for the block
    for (int i = 0; i < n; i++) {
      double l = bufL[i], r = bufR[i];
      if (drive > 0) {
        l = (1 - drive) * l + drive * std::tanh(kd * l) * comp;
        r = (1 - drive) * r + drive * std::tanh(kd * r) * comp;
      }
      // string-machine triple chorus: three delay lines swept by a slow and a fast LFO, 120° apart,
      // spread left / centre / right
      chBuf[chW] = (float)(0.5 * (l + r));
      if (chMix > 0) {
        chPh += chInc; if (chPh >= 1) chPh -= 1;
        chPh2 += chInc2; if (chPh2 >= 1) chPh2 -= 1;
        double t = sa * cosA + ca * sinA; ca = ca * cosA - sa * sinA; sa = t;
        t = sb * cosB + cb * sinB; cb = cb * cosB - sb * sinB; sb = t;
        double v[3];
        for (int c = 0; c < 3; c++) {
          const double mo = 0.8 * (sa * CH_COS[c] + ca * CH_SIN[c]) + 0.2 * (sb * CH_COS[c] + cb * CH_SIN[c]);
          double rp = chW - (chBase + chDepth * (1 + mo)); if (rp < 0) rp += chLen;
          const int i0 = (int)std::floor(rp); int i1 = i0 + 1; if (i1 >= chLen) i1 = 0; const double fr = rp - i0;
          v[c] = chBuf[i0] + fr * (chBuf[i1] - chBuf[i0]);
        }
        l += chMix * ((2 * v[0] + v[1]) / 3 - l);
        r += chMix * ((2 * v[2] + v[1]) / 3 - r);
      }
      if (++chW >= chLen) chW = 0;
      dlyT += (dTarget - dlyT) * kDly;
      if (dmix > 0 || fb > 0) {
        double rp = dlyW - dlyT; if (rp < 0) rp += dlyLen;
        int i0 = (int)rp; double fr = rp - i0; int i1 = i0 + 1; if (i1 >= dlyLen) i1 = 0;
        double dl = dlyL[i0] + fr * (dlyL[i1] - dlyL[i0]);
        double dr = dlyR[i0] + fr * (dlyR[i1] - dlyR[i0]);
        lpL += (dl - lpL) * kLp; lpR += (dr - lpR) * kLp;
        dlyL[dlyW] = (float)(0.5 * (bufL[i] + bufR[i]) + fb * lpR);
        dlyR[dlyW] = (float)(fb * lpL);
        l += dmix * dl; r += dmix * dr;
      } else { dlyL[dlyW] = 0; dlyR[dlyW] = 0; }
      if (++dlyW >= dlyLen) dlyW = 0;
      if (rmix > 0) {
        double inp = (l + r) * 0.015, wl = 0, wr = 0;
#if defined(WS_V2_REVERB)
        // version 1.0.7 (CPU review 2.4): comb k (left) and comb k + 8 (right) are independent chains of the same operations: they run as the two lanes of one register; the sums
        // wl and wr stay scalar and in the order of the loop below. The all-passes k (left chain) and k + 4 (right chain) likewise.
        {
          const v2d vod = v2_set1(1 - damp), vdp = v2_set1(damp), vfb = v2_set1(feedback), vin = v2_set1(inp), half = v2_set1(0.5);
          for (int k = 0; k < 8; k++) {
            Comb& cl = combs[k]; Comb& cr = combs[k + 8];
            const v2d y = v2_set((double)cr.buf[cr.i], (double)cl.buf[cl.i]);
            const v2d fv = v2_add(v2_mul(y, vod), v2_mul(v2_set(cr.f, cl.f), vdp));   // c.f = y (1 - damp) + c.f damp
            cl.f = v2_lo(fv); cr.f = v2_hi(fv);
            float bl, br; v2_f32(v2_add(vin, v2_mul(fv, vfb)), bl, br);               // (float)(inp + c.f feedback)
            cl.buf[cl.i] = bl; cr.buf[cr.i] = br;
            if (++cl.i >= (int)cl.buf.size()) cl.i = 0;
            if (++cr.i >= (int)cr.buf.size()) cr.i = 0;
            wl += v2_lo(y); wr += v2_hi(y);
          }
          for (int k = 0; k < 4; k++) {
            AP& al = aps[k]; AP& ar = aps[k + 4];
            const v2d bo = v2_set((double)ar.buf[ar.i], (double)al.buf[al.i]), x = v2_set(wr, wl);
            float bl, br; v2_f32(v2_add(x, v2_mul(bo, half)), bl, br);                // (float)(x + bo 0.5)
            al.buf[al.i] = bl; ar.buf[ar.i] = br;
            if (++al.i >= (int)al.buf.size()) al.i = 0;
            if (++ar.i >= (int)ar.buf.size()) ar.i = 0;
            const v2d w = v2_sub(bo, x);                                              // w = bo - x
            wl = v2_lo(w); wr = v2_hi(w);
          }
        }
#else
        for (int k = 0; k < 16; k++) {
          Comb& c = combs[k];
          double y = c.buf[c.i];
          c.f = y * (1 - damp) + c.f * damp;
          c.buf[c.i] = (float)(inp + c.f * feedback);
          if (++c.i >= (int)c.buf.size()) c.i = 0;
          if (k < 8) wl += y; else wr += y;
        }
        for (int k = 0; k < 8; k++) {
          AP& a = aps[k];
          double bo = a.buf[a.i], x = k < 4 ? wl : wr;
          a.buf[a.i] = (float)(x + bo * 0.5);
          if (++a.i >= (int)a.buf.size()) a.i = 0;
          if (k < 4) wl = bo - x; else wr = bo - x;
        }
#endif
        l += rmix * wl * 1.5; r += rmix * wr * 1.5;
      }
      // DC blocker (10 Hz), master volume, soft limiter
      double yl = l - dcxL + dcR * dcyL; dcxL = l; dcyL = std::fabs(yl) < 1e-20 ? 0 : yl; l = dcyL;
      double yr = r - dcxR + dcR * dcyR; dcxR = r; dcyR = std::fabs(yr) < 1e-20 ? 0 : yr; r = dcyR;
      vol += (volT - vol) * kVol;
      l *= vol; r *= vol;
      // the peak guard (beta 0.3.2): the gain that keeps the larger channel under GUARD_T before the soft limiter
      const double aq = std::fabs(l) > std::fabs(r) ? std::fabs(l) : std::fabs(r), gT = aq > GUARD_T && aq < 1e9 ? GUARD_T / aq : 1;
      if (gT < gdl) { gdl += (gT - gdl) * kGa; gHoldl = gHoldN; }
      else if (gHoldl > 0) gHoldl--;
      else if (gdl < 1) { gdl += (gT - gdl) * kGr; if (gT == 1 && 1 - gdl < 1e-9) gdl = 1; }
      l = softLimit(l * gdl); r = softLimit(r * gdl);
      if (!std::isfinite(l)) l = 0;
      if (!std::isfinite(r)) r = 0;
      outL[o + i] = (float)l; outR[o + i] = (float)r;
      const double al = std::fabs(l), ar = std::fabs(r);
      pkL = std::max(pkL, (float)al); pkR = std::max(pkR, (float)ar);
      if (al > bpk) bpk = al;
      if (ar > bpk) bpk = ar;
    }
    gd = gdl; gHold = gHoldl;
    // how long the output has been silent, and how long it must stay so before the block is skipped
    if (vmask == 0 && !fading && bpk < QUIET_PEAK) quiet += n; else quiet = 0;
    quietNeed = std::ceil(1.5 * (dmix > 0 || fb > 0 ? std::max(dTarget, dlyT) : 0)) + QUIET_EXTRA;
    publish(pkL, pkR, vmask);
  }
};

} // namespace ws
