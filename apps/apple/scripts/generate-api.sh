#!/usr/bin/env bash
# Generates the Swift API client from openapi.json into PulselingKit/Sources/PulselingAPI/Generated (not in git).
# Run after checkout and after every openapi.json change (UPDATE_OPENAPI=1 pnpm test updates openapi.json).
# Needs a Swift toolchain (macOS with Xcode, or Linux). First run builds the generator, ~2 minutes; later runs are quick.
set -euo pipefail

GENERATOR_VERSION=1.14.4
here="$(cd "$(dirname "$0")/.." && pwd)"
api="$here/Packages/PulselingKit/Sources/PulselingAPI"
tool="$here/.build/swift-openapi-generator-$GENERATOR_VERSION"

if [ ! -d "$tool" ]; then
  git clone --quiet --depth 1 --branch "$GENERATOR_VERSION" https://github.com/apple/swift-openapi-generator "$tool"
fi

rm -rf "$api/Generated"
mkdir -p "$api/Generated"
swift run --quiet -c release --package-path "$tool" swift-openapi-generator generate \
  "$api/openapi.json" --config "$api/openapi-generator-config.yaml" --output-directory "$api/Generated"
echo "Generated: $(ls "$api/Generated" | tr '\n' ' ')"
