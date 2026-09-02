import { useMemo } from 'react'
import { DataTable, type Column } from '../../components/DataTable'
import {
  getEncountersForSpecies,
  getLocation,
  getLocationArea,
  listVersionGroups,
} from '../../data'
import type { EncounterRow, Species, Variety, VersionGroup } from '../../data'
import { generationLabel, titleCase, versionGroupLabel, versionLabel } from './speciesFacts'
import { usePartitionRows } from './usePartitionRows'
import type { SpeciesGameScope } from './useSpeciesGameScope'

/**
 * The Description tab: every game's Pokedex entry in sequence, then where the
 * species is found.
 *
 * NO GAME SELECTOR HERE ANY MORE. The flavour text is the whole point of the tab
 * and it is short -- 16 in-scope versions, one paragraph each, all of it already in
 * the eagerly-loaded bundle. Gating it behind a selector meant reading a species'
 * Pokedex history one game at a time and clicking fourteen times to see it; the
 * Bulbapedia-style full sequence is one read. Nothing is fetched to do this, so
 * "all of them" costs nothing that "one of them" did not already cost.
 *
 * ENTRIES ARE GROUPED BY GENERATION, in bundle order (oldest first). The grouping
 * is not decoration: entries change wording between generations far more than
 * between the two versions of one pair, so the generation is the unit a reader is
 * actually comparing.
 *
 * LOCATIONS STILL NEED ONE GAME, and that is not a leftover selector -- it is the
 * encounter partitions. They run from 1 KB to 2.8 MB and there are fourteen, so
 * "every game's locations" is a ~10 MB fetch to render one species. So this
 * section follows the APP-WIDE game selector, which is what CLAUDE.md says every
 * module must respect anyway; the page-local scope is only the fallback for when
 * the app selector is on "All" and has no single game to name. That removes the
 * tab's own control without making the section disappear.
 *
 * BIOLOGY IS STILL DEFERRED, as decided -- it needs the Bulbapedia sourcing pass.
 * Nothing is stubbed for it.
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
 * reader actually wants.
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

/**
 * Every in-scope version that has an entry for this species, oldest first,
 * bucketed by generation.
 *
 * Version order comes from listVersionGroups (generation, then the bundle's own
 * `order`), not from Object.keys on flavor_text -- a JSON object's key order is
 * whatever the build wrote, which is not a promise and is not chronological.
 */
function entriesByGeneration(species: Species) {
  const buckets = new Map<number, { version: string; text: string }[]>()
  for (const group of listVersionGroups()) {
    const gen = group.generation_id ?? 0
    for (const version of group.versions) {
      if (version == null) continue
      const text = species.flavor_text[version]
      if (!text) continue
      const list = buckets.get(gen)
      if (list) list.push({ version, text })
      else buckets.set(gen, [{ version, text }])
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, entries]) => ({ generation, entries }))
}

export function SpeciesDescriptionTab({
  species,
  variety,
  versionGroup,
  scope,
}: {
  species: Species
  variety: Variety
  /** The app-wide selection. Null on "All". */
  versionGroup: VersionGroup | null
  /** The page's own scope, used only as the locations fallback -- see above. */
  scope: SpeciesGameScope | null
}) {
  const locationGroup = versionGroup ?? scope?.versionGroup ?? null
  const vgName = locationGroup?.name ?? null
  const encounters = usePartitionRows<EncounterRow>(getEncountersForSpecies, species.id, vgName)

  const grouped = useMemo(() => {
    if (encounters.state.status !== 'ready') return []
    return groupEncounters(encounters.state.rows.filter((r) => r.pokemon_id === variety.pokemon_id))
  }, [encounters.state, variety.pokemon_id])

  const byGeneration = useMemo(() => entriesByGeneration(species), [species])
  const totalEntries = byGeneration.reduce((n, g) => n + g.entries.length, 0)

  return (
    <div
      className="species-description"
      data-testid="species-description"
      data-version-group={vgName}
      data-flavor-entries={totalEntries}
    >
      <section className="species-info-block" data-testid="species-flavor">
        <h3 className="species-info-heading">
          Pokedex entries
          <span className="species-info-count num">{totalEntries}</span>
        </h3>

        {totalEntries === 0 ? (
          <p className="species-info-caption" data-testid="species-flavor-none">
            No in-scope game carries a Pokedex entry for {species.display_name}.
          </p>
        ) : (
          byGeneration.map((bucket) => (
            <div
              key={bucket.generation}
              className="species-flavor-gen"
              /* NOT species-flavor-gen-N: that matches [data-testid^="species-flavor-"],
                 which is how every reader addresses a per-VERSION entry, so the
                 four group wrappers were being counted as versions. */
              data-testid={`species-flavor-group-${bucket.generation}`}
              data-entries={bucket.entries.length}
            >
              <h4 className="species-flavor-gen-label">{generationLabel(bucket.generation)}</h4>
              <dl className="species-flavor-list">
                {bucket.entries.map((entry) => (
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
            </div>
          ))
        )}
      </section>

      <section className="species-info-block" data-testid="species-locations">
        <h3 className="species-info-heading">
          Where to find it
          {encounters.state.status === 'ready' && (
            <span className="species-info-count num">{grouped.length}</span>
          )}
        </h3>

        {/* Names the game rather than implying the rows are every game's: this
            section is one partition, and which one is a fact the reader needs. */}
        {locationGroup && (
          <p className="species-info-caption" data-testid="locations-scope">
            {versionGroupLabel(locationGroup.name)}
            {versionGroup == null && (
              <span className="species-meta-aside">
                app selector is on All — showing this species&rsquo; newest in-scope game
              </span>
            )}
          </p>
        )}

        {!locationGroup && (
          <p className="species-info-caption" data-testid="locations-no-scope">
            No in-scope game carries encounter data for this species.
          </p>
        )}

        {encounters.state.status === 'loading' && (
          <p className="species-info-caption" data-testid="locations-loading">
            Loading {versionGroupLabel(vgName ?? '')} encounters…
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
              Not found in the wild in {versionGroupLabel(vgName ?? '')} — trade, evolve or receive
              it.
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
