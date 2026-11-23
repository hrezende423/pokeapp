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
| 2026-11-07 | Infra stack (items 1-11) integrated, spec sync and roadmap | `infra/spec-sync` (`12d52f5`) | [#21](https://github.com/hrezende423/pokeapp/pull/21) | `check --all` 30/30 on `infra/integration` | 2026-11-07 (#21) |
| 2026-11-08 | Framework adoption: permissions and project docs | `chore/framework-adoption` (`4de2f9d`) | [#22](https://github.com/hrezende423/pokeapp/pull/22) | not recorded | 2026-11-08 (#22) |
| 2026-11-08 | Team Builder CLAUDE.md split, rationale moved to `RATIONALE.md` | `chore/prune-team-builder-claude-md` (`c8a8775`) | [#23](https://github.com/hrezende423/pokeapp/pull/23) | not recorded | 2026-11-08 (#23) |
| 2026-11-23 | Frontier S1: facility reference, all games | `feature/frontier-facility-reference` (`1fee056`) | [#33](https://github.com/hrezende423/pokeapp/pull/33) | `check --since main` pass; frontier-reference 178/178, frontier-tracker 276/276 | not merged |
| 2026-11-23 | Frontier S2: Trainer Hill & Tower reference + speed tracking (tracker v2) | `feature/frontier-speed` (`b97eafe`) | [#37](https://github.com/hrezende423/pokeapp/pull/37) | gated on the S3 head | not merged |
| 2026-11-23 | Frontier S3: Challenge Tracker for Platinum/HGSS | `feature/frontier-tracker-games` (`c4e3a52`) | [#38](https://github.com/hrezende423/pokeapp/pull/38) | `check --since main` pass; frontier-tracker 313/313 | not merged |
| 2026-11-23 | Frontier S4: Slateport Tent pool; Castle has no rental Pokémon | `feature/frontier-rental-pools` (`83b7fe9`) | [#34](https://github.com/hrezende423/pokeapp/pull/34) | gated on the S7 head | not merged |
| 2026-11-23 | Frontier S5: Platinum/HGSS Brains | `feature/frontier-brains-gen4` (`HEAD`) | [#39](https://github.com/hrezende423/pokeapp/pull/39) | `check --since main` pass (S1–S5): frontier-reference 236/236, frontier-tracker 313/313 | not merged |
| 2026-11-23 | Frontier S6: Palace/Arena recheck (two Arena label fixes) | `feature/frontier-palace-arena` (`f3f7dbf`) | [#35](https://github.com/hrezende423/pokeapp/pull/35) | gated on the S7 head | not merged |
| 2026-11-23 | Frontier S7: Battle Pike room odds (#24) | `feature/frontier-pike-odds` (`d3e0115`) | [#36](https://github.com/hrezende423/pokeapp/pull/36) | `check --since main` pass; verify:tools 344/344 | not merged |
