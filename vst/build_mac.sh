#!/bin/bash
# Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
# SPDX-License-Identifier: GPL-3.0-or-later
# ---------------------------------------------------------------------------
#  Okto MultiWave Synth - builds the macOS plug-in bundle: VST3, one universal binary (Apple silicon + Intel).
#  Needs the Xcode command line tools (clang); Node.js, when present, regenerates the spec first.
#  Output: ../build/mac/OktoMultiWaveSynth.vst3   (copy it into ~/Library/Audio/Plug-Ins/VST3)
#  The bundle is signed "ad hoc" (no Apple developer account): see INSTALL-mac.txt for the first start.
#  ARCHS="arm64" vst/build_mac.sh builds one architecture only (faster, for tests).
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
OUT="$ROOT/build/mac"
OBJ="$OUT/obj"
BUNDLE="$OUT/OktoMultiWaveSynth.vst3"
ARCHFLAGS=()
for a in ${ARCHS:-arm64 x86_64}; do ARCHFLAGS+=(-arch "$a"); done
MINOS=-mmacosx-version-min=10.13
VERSION=$(sed -n 's/^#define WS_VERSION "\([^"]*\)".*/\1/p' "$HERE/src/common.h")

if command -v node >/dev/null 2>&1; then
  echo "[1/5] regenerating spec.h from tools/spec.js"
  node "$ROOT/tools/gen_spec.js"
fi

# -ffp-contract=off: no fused multiply-add, so that the sound stays identical to the web engine (tools/dsp_compare.js)
FLAGS=(-std=c++17 -O2 -DNDEBUG -Wall -Wno-unknown-pragmas -Wno-unused-parameter -ffp-contract=off -fvisibility=hidden
       -fvisibility-inlines-hidden "$MINOS" "${ARCHFLAGS[@]}" -I"$HERE/external" -I"$HERE/src")
echo "[2/5] compiling ($VERSION, ${ARCHS:-arm64 x86_64})"
rm -rf "$OBJ"; mkdir -p "$OBJ"
for f in plugin editor iids; do clang++ "${FLAGS[@]}" -c "$HERE/src/$f.cpp" -o "$OBJ/$f.o"; done
clang++ "${FLAGS[@]}" -fobjc-arc -c "$HERE/src/editor_mac.mm" -o "$OBJ/editor_mac.o"
clang++ "${FLAGS[@]}" -Wno-deprecated-declarations -c "$HERE/external/pluginterfaces/base/funknown.cpp" -o "$OBJ/funknown.o"

echo "[3/5] linking"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources"
clang++ "${ARCHFLAGS[@]}" "$MINOS" -bundle -o "$BUNDLE/Contents/MacOS/OktoMultiWaveSynth" "$OBJ"/*.o \
  -framework Cocoa -framework CoreText -framework CoreGraphics -framework CoreFoundation -dead_strip \
  -Wl,-exported_symbol,_GetPluginFactory -Wl,-exported_symbol,_bundleEntry -Wl,-exported_symbol,_bundleExit
strip -x "$BUNDLE/Contents/MacOS/OktoMultiWaveSynth"

echo "[4/5] Info.plist, manuals and licences"
cat > "$BUNDLE/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>English</string>
  <key>CFBundleExecutable</key><string>OktoMultiWaveSynth</string>
  <key>CFBundleIdentifier</key><string>com.oktopierre.oktomultiwavesynth.vst3</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>Okto Fractal Wavelet</string>
  <key>CFBundlePackageType</key><string>BNDL</string>
  <key>CFBundleSignature</key><string>????</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>NSHumanReadableCopyright</key><string>Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre). GPL-3.0-or-later.</string>
</dict>
</plist>
EOF
printf 'BNDL????' > "$BUNDLE/Contents/PkgInfo"
mkdir -p "$BUNDLE/Contents/Resources/manual"
cp -R "$ROOT/web/manual/." "$BUNDLE/Contents/Resources/manual/"
cp "$ROOT/LICENSE" "$BUNDLE/Contents/Resources/LICENSE.txt"
cp "$HERE/external/pluginterfaces/LICENSE.txt" "$BUNDLE/Contents/Resources/THIRD-PARTY-VST3-INTERFACES-LICENSE.txt"

echo "[5/5] ad-hoc signature"
codesign --force --sign - --timestamp=none "$BUNDLE"
codesign --verify --strict "$BUNDLE"
lipo -info "$BUNDLE/Contents/MacOS/OktoMultiWaveSynth"
echo
echo "Done: $BUNDLE"
echo "Install: copy OktoMultiWaveSynth.vst3 into ~/Library/Audio/Plug-Ins/VST3 (your own plug-in folder: the presets file is"
echo "         written next to it), then rescan the plug-ins in your DAW."
