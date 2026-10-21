// The cost of the plug-in's builder thread polling loop (plugin.cpp startWorker: sleep_for(3 ms) when nothing to do) measured as process CPU
// time over 5 s, for N such threads (N instances), with the 1 ms timer resolution a DAW sets (timeBeginPeriod), and with a
// condition-variable wait for comparison.
#include <windows.h>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdio>
#include <mutex>
#include <thread>
#include <vector>
#pragma comment(lib, "winmm.lib")
static double cpuSeconds() { ULONG64 c = 0; QueryProcessCycleTime(GetCurrentProcess(), &c); return (double)c; }
int main(int argc, char** argv) {
  const int N = argc > 1 ? atoi(argv[1]) : 1;
  const int ms = argc > 2 ? atoi(argv[2]) : 3;
  timeBeginPeriod(1);
  // calibrate cycles per second with a busy loop on one thread
  LARGE_INTEGER f, a, b; QueryPerformanceFrequency(&f);
  const double c0 = cpuSeconds(); QueryPerformanceCounter(&a);
  do { QueryPerformanceCounter(&b); } while ((b.QuadPart - a.QuadPart) * 1000.0 / f.QuadPart < 300);
  const double hz = (cpuSeconds() - c0) / 0.3;
  std::atomic<bool> quit{false};
  std::vector<std::thread> th;
  for (int i = 0; i < N; i++) th.emplace_back([&] { while (!quit.load()) std::this_thread::sleep_for(std::chrono::milliseconds(ms)); });
  const double s0 = cpuSeconds(); QueryPerformanceCounter(&a);
  Sleep(5000);
  QueryPerformanceCounter(&b); const double s1 = cpuSeconds();
  quit.store(true); for (auto& t : th) t.join();
  const double secs = (double)(b.QuadPart - a.QuadPart) / f.QuadPart, cpu = (s1 - s0) / hz;
  std::printf("%d threads polling every %d ms: %.4f %% of one core in all, %.4f %% per thread (%.0f wake-ups/s per thread)\n", N, ms, 100 * cpu / secs, 100 * cpu / secs / N, 1000.0 / ms);
  // condition variable: no wake-ups
  std::mutex m; std::condition_variable cv; bool go = false; quit.store(false);
  std::vector<std::thread> th2;
  for (int i = 0; i < N; i++) th2.emplace_back([&] { std::unique_lock<std::mutex> lk(m); cv.wait(lk, [&] { return go; }); });
  const double t0 = cpuSeconds(); Sleep(2000); const double t1 = cpuSeconds();
  { std::lock_guard<std::mutex> lk(m); go = true; } cv.notify_all(); for (auto& t : th2) t.join();
  std::printf("%d threads waiting on a condition variable: %.4f %% of one core in all\n", N, 100 * (t1 - t0) / hz / 2.0);
  timeEndPeriod(1);
  return 0;
}
