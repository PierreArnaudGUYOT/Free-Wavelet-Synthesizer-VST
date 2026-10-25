@echo off
rem Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
rem SPDX-License-Identifier: GPL-3.0-or-later
rem Copies the built plugin bundle to the standard VST3 folder (asks for administrator rights).
rem No path is ever pasted into a command line: the elevated step simply runs this same file again
rem (PowerShell receives the file name as a value, so folder names with ' & ( ) are harmless).
setlocal
set "SRC=%~dp0..\build\WaveletSynthesizer.vst3"
set "DST=C:\Program Files\Common Files\VST3"
if not exist "%SRC%" ( echo Build first: run build.bat & exit /b 1 )
if /i "%~1"=="/elevated" goto copy
net session >nul 2>&1 && goto copy
set "WS_SELF=%~f0"
powershell -NoProfile -Command "Start-Process -Verb RunAs -Wait -FilePath $env:WS_SELF -ArgumentList '/elevated'"
goto report

:copy
if not exist "%DST%" mkdir "%DST%"
xcopy /E /I /Y /Q "%SRC%" "%DST%\WaveletSynthesizer.vst3" >nul
if /i "%~1"=="/elevated" exit /b

:report
if exist "%DST%\WaveletSynthesizer.vst3\Contents\x86_64-win\WaveletSynthesizer.vst3" (
  echo Installed to %DST%\WaveletSynthesizer.vst3
  echo In Ableton Live: Preferences ^> Plug-ins ^> enable "Use VST3 Plug-in System Folders" ^> Rescan.
) else echo Installation was cancelled or failed.
