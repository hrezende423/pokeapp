#!/bin/bash
# Stop gate: Claude may not end a turn with a broken typecheck or lint error in
# the files it changed. Fast path only (~20s); the browser suites stay in
# `npm run check`, which the workflow in CLAUDE.md requires before "done".
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR" || exit 0
# Nothing to gate unless code changed since HEAD.
if [ -z "$(git status --porcelain --untracked-files=all -- src scripts '*.ts' '*.tsx' '*.mjs' | grep -E '\.(tsx?|mjs|js)"?$')" ]; then
  exit 0
fi
if ! OUT=$(node scripts/check.mjs --fast 2>&1); then
  echo "npm run check -- --fast is failing. Fix it before stopping:" >&2
  echo "$OUT" | grep -vE '^\s*$' | tail -40 >&2
  exit 2
fi
exit 0
