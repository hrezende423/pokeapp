# Navigation

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## The back stack

`nav/navHistory.ts`, and it is **STILL NOT A ROUTER** — nothing writes a URL, so
no deep links and no `?ds=1` / `?layout=1` to preserve. It uses the History API
only for the browser's *stack*, one entry per screen carrying a depth number, so
**the Android back gesture, the browser button and the app-bar control are one
mechanism**. That was the whole reason to involve the platform: this app is
reviewed on a phone, where the gesture is how people go back.

- **One path for every back.** The app-bar control calls `history.back()` and
  lets the `popstate` handler do the work, so the guard, the depth bookkeeping
  and the application of a location exist once. A second implementation for the
  button is how the two would drift.
- **A location is a page plus the entry open in it** — what the nav context
  already owns. **Module-internal screens are NOT steps**: Team Building's four
  live in `tbNav` and the species page's tabs in local state, so leaving Team
  Building returns to whatever preceded Team Building rather than walking out
  through My Teams. Those screens have their own back controls. Adding them
  later means pushing a location from `goTo`, not changing the shape here.
- **Two ways a guard can say yes, and they need opposite handling.** With
  nothing to ask, `proceed` runs synchronously and the location is applied on
  the spot. With something to ask it runs frames later — and by then the browser
  has ALREADY moved, because `popstate` fires after the fact and cannot be
  prevented. So a blocked back re-pushes the depth we never left, and the
  blocker's `proceed` re-enters through the platform with `bypassGuard` set. An
  `asking` flag tells the two apart. Applying directly in the late case leaves
  our depth and the browser's disagreeing, which is the bug that shape exists to
  avoid.
- **`applying` guards reentrancy**: restoring a location calls the nav setters,
  and those setters are what push history.
- **Every page change goes through `NavProvider`**, which is what lets one
  guard cover the app bar, the global search's cross-module jump and the back
  control at once. That is the point of `navGuard.ts` living in the nav layer —
  see the closed debt entry below.
- **Deliberate: the species page's own "All species" control pushes a step.**
  It is a destination ("show me the grid"), not an undo — it has to reach the
  grid even when the reader arrived at that species from the global search in
  another module, which an undo cannot promise. So grid → detail → All species
  leaves three entries and a back press re-opens the detail, exactly as a
  browser does with links. Do not "fix" that by collapsing it; the two controls
  are independent on purpose.
- **Learnset move names link into the Movedex** (`onSelectMove`, threaded
  Pokédex → SpeciesDetailPage → SpeciesLearnsetTab), which is what makes
  Pokédex > species > move page walkable back. The treatment is
  `.species-egg-group`'s, **shared rather than copied** — same act, and two
  rules would be two treatments in one session.

