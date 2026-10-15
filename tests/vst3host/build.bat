@echo off
rem Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
rem SPDX-License-Identifier: GPL-3.0-or-later
rem Builds tests\vst3host\vst3host.exe with llvm-mingw (static, no extra DLLs).
rem Override the compiler with:  set CXX=path\to\x86_64-w64-mingw32-clang++.exe
setlocal
set "HERE=%~dp0"
set "PROJ=%HERE%..\.."
if "%CXX%"=="" set "CXX=%USERPROFILE%\tools\llvm-mingw\bin\x86_64-w64-mingw32-clang++.exe"
if not exist "%CXX%" (
  echo Compiler not found: %CXX%
  exit /b 1
)
if not exist "%HERE%obj" mkdir "%HERE%obj"
echo Building vst3host.exe ...
rem Steinberg FUID implementation (third-party file: warnings silenced)
"%CXX%" -std=c++17 -O2 -w -I "%PROJ%\vst\external" -c "%PROJ%\vst\external\pluginterfaces\base\funknown.cpp" -o "%HERE%obj\funknown.o"
if errorlevel 1 goto failed
"%CXX%" -std=c++17 -O2 -g -fms-extensions -Wall -Wno-pragma-pack -Wno-unused-variable -Wno-unused-but-set-variable ^
  -I "%PROJ%\vst\external" ^
  "%HERE%host.cpp" "%HERE%obj\funknown.o" ^
  -o "%HERE%vst3host.exe" -static ^
  -lole32 -loleaut32 -luuid -lgdiplus -lgdi32 -luser32 -lpsapi -ldbghelp -lshell32 -lversion
if errorlevel 1 goto failed
echo OK: %HERE%vst3host.exe
exit /b 0
:failed
echo BUILD FAILED
exit /b 1
