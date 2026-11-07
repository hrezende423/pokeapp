#!/usr/bin/env bash
# One-step setup and health check for pokeapp. Safe to run any number of times.
#
#   ./init.sh            install (if needed), pre-flight, then `npm run check -- --fast`
#
# Works in Git Bash on Windows, macOS and Linux. It never deletes anything but what
# `npm ci` replaces, and it never touches a linked node_modules (a worktree made by
# `npm run worktree` shares the main repo's).
set -euo pipefail
cd "$(dirname "$0")"

echo "== Node"
want="$(tr -d '[:space:]' < .nvmrc)"
have="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo none)"
if [ "$have" != "$want" ]; then
  echo "Node $want is required (.nvmrc); found: $(node -v 2>/dev/null || echo 'no node')."
  echo "Install it from https://nodejs.org/ (or: nvm install $want && nvm use $want), then rerun."
  exit 1
fi
echo "Node $(node -v)"

echo "== Dependencies"
if node -e "process.exit(require('fs').lstatSync('node_modules').isSymbolicLink() ? 0 : 1)" 2>/dev/null; then
  echo "node_modules is a link to the main repo's (a worktree): not installing here."
elif [ -f node_modules/.package-lock.json ] && [ node_modules/.package-lock.json -nt package-lock.json ]; then
  echo "node_modules is current with package-lock.json: skipping npm ci."
else
  npm ci
fi

echo "== Pre-flight"
node scripts/preflight.mjs

echo "== Gate (fast)"
npm run check -- --fast
