#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export YMGA_LICENSE_ADMIN_USERNAME=sighton_admin
export YMGA_LICENSE_ADMIN_PASSWORD=Sighton!2026

# Start frontend in the background
echo "Starting frontend..."
cd "$ROOT/tool/web"
npm run dev &
FRONTEND_PID=$!

# Start backend (prefer venv Python to avoid missing uvicorn)
echo "Starting backend..."
cd "$ROOT/tool/server"
if [ -f ".venv/bin/python" ]; then
    PYTHON=".venv/bin/python"
else
    PYTHON="python3"
fi

# Trap Ctrl+C to cleanly shut down both processes
cleanup() {
    echo ""
    echo "Shutting down..."
    kill "$FRONTEND_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

"$PYTHON" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
