#!/usr/bin/env bash
# Builds the Unicorn TCI WASM engine used by the browser-side SAP signer.
#
# Unicorn 2.x only ships JIT TCG backends, which cannot run under WebAssembly.
# This script clones Unicorn 2.1.4, applies patches/unicorn-2.1.4-tci-wasm.patch
# (restores the QEMU 5.0 TCI interpreter, forces 64-bit virtual registers on
# wasm32, adds uniform-signature helper trampolines, and adapts glib- compat
# comparators for wasm's strict indirect-call checks), then cross-compiles with
# emscripten and links the JS glue into:
#   ../src/apple/sap/vendor/unicorn.mjs + unicorn.wasm
#
# Requirements: docker (emscripten runs in a container).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENDOR_DIR="$ROOT/../../src/apple/sap/vendor"
SRC="$ROOT/unicorn-src"
UC_VERSION="2.1.4"

if [ ! -d "$SRC" ]; then
  git clone --depth 1 --branch "$UC_VERSION" https://github.com/unicorn-engine/unicorn.git "$SRC"
fi

if [ ! -f "$SRC/.tci-wasm-patched" ]; then
  git -C "$SRC" apply "$ROOT/patches/unicorn-2.1.4-tci-wasm.patch"
  touch "$SRC/.tci-wasm-patched"
fi

mkdir -p "$VENDOR_DIR"

docker run --rm -v "$ROOT:/work" -w /work emscripten/emsdk:3.1.61 bash -exc '
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get install -y -qq pkg-config >/dev/null 2>&1 || true
  mkdir -p build dist && cd build

  emcmake cmake ../unicorn-src \
    -DCMAKE_BUILD_TYPE=Release \
    -DUNICORN_ARCH="x86" \
    -DCMAKE_C_FLAGS="-fPIC -O3"

  emmake make -j"$(nproc)" unicorn

  emcc ../glue.c -I../unicorn-src/include \
    libunicorn.a libunicorn-common.a libx86_64-softmmu.a \
    -o ../dist/unicorn.mjs \
    -O3 \
    -sMODULARIZE=1 \
    -sEXPORT_NAME=UnicornModule \
    -sALLOW_MEMORY_GROWTH=1 \
    -sMAXIMUM_MEMORY=4GB \
    -sINITIAL_MEMORY=64MB \
    -sALLOW_TABLE_GROWTH=1 \
    -sENVIRONMENT=web,worker,node \
    -sEXPORTED_FUNCTIONS=_uc2_open,_uc2_close,_uc2_strerror,_uc2_version,_uc2_mem_map,_uc2_mem_unmap,_uc2_mem_protect,_uc2_mem_write,_uc2_mem_read,_uc2_reg_write,_uc2_reg_read,_uc2_emu_start,_uc2_emu_stop,_uc2_hook_add_code,_uc2_hook_del,_uc2_set_code_hook_cb,_uc2_hook_add_mem_invalid,_uc2_set_mem_hook_cb,_uc2_scratch_alloc,_uc2_scratch_free,_malloc,_free \
    -sEXPORT_ES6=1 \
    -sEXPORTED_RUNTIME_METHODS=addFunction,removeFunction,getValue,setValue,HEAPU8,lengthBytesUTF,stringToUTF8,UTF8ToString \
    --no-entry
' 

cp dist/unicorn.mjs dist/unicorn.wasm "$VENDOR_DIR/"
echo "engine built into src/apple/sap/vendor/"
