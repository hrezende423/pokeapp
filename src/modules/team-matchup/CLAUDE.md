# Team Matchup

Module rules moved out of the root `CLAUDE.md` so they load only when
Claude works in this directory. Every rule in the root file still applies here.

## Team Matchup (Tools → Team Matchup)

My team (a Team Building team) against a trainer's, every Pokémon against every
Pokémon, and whole battles against the trainer's OWN AI. Graduated the Battle
Simulator stub. Built 2026-10-01 to a requirement list (S1–S7, M1–M4, V1–V4,
D1–D5, P1–P8, O1–O4, R1–R7); the IDs are in the code comments.

- **Two layers.** `src/modules/battle/` is the ENGINE — pure, no React: the game
  context (`game.ts`, every mechanic read off one object), spreads as RANGES
  (`battler.ts`: any IV/EV may be a range; outputs are computed at the two corners
  that bound them, never sampled), damage as a distribution (`damage.ts`, exact KO
  convolution with crits, accuracy, multi-hit and residual), speed (`speed.ts`),
  the turn engine (`engine/`), the AI per generation (`ai/`) and the analyses
  (`analysis/`). `src/modules/team-matchup/` is only the screen. Heavy jobs (Monte
  Carlo, search, gauntlet, scan, suggestions) run in a Web Worker
  (`matchup.worker.ts`, one per hook; cancelling terminates it).
- **Damage is the verified Showdown port** (`calculators/damage`), never
  re-derived. `calculateDamage`'s optional `{ koText: false }` skips the
  description's KO clause, which for a Gen 1–2 five-hit move was 280 ms of a 0.8 ms
  call; the matchup computes its own KO maths. The default is unchanged.
- **Battle data** (`npm run build:battle-data`, `scripts/build-battle-data.mjs`):
  per-game move tables, held effects and AI from the same pinned disassemblies as
  the trainers (BATTLE_PATHS in `trainers/sources.mjs`), written to
  `public/data/battle/<vg>.json` (a PARTITION_DIR, runtime-cached). Gen 3 AI
  scripts are assembled from each repo's own macros. **Gen 4 AI is decoded from
  the shipped binary** (`tr_ai_seq.narc`): Platinum's `script.s` is NOT the shipped
  AI (25 instructions differ); DP's binary is byte-identical to Platinum's; HGSS's
  is not in its disassembly, so HGSS predictions (and DP/HGSS item use, assumed
  Platinum's) are flagged LOW CONFIDENCE on screen. Rebuilds are byte-identical.
- **The AI is the game's, bugs included**, transcribed per generation and named by
  routine in the prediction's score breakdown (`Basic_CheckForImmunity -10`). A
  prediction is a distribution: the AI's own random checks, sampled 300 times.
  Facility AI flags come from the games' code (`sources.ts` facilityTrainerInfo).
- **Nothing writes to Team Building.** "Use current" is read-only; "Customize"
  edits an override in the matchup's own store (`pokeapp:team-matchup:v1`).
  Scenarios snapshot a setup and carry link fields for Notes, Journal, the
  Nuzlocke Tracker and the Collection, which do not exist yet (empty until then).
- **Verdicts are coloured TEXT with a symbol and a word** (▲ Win, ◆ Trade,
  ◐ Roll, ▼ Lose) in `--effect-super` / `--effect-resist` / `--stat-decrease` —
  no fill, never colour alone. The batch scan's grid is the same: coloured numbers.
- **`.tm .tm-section` exists to beat App.css's `.panel section` / `.panel h2`**
  (MODULE-PATTERNS §10): without it every section opened on a border, a 2rem gap
  and an uppercase tracked heading.
- **Double battles run two-on-two** (S6, Gen 3–4; Gen 1–2 have none) — a
  trainer's own double/tag battle or the Double format. `engine/doubles.ts` holds
  the rules, each from the games' code: targets from the per-game move table
  (`tg`; Surf hits both foes in Gen 3, everyone adjacent in Gen 4), Follow Me,
  Gen 3 vs Gen 4 Lightning Rod / Storm Drain, spread order (battler order Gen 3,
  speed order Gen 4). The damage port takes an optional `CalcField.doubles` (Gen 3
  screens `2*(d/3)` and MOVE_TARGET_BOTH halving; Gen 4 screens `d*2/3`, ×3/4
  spreads; Helping Hand) that the Damage Calculator page never sets. Turn order
  is each game's pairwise sort; an emptied slot is refilled AT ONCE in Gen 3
  (`HandleAction_TryFinish`) and at TURN END in Gen 4 (`ReplaceFainted`). The AI
  runs on VIEWS (`ai/view.ts`): Emerald and Platinum score every target incl. the
  ally (≥ 100 only) with AI_DoubleBattle / TAG_STRATEGY forced on; Ruby and
  FireRed pick a random foe and run the singles choice (no doubles routine).
  Singles are untouched: the state's `active2`/`doubles` are absent and every
  singles result is byte-identical to before. The matrix, speed and damage tabs
  stay pairs, with spreads at their doubles reduction. A tag battle's NPC partner
  is not in the data: I play both slots (stated on screen).
- **A matrix cell opens the Damage Calculator on that pair**
  (`calculators/damageCalcHandoff.ts`: a one-shot prefill the calculator's state
  initializers READ and an effect clears by id, so StrictMode's double call is
  harmless).
- `npm run verify:team-matchup` (port 4202): the engine through the matchup's
  pipeline vs the Showdown fixture per generation (a crit, a multi-hit, a weather
  case), chance constants vs the asm, a speed tie per generation, AI behaviour per
  generation, the battle bundle vs the app's move records, a real fight per
  generation through the screen, spreads / scenarios / format / custom / facility
  / hand-off / sandbox, the worker analyses, double battles (the doubles damage
  rules against a re-implementation of each game's formula, targeting, Follow Me,
  Lightning Rod, Helping Hand, Intimidate, turn order, Gen 3 vs Gen 4 refill
  timing, each game's doubles AI, and the screen), design rules and both themes. Its
  move diff found Luster Purge's missing `past_values` (now an era rule in
  `moveEra.ts`), and its crit checks found Gen 2 Lucky Punch / Stick never firing
  (the game compares the item id, not a held effect).


## Its own game selector (moved from the root CLAUDE.md)

- **Team Matchup has its OWN GAME selector — the FOURTH sanctioned exception**,
  approved by the owner 2026-10-01 (`team-matchup/useMatchupScope.ts`). A matchup
  is pinned to one GAME: the game decides the trainers, their AI, the badge boosts
  and the send-out logic. Same shape as the Damage Calculator's: seeded once from
  the app selection, then independent, one-way; it picks a game (the ten Gen 1–4
  main-series games with a disassembly), not a generation. Unlike the
  calculator it is seeded once per SESSION, not per visit: the M3 hand-off to
  the Damage Calculator unmounts the page, and re-seeding on return dropped the
  reader onto a game with no setup. Do not add a fifth exception without asking.
