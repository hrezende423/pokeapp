# Scripts

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## The Bulbapedia supplement layer

Two generated modules carrying facts the PokeAPI snapshot does not:
`src/data/moveFlags.ts` and `src/data/abilityIgnorability.ts`, both written by
`npm run build:supplement` and committed. **Generated, not hand-typed and not
fetched at runtime** — the app is offline-first with no backend, so a screen
needing a wiki would break on a plane; and 114 names copied from a console dump
is transcription nobody re-checks. The generator throws rather than emitting a
short list if a category vanishes or an in-scope member stops matching, because
nothing downstream can tell "Bite has no flag" from "the category moved".
`npm run audit:supplement` re-joins every name and then asserts hand-derived
facts (Tackle is not a biting move, Mega Kick is not a punch, Intimidate is not
ignorable) — a join can be internally consistent and still wrong.

- **SEVEN FLAGS, NOT EIGHT — contact has no source and that is settled.**
  Bulbapedia documents it neither as an inclusion list nor as an exception list:
  `Category:Contact moves`, `Category:Moves that make contact`,
  `Category:Non-contact moves` and both "do/don't make contact" phrasings all
  return DOES NOT EXIST, and none of the 91 real `Moves that …` categories
  concerns it. The `PokeAPI/api-data` snapshot has no `move-flag` resource and
  no `flags` field on a move — checked in the extracted snapshot, not assumed.
  Sourcing it would mean a new dependency, so it was dropped rather than allowed
  to block the other seven. Do not re-derive this; the search is recorded here
  precisely so nobody repeats it.
- **THE ABILITY EXCEPTION LIST IS EMPTY ON PURPOSE.** Comatose, Shields Down,
  Full Metal Body, Shadow Shield and Prism Armor are the five usually named as
  ignorable-by-pattern but immune in practice. All five are Generation 7+ and
  **not in this bundle at all** (the recon prints `(not in bundle)` for each), so
  a rule about them could never fire in a Gen 1–4 app — it would be a branch
  nothing reaches that a reader must verify to dismiss. The audit asserts the
  absence, since an unguarded absence is indistinguishable from an omission.
  First thing to add back if this app ever grows past Gen 6.
- **`recon-bulbapedia.mjs`'s "Gen 5+" bucket is structurally dead for moves.**
  The bundle carries 485 moves and *all* of them are Gen ≤4, so `allMoveNames`
  and the in-scope set are the same — that column reads 0 in all seven rows and
  every post-Gen-4 member falls into "unmatched" by construction. Its
  `unmatched needing a decision: 91` therefore overstates the real figure, which
  is **0**; only the ability row's 12 are genuine Gen 5+ classifications. Read a
  future run's output with that in mind rather than re-deriving the confusion.
- **Item prices and acquisition are their own generator**, not part of this
  layer: `scripts/build-item-supplement.mjs` -> `public/data/item-supplement.json`
  (eager, precached). PokéAPI's snapshot prices 13 of 563 items and has no item
  locations, so both come from each item page's `{{ItemPrice}}`,
  `{{ItemAvailability}}` and `{{TMtable/row}}` templates, cut to Gen 1–4 games.
  **Bulbapedia answers scripts with a Cloudflare 403** (curl, Node fetch and
  headless Chromium all checked 2026-10-11), so the FETCH is a browser snippet
  run in a real tab (`scripts/bulbapedia/fetch-items.browser.js`, saves to
  `.cache/bulbapedia/items.json`) and the generator only parses that cache.
  `build-supplement.mjs` will hit the same wall the next time it runs.
  The generator prints every template it reads by fallback; that list being
  short (Watt, Daisy, Steven at last run) is the check that the text is right.
- **`f9cb816`'s authorship is unresolved and accepted as-is.** It appeared
  between sessions; git records the repo's configured name on every commit, so
  authorship cannot distinguish authors. Its content was verified clean — the
  recon fetches and prints, writes nothing into `src/data`, and matches project
  conventions. Not worth further investigation unless something else surfaces.

## Verification plumbing

- **Every script that starts a server owns its port**, and
  `verify-design-system` asserts it statically from the tracked file list.
  Three scripts once shared 4183 (`verify-species-page`, `verify-eggmoves`,
  `report-type-scale`) and two more pairs collided on 4193 and 4195 — so those
  could never run concurrently, and before `startPreviewServer`'s port guard
  existed the second one silently measured the first one's build. A collision
  does not fail; it just quietly shares a server. That is why the check is
  static and scanned rather than a hardcoded roster.
- **Everything that needs a server goes through `scripts/lib/devServer.mjs`,
  with no exceptions** — and the empty allow-list *is* the assertion. There is
  no sanctioned second way to start a server here. `spawn('npx', …,
  { shell: true })` puts cmd.exe between the script and its vite on Windows, so
  `kill()` reaps the shell and orphans the server — the failure that once left
  78 servers holding the 4173–4199 range.
  **The deeper half is readiness, and it is the half that actually bit.**
  Polling "did the URL answer" cannot tell your server from someone else's: with
  the port already held, `--strictPort` makes the new vite exit and the poll
  succeeds against the *other* one. Demonstrated on the pre-conversion
  `calibrate-scale` — with a foreign server on its port it printed a full report
  of measurements taken from a build it never started, and **exited 0**. For a
  tool whose entire output is the measured constants this file cites, silently
  stale numbers are the worst failure available. Converted, the same experiment
  exits 1 with zero measurements.
  `report-type-scale` and all three `calibrate-*` tools were converted; the
  `SPAWN_EXCEPTIONS` allow-list is deleted, not shortened.
- **`startPreviewServer` does NOT handle SIGINT** — no `process.on('SIGINT')`
  anywhere in `devServer.mjs`; its only `.on('exit')` is on the child vite, used
  to catch the `--strictPort` bail. So Ctrl+C mid-run still skips the `finally`
  and can leave a bound port. The conversion **moved** that gap rather than
  closing it, though it narrowed the blast radius: with no shell in between, a
  terminal SIGINT reaches the vite directly, where previously it had to pass
  through cmd.exe. The port guard also turns any resulting orphan into a loud
  refusal on the next run instead of a stale measurement. Genuinely open; a
  `process.once('SIGINT')` in `devServer.mjs` would close it for every caller at
  once, which is the right place if it is ever wanted.
- **A calibration tool's coarse sweep is not a correction to a committed
  value.** `calibrate-ghost` sweeps letter-spacing at 0.01em steps and nominates
  `0.22em`; the committed value is `0.222em`, refined past that granularity, and
  the tool's own render line confirms it lands dead on target (157.83px against
  157.83px) where the swept candidate is 0.37px off. The committed constant is
  the better one. Do not "fix" source to match a sweep's resolution.
- **A new browser suite must self-host.** `verify-type-coverage` shipped
  pointing at a hardcoded dev-server URL: it scored 0 checks and exited 1 on
  any machine without a dev server, and tested whatever was listening when
  there was one.

