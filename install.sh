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

# Install zsh completions
COMP_DIR="${HOME}/.zsh/completions"
echo "→ installing zsh completions to ${COMP_DIR}"
mkdir -p "$COMP_DIR"
cp "$ROOT/completions/_piracy" "$COMP_DIR/_piracy"

# Ensure fpath is set up in .zshrc
if ! grep -q 'fpath=.*\.zsh/completions' ~/.zshrc 2>/dev/null; then
  printf '\n# piracy CLI completions\nfpath=(~/.zsh/completions $fpath)\nautoload -Uz compinit && compinit\n' >> ~/.zshrc
  echo "  Added completion setup to ~/.zshrc"
fi

echo ""
echo "Done. Verify with:"
echo "  piracy --help"
echo ""
echo "Restart your shell or run 'source ~/.zshrc' to enable tab completion."
