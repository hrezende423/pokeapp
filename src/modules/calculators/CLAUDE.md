# Calculators

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## Damage calculator (Tools → Calculators → Damage Calculator)

First replaced the simplified Damage tab from `9ac37d7`; then, by the owner's
request (2026-09-26), moved to ITS OWN PAGE (`damage-calculator` in
calculators/pages.ts), nested under Calculators as the nav's first `children`
entry. The Calculators screen keeps the other four tabs. The page head is the
title with the generation select beside it -- no tab strip -- so the form
starts high. The IV / EV headers are ghost buttons that zero that side's spread.

- **The engine (`calculators/damage/`) is a PORT of the Showdown calculator, not
  a dependency.** `gen12.ts` / `gen3.ts` / `gen4.ts` mirror smogon/damage-calc's
  `calc/src/mechanics` files line for line, against pokeapp's own records and
  resolvers (era.ts, moveEra.ts, statMath.ts). Pure, no React. `index.ts`
  dispatches by a table: **Gen 5 is a new module + one table line + a
  `FIELD_RULES` entry**, not an edit to the existing three.
- **Checked against the reference, not against itself.** `npm run
  verify:damage-calc` (port 4186) diffs every roll and every character of the
  description line for 155 matchups in `scripts/fixtures/damage-calc-reference.json`,
  recorded from @smogon/calc at the commit named in that file, plus five lines
  quoted verbatim from the live calc.pokemonshowdown.com. To extend it, build the
  reference locally and regenerate — never hand-edit an expectation.
- **ONE DELIBERATE DEVIATION: Gen 4 Triple Kick hits 10/20/30.** The reference's
  gen4.ts computes every hit at 10 BP (it does not pass the hit index; its gen3.ts
  does). The fixture marks the case and the suite asserts our numbers.
- **Where the reference prints nothing, so do we — except these.** Present,
  Magnitude, Spit Up, Trump Card, Return and Frustration take an editable Power
  with a stated default (`POWER_OVERRIDE_DEFAULTS`); OHKOs, Counter-likes, Super
  Fang, Endeavor, Psywave and Bide are "not calculated", never a guessed number.
- **The category is by TYPE before Gen 4** (`moveResolve.ts`, one gate). Gen 1-2
  roll 39 values (217..255), Gen 3-4 sixteen. Field conditions come from
  `FIELD_RULES` (Gen 2: no Hail, one Spikes layer; Stealth Rock and Gravity Gen 4)
  and the UI hides what an era lacks.
- **Moves default to the learnset** (`useGenerationLearnset`: every row, any
  method, any of the generation's games — `getLearnsetsForSpecies`, not Team
  Building's stricter legal moveset), with an "Any" switch for hypotheticals.
  Prevo-only moves are reachable only through Any.
- **Laid out as the Showdown calc is, in our controls** (by request): both
  Pokemon's move results across the top, the selected line under them, then
  Pokemon 1 | Field | Pokemon 2, with stat stages inline in the stat table and a
  field column per side. **Every move runs in both directions** — there is no
  attacker/defender role and no swap; `DualField.sides` is per Pokemon and
  `fieldFor` picks attacker/defender per calculation. **The type scale is
  redefined on `.dcalc`** (12px body, 14 title), the species page's technique, so
  nothing outside this screen changes; it also sets `line-height: 1.3`, because
  the inherited ~26px leading made every 12px row a 26px box.
- **Its form is the team-build form, built as shared components** in
  `components/ds/` (`FormParts`, `EvStatTable`, `MoveSlotTile`, `SearchSelect`).
  EV entry is the Build Form's slider + number box by decision, not §5's plain
  field. The Build Form does not use these yet — see deferred debt.


## Its own generation selector (moved from the root CLAUDE.md)

- **The Damage calculator has its OWN generation selector — the THIRD
  sanctioned exception**, approved by the owner 2026-09-26
  (`calculators/useDamageCalcScope.ts`). A calc is pinned to a ruleset; changing
  the app's game to change one calc's era would re-filter every screen behind it.
  Same shape as Type Coverage: seeded once, then independent, one-way, generation
  only (legality is answered across all of a generation's games at once). It
  scopes the Damage TAB only — the other four calculator tabs still follow the
  app.
