# Species detail page — punch list

Open items on the rebuilt page (`SpeciesDetailPage.tsx` and the four
`Species*Tab.tsx` files). Deliberately deferred, not forgotten: they are layout
judgements that only make sense against the finished page with real content in
it, which now exists.

Sections 4 and 5 are DONE and kept here as the record of what changed.
Section 1 is the open list: layout judgements, not bugs. `npm run
verify:species-page` is green at 69 checks and the other nine suites pass.

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

## 4 — The cutover — DONE

`?detail` is gone and this is the live detail view. The old page
(`SpeciesDetail.tsx`) and the three components only it used —
`Learnset.tsx`, `Encounters.tsx`, `TypeEffectiveness.tsx` — were deleted
rather than left as a second, unreachable answer to the same question.

The four-axis artwork control was **folded into the Sprites tab**, not
dropped and not moved onto the pinned hero card. `Artwork.tsx` is reused
unchanged, so its availability rules are the same verified code; a fifth
switch beside the four turns the same axes into a filter over the sprite
catalogue, opt-in so the tab still opens as the full catalogue. The colour
axis still drives the evolution chart, which is why the view state is owned
by `SpeciesDetailPage` rather than by the tab holding the switch.

The suites were re-pointed rather than relaxed, and they grew in the move
(`verify-app` 47→48, `verify-pokedex` 94→105, `verify-ux` 127→132,
`verify-search` 184→185, `verify-eggmoves` 46→47, plus
`verify-species-page` at 69). Three claims genuinely changed shape rather
than moving, and each is commented where it appears:

- **The app selector no longer drives the learnset.** It still re-resolves
  every era-sensitive field of an open page in place; the learnset follows
  the page's own generation control, by design.
- **"All" no longer blanks the per-game tabs.** The old page asked you to
  pick a game first because it had none of its own. The rebuilt page seeds
  its scope at the newest era the species exists in, so the two
  "pick a specific game" notes no longer exist.
- **Opening a species now fetches nothing.** One tab is mounted at a time,
  so the learnset partition loads when Learnset opens and the encounter
  partition when Description does. The old page fired both on open.

### Two facts from the old page did not come across

Both were outside the DetailPage spec, so neither was carried over
silently — flagging them here rather than adding unrequested fields:

1. **Breeding partners** — the old page's "N species in Generation G share
   an egg group" count, from `useBreedingPartners`. Gone with the page.
2. **Ability effect text** — the old page printed each ability's
   `short_effect` as body text under its name. The Info tab has it as the
   ability's `title` attribute instead, so it is a hover rather than a read.

## 5 — Hidden abilities in Gen 1–4 — FIXED

Was: 17 species showed a slot-3 hidden ability under a Gen 4 selection (12
under Gen 3), because PokéAPI carries no `past_abilities` entry emptying
that slot for them. Koffing advertised Stench in HeartGold/SoulSilver.

Now gated by `HIDDEN_ABILITIES_INTRODUCED_IN_GENERATION` in
`src/data/era.ts`: the hidden SLOT did not exist before Gen 5, whatever the
data says about the ability in it. The ability itself often did exist
(Stench is a Gen 3 ability), so the existing generation check could not
catch this — the slot is the anachronism, not its occupant.

Applied at the resolver, so it reaches everything: the Info tab, and the
Abilitydex's holder lists through `abilityHolders.ts`, which goes through
the same function. Audited across all 493 species: 0 hidden abilities
survive in Gens 1–4, and no ability lost all its holders, so the
Abilitydex's own entry list (123 in Gen 4) is unchanged. The rule is now
recorded in CLAUDE.md.
