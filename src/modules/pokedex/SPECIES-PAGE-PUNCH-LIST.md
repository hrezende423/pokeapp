# Species detail page — punch list

Open items on the rebuilt page (`SpeciesDetailPage.tsx` and the four
`Species*Tab.tsx` files). Deliberately deferred, not forgotten: they are layout
judgements that only make sense against the finished page with real content in
it, which now exists.

Nothing here is a bug in the data or a broken behaviour — `npm run
verify:species-page` is green at 66 checks. These are the "it does not look
right yet" list.

## 1 — Layout fix-up pass (raised at the end of Part 2–5, hold until reviewed)

1. **Ghost-number watermark is too large.** It clips at the card edges instead
   of fitting inside them. `--font-size-ghost-watermark` is 220px against a
   420px pinned track, and `GhostWatermark` is positioned to bleed off the
   top-right on purpose (every host sets `overflow: hidden` for it) — so the
   question is whether the bleed is right at this scale or whether the hero
   variant needs its own smaller value. Confirmed visible in
   `scripts/.verify-shots/species-page-info-gen4.png`.
2. **Artwork should sit higher in the left column.** There is a large dead band
   between the watermark and the top of the sprite. Confirmed in the same
   screenshot.
3. **The name is not in its Figma-specified position.** Currently under the
   artwork, centred, at `--font-size-display`.
4. **The genus line ("Seed Pokémon") is showing where it was never
   specified.** It comes from `HeroDetailCard`'s existing `genus` prop, which the
   design-system reference does render — so this is "remove it here, or decide
   where it actually belongs", not a stray element. Removing it is a one-line
   change at the `<HeroDetailCard>` call site in `SpeciesDetailPage.tsx`.
5. **Sub-nav appears above the name/types/genus header rather than below it.**
   CONFIRMED, and worth being precise about the cause: the sub-nav is at the top
   of the RIGHT column and the name/genus block is in the LEFT one, so they are
   not in a single stacking order at all — there is nothing to reorder until it
   is decided which column the name header belongs to. The types now render at
   the top of the Info tab (right column), which is a third position again.

## 2 — Observations from building it (mine, not raised — judge with the above)

- **Gen 1's game row offers the Japanese-only releases.** Picking Gen I in the
  learnset scope offers `Red / Green (JP)`, `Blue (JP)`, `Red / Blue`, `Yellow`.
  They are real version groups with real learnsets and the app-wide selector
  already lists all 14, so this is consistent — but on a per-species control it
  is four options where two would do.
- **Sprite-card tone step is very subtle in light mode.** `--surface-raised` is
  `#fff` against `--surface` `#fafafa`, so the card frame is nearly invisible on
  the Sprites tab. Correct per the tokens; may want more separation there.
- **The Info tab is airy.** `--space-gap-lg` between every section means the
  page scrolls about 450px on a 950px viewport for a species with a short
  evolution chain.

## 3 — Explicitly scoped for later (decided, with findings)

- **Pokéathlon stats** — Gen 4 only, and absent from PokéAPI at species level
  (`nature-pokeathlon-stat` covers natures, not species). Sourcing decision:
  Bulbapedia. The Info tab renders a one-line note under a Gen 4 selection
  rather than an empty five-row table.
- **Biology write-up** — deferred, Bulbapedia. Nothing is stubbed for it in the
  Description tab.
- Both fold into the one Bulbapedia sourcing task: ~41 min rate-limited fetch, a
  wikitext parser, a lazy partition, CC BY-NC-SA attribution.

## 4 — The cutover (needs a decision, blocks removing `?detail`)

The new page is still behind `?detail`. What is holding it there is not missing
content — all four tabs are built — but one feature and one suite migration:

- **The old page's four-axis artwork control has no home in the new spec.**
  `Artwork.tsx` lets you toggle source (in-game / official artwork), colour
  (regular / shiny), motion (static / animated) and gender, with each axis
  checked against what actually exists for that species. The new Sprites tab
  shows every image at once instead, which answers the same question a different
  way. Nothing in Parts 0–5 asks for the toggles. Options: drop them, keep them
  on the Sprites tab, or put shiny back on the pinned card (the evolution chart
  already takes a `shiny` prop and currently gets the default).
- **~100 suite assertions target the old page's testids**, most of them that
  artwork control: 32 `artwork` references in `verify-pokedex.mjs` and 72 in
  `verify-ux.mjs`.

Until that is settled, `Pokedex.tsx` keeps both pages and the new one has its own
suite (`npm run verify:species-page`).

## 5 — Found while building, unrelated to layout (needs a decision)

**17 species show a hidden ability under a Gen 4 selection, and hidden abilities
are a Gen 5 mechanic.** 12 under Gen 3. Koffing shows "Levitate, Stench
(hidden)" in HeartGold/SoulSilver; Stench was not on it until Black/White.

The cause is upstream: `resolveAbilitiesForGeneration` empties a slot when
PokéAPI carries a `past_abilities` entry saying it was empty, and for these 17
there is no such entry. Bulbasaur is the well-formed case — Chlorophyll does have
one, so it correctly disappears in Gen 4.

The fix is one line in `src/data/era.ts` (drop `is_hidden` slots below Gen 5), but
it changes what the OLD detail page shows too, so it is not being applied
silently. `verify-species-page.mjs` logs it as a FINDING rather than asserting
either behaviour.
