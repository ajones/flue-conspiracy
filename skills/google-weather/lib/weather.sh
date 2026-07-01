#!/usr/bin/env bash
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SKILL_DIR"
export PATH="$HOME/.local/bin:$PATH"
exec poetry run python lib/weather_helper.py "$@"
