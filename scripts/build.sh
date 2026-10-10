#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
moon fmt
moon check
moon build --target js --release
cp _build/js/release/build/src/api/api.js web/engine.js
