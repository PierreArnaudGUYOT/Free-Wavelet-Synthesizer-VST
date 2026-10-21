#!/bin/bash
# Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds the macOS test host (universal, so that it also runs the Intel half of the plug-in under Rosetta).
#   tests/machost/build.sh  ->  build/mac/machost
#   build/mac/machost build/mac/OktoMultiWaveSynth.vst3 <outdir>          (Apple silicon)
#   arch -x86_64 build/mac/machost build/mac/OktoMultiWaveSynth.vst3 <outdir>   (Intel half)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
mkdir -p "$ROOT/build/mac"
ARCHFLAGS=()
for a in ${ARCHS:-arm64 x86_64}; do ARCHFLAGS+=(-arch "$a"); done
clang++ -std=c++17 -O1 -fobjc-arc -Wall -Wno-unused-parameter -Wno-deprecated-declarations -mmacosx-version-min=10.13 "${ARCHFLAGS[@]}" \
  -I"$ROOT/vst/external" -I"$ROOT/vst/src" "$HERE/machost.mm" "$ROOT/vst/src/iids.cpp" "$ROOT/vst/external/pluginterfaces/base/funknown.cpp" \
  -o "$ROOT/build/mac/machost" -framework Cocoa -framework CoreFoundation
echo "OK: $ROOT/build/mac/machost"
