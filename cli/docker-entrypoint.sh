#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="/project/backend"

# Ensure Python venv exists for CLI commands that call backend scripts
if [ -d "$BACKEND_DIR" ] && [ -f "$BACKEND_DIR/pyproject.toml" ]; then
  if [ ! -d "$BACKEND_DIR/.venv" ] || [ ! -f "$BACKEND_DIR/.venv/bin/activate" ]; then
    echo "▸ Setting up backend venv..."
    cd "$BACKEND_DIR"
    uv sync --frozen --no-dev --no-editable
  fi
fi

exec codb "$@"
