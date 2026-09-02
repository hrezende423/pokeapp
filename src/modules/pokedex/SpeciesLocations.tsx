import { useEffect, useMemo, useRef, useState } from 'react'
import { DataTable, type Column } from '../../components/DataTable'
import { getEncountersForSpecies, getLocation, getLocationArea } from '../../data'
import type { EncounterRow, Species, Variety, VersionGroup } from '../../data'
import { GameBadge } from './GameBadge'
import { titleCase, versionGroupLabel } from './speciesFacts'
import { usePartitionRows } from './usePartitionRows'
import type { SpeciesGameScope } from './useSpeciesGameScope'

/**
 * Where a species is found in the wild, for one game.
 *
 * IT LIVES ON THE INFO TAB NOW, under the base-stat and evolution charts and
 * above type effectiveness. It was the second half of the Description tab, which
 * put a sortable five-column table under sixteen paragraphs of prose -- two
 * different kinds of reading in one place. The Info tab is the facts tab, and a
 * location list is a fact.
 *
 * IT NEEDS EXACTLY ONE GAME, and that is a property of the data rather than a
 * leftover selector. The encounter partitions run from 1 KB to 2.8 MB and there
 * are fourteen of them, so "every game's locations" is a ~10 MB fetch to render
 * one species. It follows the APP-WIDE game selector, which CLAUDE.md says every
 * module must respect anyway; the page-local scope is only the fallback for when
 * the app selector is on "All" and has no single game to name.
 *
 * AND IT FETCHES ONLY WHEN IT IS SCROLLED TO. That is load-bearing rather than an
 * optimisation. Info is the default tab, so moving this section here would
 * otherwise have made every single species open pull an encounter partition --
 * 2.8 MB for Diamond/Pearl -- for a visit that only wanted the stat line. The
 * whole reason one tab is mounted at a time is that Info costs nothing on open,
 * and an eager fetch here would have quietly spent that.
 *
 * The section sits below two charts, so it is off-screen when the tab opens; the
 * observer's 200px margin starts the fetch just before it arrives. `idle` is a
 * real state in usePartitionRows (versionGroup null => no request), so this is a
 * gate on the argument rather than a second code path.
 *
 * THE PLACE NAMES ARE NOT LINKS YET. Confirmed as wanted -- each one should open
 * the corresponding map -- but there is no map module to open, so they stay text
 * rather than becoming buttons that do nothing. Recorded in the punch list.
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
    // The badge, not the bare label: a version group has two versions and this is
    // the column that says which of them a row belongs to.
    render: (g) => <GameBadge version={g.version} />,
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

export function SpeciesLocations({
  species,
  variety,
  versionGroup,
  scope,
}: {
  species: Species
  variety: Variety
  /** The app-wide selection. Null on "All". */
  versionGroup: VersionGroup | null
  /** The page's own scope, used only as the fallback -- see above. */
  scope: SpeciesGameScope | null
}) {
  const locationGroup = versionGroup ?? scope?.versionGroup ?? null
  const vgName = locationGroup?.name ?? null

  /*
    Sticky once true: the partition is cached by the loader, but re-arming the
    observer on every scroll past would churn state for nothing.
  */
  const sectionRef = useRef<HTMLElement>(null)
  /*
    Starts true where there is no observer to arm -- an old engine, or a test
    environment -- so the section loads rather than never appearing. As the
    initial value rather than a setState inside the effect: the effect has no
    business writing state synchronously, and "no observer" is knowable before
    the first render.
  */
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (seen) return
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [seen])

  const encounters = usePartitionRows<EncounterRow>(
    getEncountersForSpecies,
    species.id,
    seen ? vgName : null,
  )

  const grouped = useMemo(() => {
    if (encounters.state.status !== 'ready') return []
    return groupEncounters(encounters.state.rows.filter((r) => r.pokemon_id === variety.pokemon_id))
  }, [encounters.state, variety.pokemon_id])

  return (
    <section
      ref={sectionRef}
      className="species-info-block"
      data-testid="species-locations"
      data-version-group={vgName}
      data-loaded={seen}
    >
      {/* "Locations", not "Where to find it": every heading on this page is
          title-cased now, and "Where To Find It" is what that does to a
          sentence. A one-word label is the better answer than an exception. */}
      <h3 className="species-info-heading">
        Locations
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

      {/* idle, i.e. off-screen and not fetched yet -- distinct from loading, and
          said out loud so the block is not a silent empty space. */}
      {locationGroup && !seen && (
        <p className="species-info-caption" data-testid="locations-idle">
          Loads when you scroll to it.
        </p>
      )}

      {seen && encounters.state.status === 'loading' && (
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
  )
}
