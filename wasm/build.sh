#!/bin/sh
# Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
# SPDX-License-Identifier: GPL-3.0-or-later
# WebAssembly prototype: builds the C++ engine (vst/src/dsp.h) into wasm/out/engine_scalar.wasm and wasm/out/engine_simd.wasm, then writes
# web/js/engine_wasm_data.js (the SIMD module in base64, so that the web app loads it from file://).
#   sh wasm/build.sh            (WASI_SDK = the wasi-sdk folder, default C:/Users/Pierra/tools/wasi-sdk; NODE = node)
# Flags: the parity rules of CLAUDE.md 3.6 (-ffp-contract=off, no fast-math), no exceptions, no threads, a reactor (no main).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="${WASI_SDK:-C:/Users/Pierra/tools/wasi-sdk}"
NODE="${NODE:-C:/Users/Pierra/tools/node/node.exe}"
[ -x "$NODE" ] || NODE=node
CXX="$SDK/bin/clang++.exe"
[ -x "$CXX" ] || CXX="$SDK/bin/clang++"
mkdir -p "$HERE/out"
COMMON="--target=wasm32-wasip1 --sysroot=$SDK/share/wasi-sysroot -std=c++17 -O3 -ffp-contract=off -fno-exceptions -fno-rtti -mexec-model=reactor \
  -Wl,--no-entry -Wl,--strip-all -Wl,-z,stack-size=262144 -Wl,--initial-memory=134217728"
# (128 MB from the start: the two table sets of the heaviest preset during their crossfade, 2 x 53 MB, fit without growing the memory on the audio thread)
build() {   # $1 = name, $2 = extra flags
  "$CXX" $COMMON $2 "$HERE/engine_wasm.cpp" -o "$HERE/out/engine_$1.wasm"
  echo "engine_$1.wasm: $(wc -c < "$HERE/out/engine_$1.wasm") bytes"
}
build scalar ""
build simd "-msimd128"
"$NODE" "$HERE/embed.js"
