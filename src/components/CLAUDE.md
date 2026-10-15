# Shared components

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## The scroll model and the back stack

`components/ScrollArea.tsx` owns the scroll half, and all six mounts get every
part of it by construction. `npm run verify:scroll-nav` (port 4198) drives the
lot, including a real touch context.

- **THE SCROLLBAR IS DRAWN, NOT NATIVE, and the fade is why.** A native bar's
  gutter is layout rather than paint, so hiding its thumb when idle leaves the
  gutter behind — the full width paid permanently for a mark visible a second at
  a time, and every row in the app narrower for good. CSS cannot fade one
  either, only switch it on and off, and the three engines disagree on how a
  native bar is styled and how wide `thin` is. Drawing it also lets it stop
  short of the corner where the back-to-top control sits.
  **The universal no-scrollbar rule in `index.css` therefore STAYS** — the drawn
  thumb is additive, and the small internal scrollers (learnset tables, search
  dropdown, evolution tree) keep no bar at all, by request.
  It reproduces exactly what an 8px native track with a 2px inset paints: 4px of
  rounded bar, 2px off the edge. Tone is `color-mix` down from
  `--text-secondary`, **not `--border`** — that token disappears against
  `--surface-raised`, which is what three of the six scrollers sit on — and it is
  translucent on purpose, since the thumb sits over content.
- **The thumb's geometry is written straight to the node**, never through state:
  it moves on every scroll frame, and a `setState` there re-rendered the whole
  section to shift one element 3px. The three booleans that DO need a render are
  compared before setting, which the original hook did not do.
- **On touch it is an indicator at rest and a handle once awake.** The invisible
  state takes no pointer events, because a 12px strip that eats them is 12px of
  every list a right-handed thumb cannot swipe; press-to-jump on the empty track
  is mouse-only for the same reason. The finger-sized hit area is a `::before`
  that grows **leftward only** — symmetric insets reach outside the section, and
  `.scroll-area-outer` does not clip, so in the two side-by-side arrangements
  (Itemdex rail + detail, Type Coverage view + rail) it would swallow events in
  the neighbour.
- **Scroll memory is keyed by what a scroller is SHOWING, not by which scroller
  it is.** Three mounts host several screens each — `tb-scroll` is every Team
  Building screen, `tc-scroll-area` all four Type Coverage tabs, the species
  page's scroller a different species and tab every time — so the call site
  composes the key and a missing part is visible there.
  **The Pokédex grid's key includes the filter state, and that IS the whole
  invalidation story**: a different generation, search term or type filter is a
  different key, so it opens at the top, and returning to a filter you had
  before restores your place in it for free. There is no invalidation step to
  forget to call.
- **NOTHING IS WRITTEN IN THE RESTORE EFFECT'S CLEANUP, and that is
  load-bearing.** A "last word" write there — the obvious belt to the scroll
  handler's braces — silently destroyed the feature: React runs an effect
  cleanup after the element is detached, and a detached element reports
  `scrollTop === 0`, so the last thing to reach the store on every exit was a
  zero over the real offset. The log read `WRITE 900` then `WRITE 0`, in that
  order, every single time. The scroll handler is sufficient alone — the only
  way to change `scrollTop` without a scroll event is not to change it.
- **Not persisted**, by request: a reload starts at the top of everything.
  sessionStorage would need a clamp and a staleness rule for a restored offset
  pointing past the end of a list whose data changed since.

