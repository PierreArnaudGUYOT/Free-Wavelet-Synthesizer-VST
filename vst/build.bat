@echo off
rem Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
rem SPDX-License-Identifier: GPL-3.0-or-later
rem ---------------------------------------------------------------------------
rem  Okto MultiWave Synth - builds the plugin bundle (Windows x64): VST3, with a VST2 copy of the same DLL inside.
rem  Needs only the portable llvm-mingw toolchain (no Visual Studio, no CMake):
rem    https://github.com/mstorsjo/llvm-mingw/releases  (ucrt-x86_64 zip)
rem  Set LLVM_MINGW to its folder, or keep the default below.
rem  Output: ..\build\OktoMultiWaveSynth.vst3   (copy the folder into a VST3 or a VST2 plug-in folder)
rem ---------------------------------------------------------------------------
setlocal
if "%LLVM_MINGW%"=="" set "LLVM_MINGW=%USERPROFILE%\tools\llvm-mingw"
set "BIN=%LLVM_MINGW%\bin"
if not exist "%BIN%\x86_64-w64-mingw32-clang++.exe" (
  echo [error] llvm-mingw not found in "%LLVM_MINGW%". Set LLVM_MINGW to the extracted folder.
  exit /b 1
)
set "PATH=%BIN%;%PATH%"
set "HERE=%~dp0"
set "ROOT=%HERE%.."
set "OUT=%ROOT%\build"
set "OBJ=%OUT%\obj"
set "BUNDLE=%OUT%\OktoMultiWaveSynth.vst3"
if not exist "%OBJ%" mkdir "%OBJ%"

where node >nul 2>nul && (
  echo [1/4] regenerating spec.h from tools\spec.js
  node "%ROOT%\tools\gen_spec.js" || exit /b 1
)

set "FLAGS=-std=c++17 -O2 -DNDEBUG -Wall -Wno-unknown-pragmas -Wno-unused-parameter -Wno-pragma-pack -Wno-format -DUNICODE -D_UNICODE -DNOMINMAX -ffp-contract=off -I"%HERE%external" -I"%HERE%src""
echo [2/4] compiling
for %%F in (plugin editor editor_win iids vst2) do (
  x86_64-w64-mingw32-clang++ %FLAGS% -c "%HERE%src\%%F.cpp" -o "%OBJ%\%%F.o" || exit /b 1
)
x86_64-w64-mingw32-clang++ %FLAGS% -c "%HERE%external\pluginterfaces\base\funknown.cpp" -o "%OBJ%\funknown.o" || exit /b 1
x86_64-w64-mingw32-windres "%HERE%src\version.rc" -O coff -o "%OBJ%\version.o" || exit /b 1

echo [3/4] linking
if not exist "%BUNDLE%\Contents\x86_64-win" mkdir "%BUNDLE%\Contents\x86_64-win"
x86_64-w64-mingw32-clang++ -shared -static -s -o "%BUNDLE%\Contents\x86_64-win\OktoMultiWaveSynth.vst3" ^
  "%OBJ%\plugin.o" "%OBJ%\editor.o" "%OBJ%\editor_win.o" "%OBJ%\iids.o" "%OBJ%\vst2.o" "%OBJ%\funknown.o" "%OBJ%\version.o" ^
  -lgdiplus -lgdi32 -luser32 -lshell32 -lole32 -luuid -lcomdlg32 || exit /b 1
rem the same DLL as a VST2 plug-in: hosts scanning a VST2 folder find this .dll inside the bundle folder
copy /Y "%BUNDLE%\Contents\x86_64-win\OktoMultiWaveSynth.vst3" "%BUNDLE%\Contents\x86_64-win\OktoMultiWaveSynth.dll" >nul || exit /b 1

echo [4/4] copying the manual and licences into the bundle
rem the manual folder is replaced, not merged: the manuals of 1.0.5 (manual-a.html, manual-b.html, img\) must not linger in a bundle built before
if exist "%BUNDLE%\Contents\Resources\manual" rmdir /S /Q "%BUNDLE%\Contents\Resources\manual"
mkdir "%BUNDLE%\Contents\Resources\manual"
xcopy /E /I /Y /Q "%ROOT%\web\manual" "%BUNDLE%\Contents\Resources\manual" >nul
copy /Y "%ROOT%\LICENSE" "%BUNDLE%\Contents\Resources\LICENSE.txt" >nul
copy /Y "%HERE%external\pluginterfaces\LICENSE.txt" "%BUNDLE%\Contents\Resources\THIRD-PARTY-VST3-INTERFACES-LICENSE.txt" >nul

echo.
echo Done: %BUNDLE%
echo Install: copy the whole OktoMultiWaveSynth.vst3 folder into your VST3 folder ("C:\Program Files\Common Files\VST3",
echo          or run install.bat) or into your VST2 plug-in folder: it works in both.
endlocal
