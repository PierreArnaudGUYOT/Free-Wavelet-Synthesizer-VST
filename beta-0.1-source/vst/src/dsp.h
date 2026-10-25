// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Wavelet Synthesizer — created by Pierre Arnaud GUYOT (OktoPierre).
// Release history: beta 0.1 (2026-10-14) — first release (see RELEASE_HISTORY.md).
// DSP core (C++ port of web/js/core.js, same algorithm 1:1).
#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include "generated/spec.h"

namespace ws {

constexpr int N = 2048;           // samples per cycle
constexpr int NB = 11;            // detail bands (band 1 = coarsest)
constexpr int NL = 12;            // table layers: 11 bands + dry
constexpr int DRY = 11;
constexpr int NMIP = 11;          // mip m keeps harmonics 1..(1024 >> m)
constexpr int TW = (N + 1) * NL;  // floats per mip table
constexpr int CTRL = 32;          // control-rate block
constexpr int MAXV = 16;
constexpr double LN1000 = 6.907755278982137;
constexpr double VOICE_GAIN = 0.4;   // about -8 dB per voice: headroom for chords
constexpr double LIMIT_T = 0.7;      // output soft limiter: transparent below -3 dBFS, never above 0 dBFS
constexpr double PI = 3.14159265358979323846;

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
inline const Filter& filter(int w) {
  static Filter f[kNumWavelets];
  static bool init = false;
  if (!init) {
    for (int k = 0; k < kNumWavelets; k++) {
      int L = kWaveletLen[k]; f[k].L = L;
      for (int n = 0; n < L; n++) { f[k].h[n] = kWaveletH[k][n]; f[k].g[n] = ((n & 1) ? -1.0 : 1.0) * kWaveletH[k][L - 1 - n]; }
    }
    init = true;
  }
  return f[std::min(kNumWavelets - 1, std::max(0, w))];
}

// periodic orthogonal DWT; c[0] = approximation, band b at c[2^(b-1) .. 2^b - 1]
inline void dwt(const double* x, const Filter& f, double* c) {
  std::vector<double> a(x, x + N), na(N);
  int M = N;
  while (M > 1) {
    int half = M >> 1;
    for (int k = 0; k < half; k++) {
      double sa = 0, sd = 0;
      for (int n = 0; n < f.L; n++) { double v = a[(2 * k + n) % M]; sa += f.h[n] * v; sd += f.g[n] * v; }
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
      for (int n = 0; n < f.L; n++) { int i = (2 * k + n) % M; x[i] += f.h[n] * ak + f.g[n] * dk; }
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
inline void sourceCycle(int wave, double width, double* x) {
  Rng r(12345);
  for (int i = 0; i < N; i++) {
    double ph = (double)i / N;
    switch (wave) {
      case 0: x[i] = 1 - 2 * ph; break;
      case 1: x[i] = ph < 0.5 ? 1 : -1; break;
      case 2: x[i] = ph < width ? 1 : -1; break;
      case 3: x[i] = ph < width ? -1 + 2 * ph / width : 1 - 2 * (ph - width) / (1 - width); break;
      case 4: x[i] = std::sin(2 * PI * ph); break;
      default: x[i] = r.next() * 2 - 1; break;
    }
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
struct Tables {
  int mode = 0, kept = 0, nonzero = 0;
  std::vector<double> layers;   // NL * N (raw, for displays)
  std::vector<double> coeffs;   // N
  double bandScale[NB];
  std::vector<float> mips;      // NMIP * TW (empty when built without mips)
  std::vector<float> rms;       // NMIP * NL
  Tables() : layers((size_t)NL * N), coeffs(N) {}
  const double* layer(int l) const { return layers.data() + (size_t)l * N; }
};

inline void buildTables(const double* params, bool withMips, Tables& t) {
  t.mode = (int)jsRound(params[P_ENGINE]);
  const Filter& f = filter((int)jsRound(params[P_WAVELET]));
  double* c = t.coeffs.data();
  std::vector<double> band(N), l(N);
  std::fill(t.layers.begin(), t.layers.end(), 0.0);
  for (int b = 0; b < NB; b++) t.bandScale[b] = 1;
  if (t.mode == 0) {
    std::vector<double> src(N);
    sourceCycle((int)jsRound(params[P_A_WAVE]), params[P_A_WIDTH], src.data());
    dwt(src.data(), f, c);
    c[0] = 0;
    t.kept = sparsify(c, params[P_A_SPARSITY], t.nonzero);
    double* dry = t.layers.data() + (size_t)DRY * N;
    for (int b = 1; b <= NB; b++) {
      std::fill(band.begin(), band.end(), 0.0);
      for (int i = 1 << (b - 1); i < (1 << b); i++) band[i] = c[i];
      double* dst = t.layers.data() + (size_t)(b - 1) * N;
      idwt(band.data(), f, dst);
      for (int i = 0; i < N; i++) dry[i] += dst[i];
    }
  } else {
    patternCoeffs((int)jsRound(params[P_B_PATTERN]), (int)jsRound(params[P_B_SEED]), c);
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

  t.mips.assign((size_t)NMIP * TW, 0.0f);
  t.rms.assign((size_t)NMIP * NL, 0.0f);
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
      float* dst = t.mips.data() + (size_t)m * TW;
      double e = 0;
      for (int i = 0; i < N; i++) { double v = yr[i] / N; dst[i * NL + L] = (float)v; e += v * v; }
      dst[N * NL + L] = dst[L];
      t.rms[m * NL + L] = (float)std::sqrt(e / N);
    }
  }
}

// ------------------------------------------------------------------ gains & window
inline double softplus(double x) { return x > 10 ? x : std::log(1 + std::exp(4 * x)) / 4; }
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
      double boost = res * std::exp(-d * d / (2 * 0.36));
      att = std::min(att, 140.0);
      g = std::pow(10.0, (boost - att) / 20);
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

inline void staticGains(const double* params, double* out) {
  double fg[NB];
  filterGains((int)jsRound(params[P_F_TYPE]), params[P_F_CUTOFF], params[P_F_SLOPE], params[P_F_RES], fg);
  if ((int)jsRound(params[P_ENGINE]) == 0) { for (int b = 0; b < NB; b++) out[b] = fg[b]; return; }
  double norm = 0;
  for (int b = 0; b < NB; b++) { double bar = params[P_B_BAR1 + b] * std::pow(10.0, params[P_B_TILT] * b / 20); norm += bar; out[b] = bar * fg[b]; }
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

struct Atom { std::vector<double> x; int lo = N, hi = 0; };
inline Atom atomShape(int w) {
  std::vector<double> c(N, 0.0); c[64 + 32] = 1;
  Atom a; a.x.resize(N);
  idwt(c.data(), filter(w), a.x.data());
  for (int i = 0; i < N; i++) if (std::fabs(a.x[i]) > 1e-9) { a.lo = std::min(a.lo, i); a.hi = std::max(a.hi, i); }
  return a;
}

// ------------------------------------------------------------------ engine
struct Env {
  int stage = 0; double level = 0;  // 0 idle, 1 attack, 2 decay/sustain, 3 release
  void gate(bool on) { stage = on ? 1 : (stage ? 3 : 0); }
  double step(int n, double sr, double a, double d, double s, double r) {
    if (stage == 1) { level += n / (a * sr); if (level >= 1) { level = 1; stage = 2; } }
    else if (stage == 2) level = s + (level - s) * std::exp(-n * LN1000 / (d * sr));
    else if (stage == 3) { level *= std::exp(-n * LN1000 / (r * sr)); if (level < 1e-5) { level = 0; stage = 0; } }
    return level;
  }
};

struct Voice {
  bool active = false, gate = false, held = false, fresh = true;
  int note = 60; double vel = 1; uint64_t age = 0;
  double pitch = 60, target = 60, f0 = 261.63;
  bool glide = false;
  int U = 1, mip = 0;
  double phase[4] = {0, 0, 0, 0};
  double subPhase = 0;
  Env amp, mod;
  double scale[NB] = {}; bool scaleAtk[NB] = {};
  double gA[NB] = {}, dA[NB] = {}, gB[NB] = {}, dB[NB] = {}, tA[NB] = {}, tB[NB] = {};
  double pc = 0, pw = 1, pd = 0;
};

struct TableRef { int mode = 0; const float* mips = nullptr; const float* rms = nullptr; const void* owner = nullptr; };

struct Display {
  float gains[NB] = {}; int mode = 0; uint32_t voices = 0; float peakL = 0, peakR = 0;
  float center = 0, width = 1, depth = 0; int note = -1;
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
  uint8_t keys[128] = {};
  Display disp; int lastVoice = -1;
  double sr = 48000, fmax = 29000;

  explicit Engine(double sampleRate = 48000) {
    for (int i = 0; i < kNumParams; i++) p[i] = kParams[i].def;
    setSampleRate(sampleRate);
  }

  void setSampleRate(double s) {
    sr = s;
    fmax = std::max(0.45 * sr, sr - 19000);
    dlyLen = (int)std::ceil(sr * 1.1) + 4;
    dlyL.assign(dlyLen, 0.0f); dlyR.assign(dlyLen, 0.0f);
    dlyW = 0; dlyT = p[P_FX_DTIME] * sr; lpL = lpR = 0;
    const int cT[8] = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617}, aT[4] = {556, 441, 341, 225};
    double sc = sr / 44100;
    for (int ch = 0; ch < 2; ch++) {
      for (int k = 0; k < 8; k++) { Comb& c = combs[ch * 8 + k]; c.buf.assign((size_t)std::lround((cT[k] + ch * 23) * sc), 0.0f); c.i = 0; c.f = 0; }
      for (int k = 0; k < 4; k++) { AP& a = aps[ch * 4 + k]; a.buf.assign((size_t)std::lround((aT[k] + ch * 23) * sc), 0.0f); a.i = 0; }
    }
    vol = std::pow(10.0, p[P_MASTER] / 20);
    dcR = 1 - 2 * PI * 10 / sr; dcxL = dcyL = dcxR = dcyR = 0;
  }

  // Called on deactivation: also forgets the voices' pitch memory so that a render (export, freeze)
  // never glides in from notes played before it.
  void reset() {
    for (auto& v : voices) { v.active = false; v.gate = false; v.held = false; v.amp = Env(); v.mod = Env(); v.age = 0; v.pitch = v.target = 60; }
    counter = 0; lastPitch = 60;
    stackN = 0; std::memset(keys, 0, sizeof keys);
    std::fill(dlyL.begin(), dlyL.end(), 0.0f); std::fill(dlyR.begin(), dlyR.end(), 0.0f);
    for (auto& c : combs) { std::fill(c.buf.begin(), c.buf.end(), 0.0f); c.f = 0; }
    for (auto& a : aps) std::fill(a.buf.begin(), a.buf.end(), 0.0f);
    dcxL = dcyL = dcxR = dcyR = 0;
  }

  void setParam(int id, double v) {
    if (id < 0 || id >= kNumParams) return;
    double old = p[id];
    p[id] = v;
    if (id == P_HOLD && old >= 0.5 && v < 0.5)
      for (auto& vc : voices) if (vc.active && vc.held) { vc.held = false; vc.gate = false; vc.amp.gate(false); vc.mod.gate(false); }
  }

  // Switch tables with a short crossfade. A table that is dropped is reported in released[].
  void setTables(const TableRef& t) {
    if (!hasCur) { cur = t; hasCur = true; fade = 1; return; }
    if (hasPrev && nReleased < 4) released[nReleased++] = prev.owner;
    prev = cur; hasPrev = true; cur = t; fade = 0;
  }

  void noteOn(int note, double vel) {
    if (note < 0 || note > 127) return;
    if (vel <= 0) { noteOff(note); return; }
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
      for (int k = 1; k < MAXV; k++) if (voices[k].active) { voices[k].gate = false; voices[k].amp.gate(false); voices[k].mod.gate(false); }
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

  void noteOff(int note) {
    if (note < 0 || note > 127) return;
    keys[note] = 0;
    bool hold = p[P_HOLD] >= 0.5;
    if ((int)jsRound(p[P_V_VOICES]) <= 1) {
      removeFromStack(note);
      Voice& vc = voices[0];
      if (vc.active && vc.note == note) {
        if (stackN) {
          int n = stack[stackN - 1];
          vc.note = n; vc.target = n; vc.glide = (int)jsRound(p[P_V_PORTA]) != 0;
          if (!vc.glide || p[P_V_GLIDE] <= 0) vc.pitch = n;
          lastPitch = n;
        } else if (hold) vc.held = true;
        else { vc.gate = false; vc.amp.gate(false); vc.mod.gate(false); }
      }
      return;
    }
    for (auto& vc : voices) if (vc.active && vc.gate && vc.note == note) {
      if (hold) vc.held = true; else { vc.gate = false; vc.amp.gate(false); vc.mod.gate(false); }
    }
  }

  void allNotesOff() {
    stackN = 0; std::memset(keys, 0, sizeof keys);
    for (auto& vc : voices) if (vc.active) { vc.gate = false; vc.held = false; vc.amp.gate(false); vc.mod.gate(false); }
  }

  // MIDI CC120: silence immediately (voices and effect tails)
  void allSoundOff() {
    for (auto& vc : voices) { vc.active = vc.gate = vc.held = false; vc.amp = Env(); vc.mod = Env(); }
    stackN = 0; std::memset(keys, 0, sizeof keys);
    std::fill(dlyL.begin(), dlyL.end(), 0.0f); std::fill(dlyR.begin(), dlyR.end(), 0.0f); lpL = lpR = 0;
    for (auto& c : combs) { std::fill(c.buf.begin(), c.buf.end(), 0.0f); c.f = 0; }
    for (auto& a : aps) std::fill(a.buf.begin(), a.buf.end(), 0.0f);
  }

  // Process n samples (any n) into outL/outR (overwrites).
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
  float bufL[CTRL], bufR[CTRL];
  double fg[NB], tmpB[NB], lg[NB], panL[4], panR[4], inc[4], endPhase[4];
  int act[NL];
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
      for (int u = 0; u < 4; u++) vc.phase[u] = std::fmod(u * 0.618034, 1.0);
      vc.subPhase = 0;
      vc.amp.level = 0; vc.mod.level = 0;
      for (int b = 0; b < NB; b++) vc.scale[b] = 0;
      // polyphonic portamento: an idle voice glides from its own last pitch (a never-used voice from the last note)
      vc.pitch = glide > 0 ? (vc.age ? vc.pitch : lastPitch) : note;
    } else if (glide <= 0) vc.pitch = note;
    vc.active = true; vc.gate = true; vc.held = false;
    vc.note = note; vc.target = note; vc.vel = vel;
    vc.age = ++counter;
    if (!legato) { vc.amp.gate(true); vc.mod.gate(true); for (int b = 0; b < NB; b++) vc.scaleAtk[b] = true; }
    lastPitch = note;
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
    lfoPhase += p[P_LFO_RATE] * n / sr;
    if (lfoPhase >= 1) { lfoPhase -= std::floor(lfoPhase); sh = lfoRng.next() * 2 - 1; }
  }

  void control(Voice& vc, int n) {
    double glide = vc.glide ? p[P_V_GLIDE] : 0;
    if (glide > 0 && vc.pitch != vc.target) {
      vc.pitch += (vc.target - vc.pitch) * (1 - std::exp(-n * 4.6 / (glide * sr)));
      if (std::fabs(vc.target - vc.pitch) < 1e-3) vc.pitch = vc.target;
    } else vc.pitch = vc.target;
    double semis = vc.pitch + 12 * p[P_V_OCT] + p[P_V_FINE] / 100 + 2 * p[P_BEND] + lfo * (p[P_LFO_PITCH] + 50 * p[P_MODWHEEL]) / 100;
    double f0 = 440 * std::pow(2.0, (semis - 69) / 12);
    vc.f0 = f0;
    int U = (int)jsRound(p[P_V_UNISON]); double det = p[P_V_DETUNE];
    vc.U = std::max(1, std::min(4, U));
    double fTop = f0 * std::pow(2.0, (vc.U > 1 ? det : 0) / 1200);
    double maxH = std::floor(fmax / fTop);
    vc.mip = maxH >= 1024 ? 0 : maxH < 1 ? NMIP - 1 : std::min(NMIP - 1, (int)std::ceil(std::log2(1024 / maxH) - 1e-9));

    double mod = vc.mod.step(n, sr, p[P_MOD_A], p[P_MOD_D], p[P_MOD_S], p[P_MOD_R]);
    double cut = p[P_F_CUTOFF] + (1 - p[P_F_KEYTRK]) * std::log2(261.63 / f0) + p[P_F_ENV] * mod + p[P_LFO_CUT] * lfo + p[P_F_VEL] * (vc.vel - 1);
    filterGains((int)jsRound(p[P_F_TYPE]), cut, p[P_F_SLOPE], p[P_F_RES], fg);

    double norm = 0;
    double atk = p[P_B_ATK], spread = p[P_B_SPREAD], body = p[P_B_BODY], bright = p[P_B_BRIGHT], sus = p[P_B_SUS];
    for (int b = 0; b < NB; b++) {
      double bar = p[P_B_BAR1 + b] * std::pow(10.0, p[P_B_TILT] * b / 20);
      norm += bar;
      double t = b / 10.0, lv = vc.scale[b];
      if (vc.scaleAtk[b]) {
        lv += n / (atk * std::pow(16.0, spread * (t - 0.5)) * sr);
        if (lv >= 1) { lv = 1; vc.scaleAtk[b] = false; }
      } else {
        double dt = body * std::pow(bright / body, t);
        lv = sus + (lv - sus) * std::exp(-n * LN1000 / (dt * sr));
      }
      vc.scale[b] = lv;
      tmpB[b] = bar * lv * fg[b];
    }
    norm = std::max(1.0, norm);
    for (int b = 0; b < NB; b++) {
      double tA = fg[b], tB = tmpB[b] / norm;
      if (vc.fresh) { vc.gA[b] = tA; vc.gB[b] = tB; }
      vc.tA[b] = tA; vc.tB[b] = tB;
      vc.dA[b] = (tA - vc.gA[b]) / n; vc.dB[b] = (tB - vc.gB[b]) / n;
    }
    vc.fresh = false;
    double pc = p[P_P_CENTER] + p[P_LFO_POS] * lfo; pc -= std::floor(pc);
    vc.pc = pc;
    vc.pw = std::min(1.0, std::max(p[P_P_WIDTH], 16 * fTop / sr));
    vc.pd = p[P_P_DEPTH];
  }

  void renderVoice(const Voice& vc, int n, const TableRef& t, double fade0, double fadeInc, bool invert) {
    const int mode = t.mode; const float* mips = t.mips; const float* rms = t.rms;
    const size_t off = (size_t)vc.mip * TW;
    const double* g = mode == 0 ? vc.gA : vc.gB; const double* dg = mode == 0 ? vc.dA : vc.dB;
    // A fundamental at or above Nyquist can only alias: the wavetable part of such a voice stays silent.
    const bool audible = vc.f0 < 0.5 * sr;
    int na = 0;
    if (audible)
      for (int b = 0; b < NB; b++)
        if (rms[vc.mip * NL + b] > 1e-7f && (std::fabs(g[b]) > 1e-6 || std::fabs(g[b] + dg[b] * n) > 1e-6)) act[na++] = b;
    const int U = vc.U;
    const bool useDry = audible && mode == 0 && vc.pd > 0;
    const double det = p[P_V_DETUNE], width = p[P_V_WIDTH], uGain = 1 / std::sqrt((double)U);
    for (int u = 0; u < U; u++) {
      double pos = U > 1 ? 2.0 * u / (U - 1) - 1 : 0;
      inc[u] = vc.f0 * std::pow(2.0, det * pos / 1200) / sr;
      double th = (pos * width + 1) * PI / 4;
      panL[u] = std::sqrt(2.0) * std::cos(th) * uGain; panR[u] = std::sqrt(2.0) * std::sin(th) * uGain;
      endPhase[u] = vc.phase[u];
    }
    for (int b = 0; b < NB; b++) lg[b] = g[b];
    const double pc = vc.pc, pw = vc.pw, pd = vc.pd;
    double lev = vc.amp.level; int st = vc.amp.stage;
    const double s = p[P_AMP_S];
    const double aInc = 1 / (p[P_AMP_A] * sr), dC = std::exp(-LN1000 / (p[P_AMP_D] * sr)), rC = std::exp(-LN1000 / (p[P_AMP_R] * sr));
    const double velGain = VOICE_GAIN * (1 - p[P_AMP_VEL] * (1 - vc.vel));
    // sub oscillator: one per voice (not per unison voice), centred, not filtered
    const double subLvl = p[P_SUB_LEVEL];
    const double subInc = vc.f0 * ((int)jsRound(p[P_SUB_OCT]) == 1 ? 0.25 : 0.5) / sr;
    const bool subOn = subLvl > 0 && subInc < 0.5;   // silent when it would alias (above Nyquist)
    const int subShape = (int)jsRound(p[P_SUB_SHAPE]);
    double sph = vc.subPhase;
    double fade = fade0;
    for (int i = 0; i < n; i++) {
      for (int j = 0; j < na; j++) { int b = act[j]; lg[b] += dg[b]; }
      if (st == 1) { lev += aInc; if (lev >= 1) { lev = 1; st = 2; } }
      else if (st == 2) lev = s + (lev - s) * dC;
      else if (st == 3) { lev *= rC; if (lev < 1e-5) { lev = 0; st = 0; } }
      double fg1 = fade >= 1 ? 1 : fade;
      double env = lev * velGain * (invert ? 1 - fg1 : fg1);
      fade += fadeInc;
      double oL = 0, oR = 0;
      for (int u = 0; u < U; u++) {
        double x = endPhase[u] + inc[u];
        if (x >= 1) x -= std::floor(x);   // keeps the table row inside [0, N) even for steps longer than a cycle
        endPhase[u] = x;
        double pos = x * N; int i0 = (int)pos; double fr = pos - i0;
        const float* base = mips + off + (size_t)i0 * NL; const float* nx = base + NL;
        double y;
        if (mode == 0) {
          double sum = 0;
          for (int j = 0; j < na; j++) { int b = act[j]; double v0 = base[b]; sum += lg[b] * (v0 + fr * (nx[b] - v0)); }
          if (useDry) {
            double v0 = base[DRY], dry = v0 + fr * (nx[DRY] - v0);
            y = dry + windowValue(x, pc, pw, pd) * (sum - dry);
          } else y = sum;
        } else {
          double first = 0, sum = 0;
          for (int j = 0; j < na; j++) {
            int b = act[j]; double v0 = base[b]; double v = lg[b] * (v0 + fr * (nx[b] - v0));
            if (b == 0) first = v; else sum += v;
          }
          y = pd > 0 ? first + windowValue(x, pc, pw, pd) * sum : first + sum;
        }
        oL += y * panL[u]; oR += y * panR[u];
      }
      if (subOn) {
        sph += subInc; if (sph >= 1) sph -= std::floor(sph);
        double sv = subLvl * subWave(sph, subInc, subShape);
        oL += sv; oR += sv;
      }
      bufL[i] += (float)(oL * env); bufR[i] += (float)(oR * env);
    }
    endLevel = lev; endStage = st; endSubPhase = sph;
  }

  void block(float* outL, float* outR, int o, int n) {
    std::fill(bufL, bufL + n, 0.0f); std::fill(bufR, bufR + n, 0.0f);
    lfoTick(n);
    uint32_t vmask = 0;
    const bool fading = hasPrev;
    const double fadeInc = fading ? 1.0 / 512 : 0, fade0 = fading ? fade : 1;
    for (int k = 0; k < MAXV; k++) {
      Voice& vc = voices[k];
      if (!vc.active || !hasCur) continue;
      control(vc, n);
      if (fading) renderVoice(vc, n, prev, fade0, fadeInc, true);
      renderVoice(vc, n, cur, fade0, fadeInc, false);
      vc.amp.level = endLevel; vc.amp.stage = endStage;
      for (int u = 0; u < 4; u++) vc.phase[u] = endPhase[u];
      vc.subPhase = endSubPhase;
      std::memcpy(vc.gA, vc.tA, sizeof vc.gA); std::memcpy(vc.gB, vc.tB, sizeof vc.gB);
      if (vc.amp.stage == 0) { vc.active = false; vc.gate = false; continue; }
      vmask |= 1u << k;
    }
    if (fading) {
      fade += n * fadeInc;
      if (fade >= 1) { fade = 1; hasPrev = false; if (nReleased < 4) released[nReleased++] = prev.owner; }
    }

    // effects
    const double drive = p[P_FX_DRIVE], kd = std::pow(10.0, drive * 24 / 20), comp = 0.5 / std::tanh(0.5 * kd);
    const double fb = p[P_FX_DFB], dmix = p[P_FX_DMIX], rmix = p[P_FX_RMIX];
    const double dTarget = p[P_FX_DTIME] * sr;
    const double feedback = 0.7 + 0.28 * p[P_FX_RSIZE], damp = 0.25;
    const double volT = std::pow(10.0, p[P_MASTER] / 20);
    float pkL = disp.peakL, pkR = disp.peakR;
    for (int i = 0; i < n; i++) {
      double l = bufL[i], r = bufR[i];
      if (drive > 0) {
        l = (1 - drive) * l + drive * std::tanh(kd * l) * comp;
        r = (1 - drive) * r + drive * std::tanh(kd * r) * comp;
      }
      dlyT += (dTarget - dlyT) * 0.0005;
      if (dmix > 0 || fb > 0) {
        double rp = dlyW - dlyT; if (rp < 0) rp += dlyLen;
        int i0 = (int)rp; double fr = rp - i0; int i1 = (i0 + 1) % dlyLen;
        double dl = dlyL[i0] + fr * (dlyL[i1] - dlyL[i0]);
        double dr = dlyR[i0] + fr * (dlyR[i1] - dlyR[i0]);
        lpL += (dl - lpL) * 0.35; lpR += (dr - lpR) * 0.35;
        dlyL[dlyW] = (float)(0.5 * (bufL[i] + bufR[i]) + fb * lpR);
        dlyR[dlyW] = (float)(fb * lpL);
        l += dmix * dl; r += dmix * dr;
      } else { dlyL[dlyW] = 0; dlyR[dlyW] = 0; }
      if (++dlyW >= dlyLen) dlyW = 0;
      if (rmix > 0) {
        double inp = (l + r) * 0.015, wl = 0, wr = 0;
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
        l += rmix * wl * 1.5; r += rmix * wr * 1.5;
      }
      // DC blocker (10 Hz), master volume, soft limiter
      double yl = l - dcxL + dcR * dcyL; dcxL = l; dcyL = std::fabs(yl) < 1e-20 ? 0 : yl; l = dcyL;
      double yr = r - dcxR + dcR * dcyR; dcxR = r; dcyR = std::fabs(yr) < 1e-20 ? 0 : yr; r = dcyR;
      vol += (volT - vol) * 0.002;
      l = softLimit(l * vol); r = softLimit(r * vol);
      if (!std::isfinite(l)) l = 0;
      if (!std::isfinite(r)) r = 0;
      outL[o + i] = (float)l; outR[o + i] = (float)r;
      pkL = std::max(pkL, (float)std::fabs(l)); pkR = std::max(pkR, (float)std::fabs(r));
    }
    disp.peakL = pkL; disp.peakR = pkR; disp.voices = vmask;
    disp.mode = hasCur ? cur.mode : (int)jsRound(p[P_ENGINE]);
    if (lastVoice >= 0 && voices[lastVoice].active) {
      const Voice& lv = voices[lastVoice];
      const double* g = disp.mode == 0 ? lv.gA : lv.gB;
      for (int b = 0; b < NB; b++) disp.gains[b] = (float)g[b];
      disp.center = (float)lv.pc; disp.width = (float)lv.pw; disp.depth = (float)lv.pd; disp.note = lv.note;
    } else disp.note = -1;
  }
};

}  // namespace ws
