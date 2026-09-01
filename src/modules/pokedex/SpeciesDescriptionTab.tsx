import { useMemo } from 'react'
import { DataTable, type Column } from '../../components/DataTable'
import { getEncountersForSpecies, getLocation, getLocationArea } from '../../data'
import type { EncounterRow, Species, Variety } from '../../data'
import { SpeciesGameScopeControl } from './SpeciesGameScopeControl'
import { titleCase, versionGroupLabel, versionLabel } from './speciesFacts'
import { usePartitionRows } from './usePartitionRows'
import type { SpeciesGameScope } from './useSpeciesGameScope'

/**
 * The Description tab: the Pokedex entry and where the species is found, for one
 * game, side by side.
 *
 * THE TWO ARE PAIRED BECAUSE THEY VARY TOGETHER. Flavour text is per VERSION (all
 * 16 in-scope versions have an entry for every species they contain -- verified,
 * 493 entries each for the five Gen 4 versions down to 151 each for Red/Blue) and
 * encounters are per version group. Putting them under one game selector means
 * "what does Platinum say about it, and where does Platinum put it" is one
 * reading, not two lookups in different places.
 *
 * ONE PARTITION AT A TIME, ON PURPOSE. The encounter partitions are between 1 KB
 * and 2.8 MB; showing every game's locations at once would mean fetching all
 * fourteen, about 10 MB, to render one species' worth of rows. The selector is
 * what keeps it to a single fetch, and the same scope hook the Learnset tab uses
 * means switching there and back does not re-fetch (the loader caches per
 * partition).
 *
 * BIOLOGY IS DEFERRED, as decided -- it needs the Bulbapedia sourcing pass, and a
 * fragile scrape from here was explicitly ruled out. Nothing is stubbed for it.
 */

interface GroupedEncounter {
  key: number
  locationName: string
  areaName: string
  version: string
  method: string
  levelMin: number
  levelMax: number
  chance: number
  conditions: string[]
}

/**
 * Collapse the raw rows to one per (area, version, method).
 *
 * The bundle's rows are per encounter slot, so one patch of grass produces several
 * that differ only by slot -- level ranges merge and chances sum, which is what a
 * reader actually wants. Same reduction the old encounters table did; kept because
 * it was right, not because it was there.
 */
function groupEncounters(rows: EncounterRow[]): GroupedEncounter[] {
  const map = new Map<string, GroupedEncounter>()
  for (const row of rows) {
    const id = `${row.location_area_id}|${row.version}|${row.method}`
    const existing = map.get(id)
    if (existing) {
      existing.levelMin = Math.min(existing.levelMin, row.level_min)
      existing.levelMax = Math.max(existing.levelMax, row.level_max)
      existing.chance += row.chance
      for (const c of row.conditions) {
        if (!existing.conditions.includes(c)) existing.conditions.push(c)
      }
      continue
    }
    map.set(id, {
      key: map.size,
      locationName: getLocation(row.location_id)?.display_name ?? `Location #${row.location_id}`,
      areaName: getLocationArea(row.location_area_id)?.display_name ?? '',
      version: row.version,
      method: row.method,
      levelMin: row.level_min,
      levelMax: row.level_max,
      chance: row.chance,
      conditions: [...row.conditions],
    })
  }
  return [...map.values()]
}

const ENCOUNTER_COLUMNS: Column<GroupedEncounter>[] = [
  {
    key: 'location',
    label: 'Location',
    render: (g) => (
      <span className="species-encounter-place">
        {g.locationName}
        {g.areaName && g.areaName !== g.locationName && (
          <span className="species-meta-aside">{g.areaName}</span>
        )}
        {g.conditions.length > 0 && (
          <span className="species-meta-aside">{g.conditions.map(titleCase).join(', ')}</span>
        )}
      </span>
    ),
    sortValue: (g) => g.locationName,
  },
  {
    key: 'version',
    label: 'Version',
    render: (g) => versionLabel(g.version),
    sortValue: (g) => g.version,
  },
  {
    key: 'method',
    label: 'Method',
    render: (g) => titleCase(g.method),
    sortValue: (g) => g.method,
  },
  {
    key: 'levels',
    label: 'Levels',
    numeric: true,
    render: (g) => (g.levelMin === g.levelMax ? g.levelMin : `${g.levelMin}–${g.levelMax}`),
    sortValue: (g) => g.levelMin,
  },
  {
    key: 'rate',
    label: 'Rate',
    numeric: true,
    // Summed slot chances can exceed 100 on paper; clamped, since a rate above
    // certainty is a reporting artefact rather than a fact about the game.
    render: (g) => `${Math.min(g.chance, 100)}%`,
    sortValue: (g) => Math.min(g.chance, 100),
  },
]

export function SpeciesDescriptionTab({
  species,
  variety,
  scope,
}: {
  species: Species
  variety: Variety
  /* The same scope object the Learnset tab gets, so the two agree on which game
     is being read. */
  scope: SpeciesGameScope | null
}) {
  const vgName = scope?.versionGroup.name ?? null
  const encounters = usePartitionRows<EncounterRow>(getEncountersForSpecies, species.id, vgName)

  const grouped = useMemo(() => {
    if (encounters.state.status !== 'ready') return []
    return groupEncounters(encounters.state.rows.filter((r) => r.pokemon_id === variety.pokemon_id))
  }, [encounters.state, variety.pokemon_id])

  if (!scope) {
    return (
      <p className="species-info-caption" data-testid="description-no-scope">
        No in-scope game carries data for this species.
      </p>
    )
  }

  const versions = scope.versionGroup.versions.filter((v): v is string => v != null)
  const entries = versions.map((version) => ({
    version,
    text: species.flavor_text[version] ?? null,
  }))
  const withText = entries.filter((e) => e.text != null)
  const totalVersionsWithText = Object.values(species.flavor_text).filter((t) => t != null).length

  return (
    <div
      className="species-description"
      data-testid="species-description"
      data-version-group={vgName}
    >
      <SpeciesGameScopeControl scope={scope} label="Generation" testId="description-scope" />

      <section className="species-info-block" data-testid="species-flavor">
        <h3 className="species-info-heading">
          Pokedex entry
          <span className="species-info-count num">{withText.length}</span>
        </h3>
        {withText.length === 0 ? (
          <p className="species-info-caption" data-testid="species-flavor-none">
            No Pokedex entry in {versionGroupLabel(scope.versionGroup.name)}.
          </p>
        ) : (
          <dl className="species-flavor-list">
            {withText.map((entry) => (
              <div
                key={entry.version}
                className="species-flavor-entry"
                data-testid={`species-flavor-${entry.version}`}
              >
                <dt className="species-flavor-version">{versionLabel(entry.version)}</dt>
                <dd className="species-flavor-text">{entry.text}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="species-info-caption">
          <span className="num">{totalVersionsWithText}</span> of the{' '}
          <span className="num">16</span> in-scope versions carry an entry for{' '}
          {species.display_name}.
        </p>
      </section>

      <section className="species-info-block" data-testid="species-locations">
        <h3 className="species-info-heading">
          Where to find it
          {encounters.state.status === 'ready' && (
            <span className="species-info-count num">{grouped.length}</span>
          )}
        </h3>

        {encounters.state.status === 'loading' && (
          <p className="species-info-caption" data-testid="locations-loading">
            Loading {versionGroupLabel(scope.versionGroup.name)} encounters…
          </p>
        )}

        {encounters.state.status === 'error' && (
          <div data-testid="locations-error">
            <p role="alert">Could not load the encounters for this game.</p>
            <p className="species-info-caption">{encounters.state.message}</p>
            <button
              type="button"
              className="retry-btn"
              data-testid="locations-retry"
              onClick={encounters.retry}
            >
              Try again
            </button>
          </div>
        )}

        {encounters.state.status === 'ready' &&
          (grouped.length === 0 ? (
            <p className="species-info-caption" data-testid="locations-empty">
              Not found in the wild in {versionGroupLabel(scope.versionGroup.name)} — trade, evolve
              or receive it.
            </p>
          ) : (
            <DataTable
              rows={grouped}
              columns={ENCOUNTER_COLUMNS}
              rowKey={(g) => g.key}
              initialSort="location"
              testId="species-locations-rows"
            />
          ))}
      </section>

      {/* The biology write-up is deliberately absent, not forgotten -- see the
          note at the top of this file and the punch list beside it. */}
    </div>
  )
}
