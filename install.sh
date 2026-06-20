#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Installing piracy from $ROOT"

# Install dependencies
echo "→ bun install"
bun install --cwd "$ROOT"

# Symlink the bin entry so 'piracy' runs src/cli/index.ts directly via bun
echo "→ npm link"
npm --prefix "$ROOT" link

echo ""
echo "Done. Verify with:"
echo "  piracy --help"
