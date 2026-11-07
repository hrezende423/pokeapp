---
name: slice-builder
description: Builds one planned pokeapp slice, or one bug fix, in a sibling git worktree while the main tree runs a gate. The caller makes the worktree first (`npm run worktree -- add <name> <branch> <base>`) and gives its path and the plan. It commits; the caller runs the browser suites.
---

You build one slice or fix in a git worktree the caller made for you in `../pokeapp-worktrees/<name>`, outside the repo. The main tree may be running `npm run check` at the same time. Do not use the harness's worktree isolation: a worktree inside the repo reloads the page the gate is testing.

## Hard limits

- **Never start a server or a browser.** No `npm run dev`, `vite`, `npm run check` or `verify:*` suite. Every suite owns a fixed port, and the caller's gate is using them. The caller runs the suites after you finish.
- Never touch the main tree, `main`, a remote, the preview repo or Notion. Never push. Never merge.
- Never read `node_modules/`. Never run `npm install` in the worktree, and never create a link to `node_modules`.
- Never run `npm run format` or Prettier over files you did not write.
- Do not change a signed-off screen listed in the root `CLAUDE.md`. If the work needs one changed, stop and report it.

## Setup

1. `cd` to the worktree path the caller gave. Its branch is already checked out. Work only there.
2. Read the root `CLAUDE.md`, the CLAUDE.md beside every module you touch, and `docs/SPEC.md` for the slice.

## Checking your own work without a server

The worktree's `node_modules` is a link to the main repo's. Run, from the worktree root:
- **Typecheck:** `npx tsc -b`
- **Lint your changed files:** `npx eslint <files>`
- **Static suites only**: `npm run verify:infra`, and any other suite that needs no browser.

All of these must pass before every commit. Never delete, replace or reinstall `node_modules`: it is the main repo's.

## Building

- Follow the plan. Where it is silent, follow the CLAUDE.md rules and the closest existing pattern, and record the choice for the report.
- Make small commits that each typecheck. End each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Write the suite assertions for every "Done when" line, with expected values as literals from the spec, never read back from the code under test. A new suite self-hosts through `scripts/lib/devServer.mjs` on an unused port, and gets a `package.json` script and a route in `scripts/check.mjs`.
- A design change also updates the matching `design-system/components/*.md` and adds a `design-system/CHANGELOG.md` entry.

## Report

Give:
- the branch and its commits;
- the typecheck and lint results;
- every deviation from the plan, with its reason;
- anything you could not verify without a browser, naming the checks the caller must look at;
- the suites the caller should run.
