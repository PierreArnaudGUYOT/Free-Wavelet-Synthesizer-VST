@echo off
rem Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
rem SPDX-License-Identifier: GPL-3.0-or-later
rem Builds the self-test reference plug-in (NOT the product):
rem   tests\vst3host\selftest\build\DummySynth.vst3\Contents\x86_64-win\DummySynth.vst3
setlocal
set "HERE=%~dp0"
set "PROJ=%HERE%..\..\.."
if "%CXX%"=="" set "CXX=%USERPROFILE%\tools\llvm-mingw\bin\x86_64-w64-mingw32-clang++.exe"
set "OUT=%HERE%build\DummySynth.vst3\Contents\x86_64-win"
if not exist "%OUT%" mkdir "%OUT%"
if not exist "%HERE%build\obj" mkdir "%HERE%build\obj"
"%CXX%" -std=c++17 -O2 -w -I "%PROJ%\vst\external" -c "%PROJ%\vst\external\pluginterfaces\base\funknown.cpp" -o "%HERE%build\obj\funknown.o"
if errorlevel 1 goto failed
"%CXX%" -std=c++17 -O2 -Wall -Wno-pragma-pack -shared -I "%PROJ%\vst\external" ^
  "%HERE%dummysynth.cpp" "%HERE%build\obj\funknown.o" ^
  -o "%OUT%\DummySynth.vst3" -static -lole32 -lgdi32 -luser32
if errorlevel 1 goto failed
echo OK: %OUT%\DummySynth.vst3
exit /b 0
:failed
echo BUILD FAILED
exit /b 1
