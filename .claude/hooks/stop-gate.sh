#!/bin/bash
# Stop gate: Claude may not end a turn with a broken typecheck or lint error in
# the files it changed. Fast path only (~20s); the browser suites stay in
# `npm run check`, which the workflow in CLAUDE.md requires before "done".
#
# Then, never blocking, a REMINDER of what the fast path did not check: the suites
# whose areas changed since the last passing gate in this worktree
# (`check.mjs --unchecked`, git only, under a second). Shown to the owner as a
# systemMessage, so a green fast gate is never mistaken for a checked branch.
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi
cd "$CLAUDE_PROJECT_DIR" || exit 0
# The fast gate runs only when code changed since HEAD.
if [ -n "$(git status --porcelain --untracked-files=all -- src scripts '*.ts' '*.tsx' '*.mjs' | grep -E '\.(tsx?|mjs|js)"?$')" ]; then
  if ! OUT=$(node scripts/check.mjs --fast 2>&1); then
    echo "npm run check -- --fast is failing. Fix it before stopping:" >&2
    echo "$OUT" | grep -vE '^\s*$' | tail -40 >&2
    exit 2
  fi
fi
REMINDER=$(node scripts/check.mjs --unchecked 2>/dev/null)
if [ -n "$REMINDER" ]; then
  jq -n --arg m "$REMINDER" '{systemMessage: $m}'
fi
exit 0
