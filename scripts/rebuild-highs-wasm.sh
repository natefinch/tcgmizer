#!/usr/bin/env bash
#
# Rebuild highs.wasm with a larger stack size using Docker + Emscripten.
#
# The pre-built highs.wasm from npm (v1.8.0) was compiled with only 64KB of
# stack, which causes "Aborted()" crashes on large ILP models. The upstream
# fix (PR #43) increased it to 4MB but was never released. We build with 256MB
# to handle large TCGmizer carts with min-vendors constraints.
#
# Prerequisites: Docker
# Output: dist/highs.js and dist/highs.wasm
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STACK_SIZE="${STACK_SIZE:-268435456}"  # 256MB default, override with env var

echo "=== Rebuilding highs.wasm with STACK_SIZE=${STACK_SIZE} ==="

# Use a temp directory for the build
BUILD_DIR=$(mktemp -d)
trap "rm -rf '$BUILD_DIR'" EXIT

echo "--- Cloning highs-js (main branch with stack fix)..."
git clone --depth 1 --recurse-submodules https://github.com/lovasoa/highs-js.git "$BUILD_DIR/highs-js"

# Override STACK_SIZE in build.sh
echo "--- Patching build.sh with STACK_SIZE=${STACK_SIZE}..."
sed -i.bak "s/STACK_SIZE=[0-9]*/STACK_SIZE=${STACK_SIZE}/" "$BUILD_DIR/highs-js/build.sh"

# If STACK_SIZE > INITIAL_MEMORY (default 16MB), we must also raise INITIAL_MEMORY.
# Emscripten requires INITIAL_MEMORY >= STACK_SIZE + data segment size.
# ALLOW_MEMORY_GROWTH is already set, so this is just the starting size.
INITIAL_MEMORY=$((STACK_SIZE > 16777216 ? STACK_SIZE * 2 : 0))
if [ "$INITIAL_MEMORY" -gt 0 ]; then
  echo "--- Also setting INITIAL_MEMORY=${INITIAL_MEMORY} (STACK_SIZE exceeds 16MB default)..."
  sed -i.bak "s/ALLOW_MEMORY_GROWTH=1/ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=${INITIAL_MEMORY}/" "$BUILD_DIR/highs-js/build.sh"
fi

echo "--- Building with Docker (emscripten/emsdk)..."
docker run --rm \
  -v "$BUILD_DIR/highs-js:/src" \
  -w /src \
  emscripten/emsdk:3.1.51 \
  bash -c "bash build.sh"

# Copy output to dist/
echo "--- Copying build output to dist/..."
cp "$BUILD_DIR/highs-js/build/highs.js" "$PROJECT_DIR/dist/highs.js"
cp "$BUILD_DIR/highs-js/build/highs.wasm" "$PROJECT_DIR/dist/highs.wasm"

# Show sizes
echo ""
echo "=== Build complete ==="
ls -lh "$PROJECT_DIR/dist/highs.js" "$PROJECT_DIR/dist/highs.wasm"
echo ""
echo "Stack size: ${STACK_SIZE} bytes ($((STACK_SIZE / 1024 / 1024)) MB)"
