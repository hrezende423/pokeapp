# Progress

One line per slice, newest last. A slice is listed when its PR opens, and its
Merged column is filled when it lands on `main`. The tools project's own step log
is `docs/tools/PROGRESS.md`; the current task's result is `docs/status/results.md`.

| Date | Slice | Branch (head) | PR | Gate | Merged |
|---|---|---|---|---|---|
| 2026-10-15 → 11-06 | Tools #1-#22 | `tools/integration` | (in #8) | per step, `docs/tools/PROGRESS.md` | 2026-11-07 (via #8) |
| 2026-11-06 | Slice 1: green release (search fix, #22 rental, verify:ux, sprite docs, `CARD_214`) | `tools/integration` (`7e93d37`) | [#8](https://github.com/hrezende423/pokeapp/pull/8) | `check --all` 22/22 on `d211c9b` | 2026-11-07 (via #8) |
| 2026-11-07 | A: team transfer (Showdown import/export, Build names, tag search, compare) | `feature/team-transfer` (`4024a52`) | [#4](https://github.com/hrezende423/pokeapp/pull/4) | `--since tools/integration`; team-transfer 61/61 | 2026-11-07 (via #8) |
| 2026-11-07 | Gen 2 Special: DV and Stat Exp read from the stored keys | `fix/gen2-special` (`01cb817`) | [#5](https://github.com/hrezende423/pokeapp/pull/5) | `--since feature/team-transfer` | 2026-11-07 (via #8) |
| 2026-11-07 | B: gender (none in Gen 1, Gen 2 from the Attack DV) | `fix/gender-gen1-2` (`943e866`) | [#6](https://github.com/hrezende423/pokeapp/pull/6) | `--since fix/gen2-special` | 2026-11-07 (via #8) |
| 2026-11-07 | C: Collection v2 | `feature/collection-v2` (`08a4fe5`) | [#7](https://github.com/hrezende423/pokeapp/pull/7) | `--since fix/gender-gen1-2`; collection 74/74 | 2026-11-07 (via #8) |
| 2026-11-08 | D: Multi-Counter tool (Tools tab, device only) | `feature/counters` | [#24](https://github.com/hrezende423/pokeapp/pull/24) | `--since main` 7/7; counters 52 checks | 2026-11-08 (#24) |
