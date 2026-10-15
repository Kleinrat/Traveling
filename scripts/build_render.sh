#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
curl -fsSL https://cli.moonbitlang.com/install/unix.sh -o /tmp/moontrip-install.sh
bash /tmp/moontrip-install.sh
export PATH="$HOME/.moon/bin:$PATH"
sh scripts/build.sh
node scripts/test_worker.mjs
node scripts/test_hosted.mjs
