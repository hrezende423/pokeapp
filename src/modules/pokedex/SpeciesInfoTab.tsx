import { useMemo } from 'react'
import { StatList, StatRow } from '../../components/ds/DataRows'
import {
  ABILITIES_INTRODUCED_IN_GENERATION,
  EFFORT_VALUES_INTRODUCED_IN_GENERATION,
  captureRatePercent,
  genderRatio,
  getEggGroup,
  getEvolutionChain,
  resolveAbilitiesForGeneration,
  resolveStatsForGeneration,
  resolveTypesForGeneration,
} from '../../data'
import type { Species, Variety, VersionGroup } from '../../data'
import { BREEDING_INTRODUCED_IN_GENERATION } from '../dex/entrySources'
import type { SpeciesGameScope } from './useSpeciesGameScope'
import { EvolutionTree } from './EvolutionTree'
import { SpeciesLocations } from './SpeciesLocations'
import { TypeMatchupChart } from './TypeMatchupChart'
import {
  MAX_BASE_STAT,
  STAT_LABELS,
  evYield,
  hatchSteps,
  heldItemsForScope,
  statTotal,
  titleCase,
  versionLabel,
} from './speciesFacts'

/**
 * The Info tab: two metadata sub-columns, then the stats and the evolution chart
 * side by side, then the type chart.
 *
 * EVERY ERA-SENSITIVE FIELD GOES THROUGH A RESOLVER, not through the raw record --
 * types, abilities and now base stats. The stats resolver is new
 * (resolveStatsForGeneration in data/era.ts) and it is not cosmetic: a Gen 1
 * selection has to show one combined Special, and 20 species additionally need a
 * pre-Gen-6 physical stat. Reading `variety.stats` here would have shown modern
 * numbers under a Red/Blue selection.
 *
 * FIELDS THAT DID NOT EXIST YET SAY SO rather than showing an em dash, which would
 * claim the data is missing when the mechanic is what is missing: abilities before
 * Gen 3, egg groups and friendship before Gen 2, EV yield before Gen 3.
 *
 * POKEATHLON is Gen 4 only and is NOT in the bundle -- PokeAPI has no per-species
 * Pokeathlon stats at all (nature-pokeathlon-stat covers natures, not species).
 * Sourcing it from Bulbapedia is a confirmed, separately-scoped task, so the
 * section renders under a Gen 4 selection as a one-line note naming that. An empty
 * five-row table would imply the numbers are zero.
 *
 * NO FOOTPRINT ROW, as decided: no such field exists in the bundle or upstream,
 * and the sprite URLs 404.
 *
 * THE TAB'S ORDER, top to bottom: the two metadata columns, then base stats and
 * the evolution chart side by side, then WHERE TO FIND IT, then type
 * effectiveness, then the Pokeathlon note. Locations moved here from the
 * Description tab -- see SpeciesLocations for why -- and they sit under the two
 * charts and above the type table, which is where they were asked for.
 */

/**
 * The gender split as a two-segment bar.
 *
 * --accent FOR FEMALE, THE PAGE'S INK FOR MALE, requested directly. It replaces
 * two tone steps of the same grey, which needed the percentages beside it to say
 * which segment was which.
 *
 * NOT A FIFTH USE OF --accent: its sanctioned list is active tab/nav state,
 * BINARY INDICATORS, error emphasis and base-stat magnitude, and a gender split
 * is the second of those -- the same use that already covers caught/not-caught.
 * Noted because the count is a rule in CLAUDE.md.
 *
 * --text-primary rather than a literal white, because "white for male" is what
 * --text-primary is in the dark theme this page was designed in, and a literal
 * #fff would vanish into the light theme's white track.
 *
 * GENDERLESS IS A FULL GREY BAR, not the bare word. The row used to be a
 * different shape for the 19 genderless species than for the other 474, which
 * broke the metadata columns' shared rows for exactly those species. The grey is
 * the one the female segment used to be, so nothing new enters the palette.
 */
function GenderRatioBar({ genderRate }: { genderRate: number | null }) {
  const ratio = genderRatio(genderRate)
  if (!ratio) {
    return (
      <span className="species-gender" data-testid="gender-ratio" data-genderless="true">
        <span className="species-gender-track" aria-hidden>
          <span className="species-gender-none" />
        </span>
        <span className="species-gender-legend">Genderless</span>
      </span>
    )
  }
  return (
    <span
      className="species-gender"
      data-testid="gender-ratio"
      data-male={ratio.male}
      data-female={ratio.female}
    >
      <span className="species-gender-track" aria-hidden>
        <span className="species-gender-male" style={{ width: `${ratio.male}%` }} />
        <span className="species-gender-female" style={{ width: `${ratio.female}%` }} />
      </span>
      <span className="species-gender-legend">
        <span className="num">{ratio.male}%</span> male ·{' '}
        <span className="num">{ratio.female}%</span> female
      </span>
    </span>
  )
}

function HeldItems({
  variety,
  versionGroup,
  generation,
}: {
  variety: Variety
  versionGroup: VersionGroup | null
  generation: number
}) {
  const entries = heldItemsForScope(variety, versionGroup)

  if (entries.length === 0) {
    return (
      <span className="species-meta-none" data-testid="held-items-none">
        {/* Wild held items have no record before Gen 3 anywhere in the bundle --
            no Gen 1-2 version appears in a single held_items entry. */}
        {generation < 3 ? 'Not recorded before Gen 3' : 'None'}
      </span>
    )
  }

  return (
    <span className="species-held-items" data-testid="held-items" data-count={entries.length}>
      {entries.map((entry) => (
        <span
          key={entry.item.id}
          className="species-held-item"
          data-testid={`held-item-${entry.item.name}`}
          data-rarity={entry.uniformRarity ?? 'mixed'}
        >
          {entry.item.display_name}{' '}
          {entry.uniformRarity != null ? (
            <span className="species-held-rate">
              <span className="num">{entry.uniformRarity}</span>%
            </span>
          ) : (
            /* The 21 entries whose rarity differs between versions inside one
               group -- named per version rather than collapsed to one number. */
            <span className="species-held-rate">
              {entry.versions.map((v, i) => (
                <span key={v.version}>
                  {i > 0 && ' · '}
                  <span className="num">{v.rarity}</span>% {versionLabel(v.version)}
                </span>
              ))}
            </span>
          )}
        </span>
      ))}
    </span>
  )
}

export function SpeciesInfoTab({
  species,
  variety,
  generation,
  versionGroup,
  scope,
  onSelectSpecies,
  onSelectEggGroup,
}: {
  species: Species
  variety: Variety
  generation: number
  versionGroup: VersionGroup | null
  /** The page's own game scope -- the locations section's fallback. */
  scope: SpeciesGameScope | null
  onSelectSpecies?: (id: number) => void
  onSelectEggGroup?: (id: number) => void
}) {
  const stats = useMemo(() => resolveStatsForGeneration(variety, generation), [variety, generation])
  const abilities = useMemo(
    () => resolveAbilitiesForGeneration(variety, generation),
    [variety, generation],
  )
  const typeIds = useMemo(
    () => resolveTypesForGeneration(variety, generation).map((t) => t.type_id),
    [variety, generation],
  )

  const breedingExists = generation >= BREEDING_INTRODUCED_IN_GENERATION
  const eggGroups = species.egg_group_ids
    .map((id) => getEggGroup(id))
    .filter((g): g is NonNullable<typeof g> => g != null)
  const chain =
    species.evolution_chain_id != null ? getEvolutionChain(species.evolution_chain_id) : undefined
  const ev = evYield(stats)
  const steps = hatchSteps(species.hatch_counter)

  return (
    <div className="species-info" data-testid="species-info">
      {/* THE TYPES ARE NOT HERE ANY MORE. They are in SpeciesBanner, which is
          page chrome, so they now show on all four tabs instead of only this one
          -- and the banner is where the frame puts them (group-TypeText 57:735 is
          a child of container-poke-name). typeIds is still resolved here for the
          type-effectiveness chart at the bottom. */}
      <div className="species-info-cols">
        <StatList>
          <StatRow
            label="Abilities"
            value={
              abilities.length === 0 ? (
                <span className="species-meta-none" data-testid="abilities-none">
                  {generation < ABILITIES_INTRODUCED_IN_GENERATION
                    ? `None in Gen ${generation}`
                    : 'None'}
                </span>
              ) : (
                <span className="species-abilities" data-testid="species-abilities">
                  {abilities.map((a) => (
                    <span
                      key={a.slot}
                      className="species-ability"
                      data-testid={`species-ability-${a.ability.name}`}
                      data-hidden-ability={a.is_hidden}
                      title={a.ability.short_effect ?? a.ability.effect ?? undefined}
                    >
                      {a.ability.display_name}
                      {a.is_hidden && <span className="species-ability-hidden">hidden</span>}
                    </span>
                  ))}
                </span>
              )
            }
          />
          <StatRow
            label="Height"
            value={
              variety.height != null ? (
                <>
                  <span className="num">{(variety.height / 10).toFixed(1)}</span>
                  <span className="move-unit">m</span>
                </>
              ) : (
                '—'
              )
            }
          />
          <StatRow
            label="Weight"
            value={
              variety.weight != null ? (
                <>
                  <span className="num">{(variety.weight / 10).toFixed(1)}</span>
                  <span className="move-unit">kg</span>
                </>
              ) : (
                '—'
              )
            }
          />
          <StatRow
            label="XP yield"
            value={
              variety.base_experience != null ? (
                <span className="num" data-testid="base-xp">
                  {variety.base_experience}
                </span>
              ) : (
                '—'
              )
            }
          />
          <StatRow
            label="Growth rate"
            value={<span data-testid="growth-rate">{titleCase(species.growth_rate)}</span>}
          />
          <StatRow
            label="Gender ratio"
            value={<GenderRatioBar genderRate={species.gender_rate} />}
          />
          <StatRow
            label="Held items"
            value={
              <HeldItems variety={variety} versionGroup={versionGroup} generation={generation} />
            }
          />
        </StatList>

        <StatList>
          <StatRow
            label="Egg groups"
            value={
              !breedingExists ? (
                <span className="species-meta-none" data-testid="egg-groups-none">
                  Breeding arrived in Gen {BREEDING_INTRODUCED_IN_GENERATION}
                </span>
              ) : eggGroups.length === 0 ? (
                <span className="species-meta-none">—</span>
              ) : (
                <span className="species-egg-groups" data-testid="egg-groups">
                  {eggGroups.map((group, i) => (
                    <span key={group.id}>
                      {i > 0 && <span className="species-egg-sep">·</span>}
                      {/* Cross-navigation into the Breedingdex, the same jump the
                          Breedingdex's own cards make in the other direction. */}
                      <button
                        type="button"
                        className="species-egg-group"
                        data-testid={`species-egg-group-${group.id}`}
                        data-egg-group-id={group.id}
                        onClick={() => onSelectEggGroup?.(group.id)}
                        disabled={!onSelectEggGroup}
                      >
                        {group.display_name}
                      </button>
                    </span>
                  ))}
                </span>
              )
            }
          />
          <StatRow
            label="Hatch time"
            value={
              !breedingExists ? (
                <span className="species-meta-none">—</span>
              ) : species.hatch_counter != null ? (
                <span data-testid="hatch-time">
                  <span className="num">{species.hatch_counter}</span>
                  <span className="move-unit">cycles</span>
                  {steps != null && (
                    <span className="species-meta-aside">
                      ~<span className="num">{steps.toLocaleString('en-US')}</span> steps
                    </span>
                  )}
                </span>
              ) : (
                '—'
              )
            }
          />
          <StatRow
            label="Base friendship"
            value={
              !breedingExists ? (
                <span className="species-meta-none">Gen {BREEDING_INTRODUCED_IN_GENERATION}+</span>
              ) : (
                <span className="num" data-testid="base-friendship">
                  {species.base_happiness ?? '—'}
                </span>
              )
            }
          />
          <StatRow
            label="Catch rate"
            value={
              <span data-testid="catch-rate">
                <span className="num">{species.capture_rate ?? '—'}</span>
                {species.capture_rate != null && (
                  <span className="species-meta-aside">
                    ~<span className="num">{captureRatePercent(species.capture_rate)}</span>%
                  </span>
                )}
              </span>
            }
          />
          <StatRow
            label="EV yield"
            value={
              generation < EFFORT_VALUES_INTRODUCED_IN_GENERATION ? (
                /* Gens 1-2 had Stat Experience, not EVs -- a different mechanic
                   with no per-species yield, so this is not an em dash. */
                <span className="species-meta-none" data-testid="ev-yield-none">
                  Stat Exp era, no EV yield
                </span>
              ) : ev.length === 0 ? (
                <span className="species-meta-none">—</span>
              ) : (
                <span className="species-ev-yield" data-testid="ev-yield">
                  {ev.map((e, i) => (
                    <span key={e.stat}>
                      {i > 0 && ' · '}
                      <span className="num">{e.effort}</span> {STAT_LABELS[e.stat] ?? e.stat}
                    </span>
                  ))}
                </span>
              )
            }
          />
          <StatRow
            label="Shape"
            value={<span data-testid="shape">{titleCase(species.shape)}</span>}
          />
          <StatRow
            label="Body colour"
            value={<span data-testid="body-colour">{titleCase(species.color)}</span>}
          />
        </StatList>
      </div>

      <div className="species-info-wide">
        <section className="species-info-block" data-testid="species-base-stats">
          <h3 className="species-info-heading">Base stats</h3>
          <ul className="species-stat-bars" data-total={statTotal(stats)}>
            {stats.map((s) => (
              <li key={s.stat ?? 'unknown'} data-stat={s.stat} data-value={s.base_stat}>
                <span className="species-stat-name">{STAT_LABELS[s.stat ?? ''] ?? s.stat}</span>
                <span className="species-stat-track">
                  {/* --accent's fourth sanctioned use: stat magnitude. */}
                  <span
                    className="species-stat-fill"
                    style={{ width: `${Math.min(100, (s.base_stat / MAX_BASE_STAT) * 100)}%` }}
                  />
                </span>
                <span className="species-stat-value num">{s.base_stat}</span>
              </li>
            ))}
          </ul>
          <p className="species-info-caption" data-testid="stat-total">
            Total <span className="num">{statTotal(stats)}</span>
            {stats.some((s) => s.stat === 'special') && (
              <span className="species-meta-aside">one combined Special in Gen 1</span>
            )}
          </p>
        </section>

        <section className="species-info-block" data-testid="species-evolution">
          <h3 className="species-info-heading">Evolution</h3>
          {chain ? (
            <EvolutionTree chain={chain.chain} currentId={species.id} onSelect={onSelectSpecies} />
          ) : (
            <p className="species-info-caption">No evolution chain data.</p>
          )}
        </section>
      </div>

      {/* WHERE TO FIND IT: under the two charts, above type effectiveness. */}
      <SpeciesLocations
        species={species}
        variety={variety}
        versionGroup={versionGroup}
        scope={scope}
      />

      <section className="species-info-block" data-testid="species-type-matchups">
        <h3 className="species-info-heading">Type effectiveness</h3>
        <TypeMatchupChart typeIds={typeIds} generation={generation} />
      </section>

      {/*
        POKEATHLON, Gen 4 only, and LAST on the tab. The gate is the selected era,
        not the species: every Gen 1-4 species has Pokeathlon stats in
        HeartGold/SoulSilver. It sat between the metadata columns and the stat
        block, which put a sourcing note in the middle of the facts; at the bottom
        it reads as the footnote it is.
      */}
      {generation === 4 && (
        <p className="species-info-note" data-testid="pokeathlon-pending">
          Pokeathlon stats (Speed, Power, Skill, Stamina, Jump) are Generation IV only and are not
          in PokeAPI at species level — they are part of the separately-scoped Bulbapedia sourcing
          pass.
        </p>
      )}
    </div>
  )
}
