#!/usr/bin/env bash
# Build the content database and start the app.   ./run.sh [port]
set -euo pipefail
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "python3 is required (macOS: xcode-select --install, or brew install python)"; exit 1; }
python3 tools/build.py
exec python3 server/server.py --port "${1:-8787}"
