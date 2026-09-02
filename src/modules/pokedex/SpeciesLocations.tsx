import { useEffect, useMemo, useRef, useState } from 'react'
import { DataTable, type Column } from '../../components/DataTable'
import {
  getEncountersForSpeciesAllGames,
  getLocation,
  getLocationArea,
  listVersionGroups,
} from '../../data'
import type { EncounterRow, Species, Variety } from '../../data'
import { GameBadge } from './GameBadge'
import { titleCase, versionGroupLabel } from './speciesFacts'

/**
 * Where a species is found in the wild, in every game.
 *
 * IT LIVES ON THE INFO TAB, under the base-stat and evolution charts and above
 * type effectiveness. It was the second half of the Description tab, which put a
 * sortable five-column table under sixteen paragraphs of prose -- two different
 * kinds of reading in one place. The Info tab is the facts tab, and a location
 * list is a fact.
 *
 * IT IS GAME-AGNOSTIC, requested directly, and it is the ONE SECTION ON THE PAGE
 * THAT IS. Everything else here follows the app-wide game selector, which
 * CLAUDE.md requires of every module; this section deliberately does not, because
 * "where do I catch this" is a question about the series rather than about the
 * cartridge in the slot, and the answer is only useful next to the alternatives.
 * The Version column says which game each row belongs to, and it is the default
 * sort, so the table reads as one block per game in release order.
 *
 * WHAT THAT COSTS, stated plainly because it is the largest single fetch in the
 * app: all fourteen encounter partitions, 9.6 MiB of raw JSON, ~287 KiB gzipped
 * over the wire. It was 1 KiB to 2.8 MiB for one game before.
 *
 * WHICH IS WHY IT STILL FETCHES ONLY WHEN IT IS SCROLLED TO. That gate is now
 * load-bearing twice over. Info is the default tab, so an eager fetch here would
 * make every species open pull ten megabytes for a visit that only wanted the
 * stat line. The section sits below two charts, so it is off-screen when the tab
 * opens; the observer's 200px margin starts the fetch just before it arrives. And
 * the loader indexes each partition once per session, so the second species'
 * locations cost nothing at all.
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
  /** Release position of `version`. The Version column's sort key -- see below. */
  gameOrder: number
  method: string
  levelMin: number
  levelMax: number
  chance: number
  conditions: string[]
}

/**
 * Collapse the raw rows to one per (version, area, method).
 *
 * The bundle's rows are per encounter slot, so one patch of grass produces several
 * that differ only by slot -- level ranges merge and chances sum, which is what a
 * reader actually wants.
 *
 * THE VERSION IS PART OF THE KEY, as it always was: Gold and Silver are two games
 * and a slot that differs between them is two facts. That is unchanged by going
 * game-agnostic; there are simply fourteen games' worth of keys now.
 */
function groupEncounters(rows: EncounterRow[], gameOrder: Map<string, number>): GroupedEncounter[] {
  const map = new Map<string, GroupedEncounter>()
  for (const row of rows) {
    const id = `${row.version}|${row.location_area_id}|${row.method}`
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
      gameOrder: gameOrder.get(row.version) ?? Number.MAX_SAFE_INTEGER,
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
    label: 'Game',
    // The badge, not the bare label: with every game in one table this is the
    // column that separates them, so it has to be legible at a glance.
    render: (g) => <GameBadge version={g.version} />,
    /*
      RELEASE ORDER, NOT ALPHABETICAL, and it is the table's default sort. Sorting
      the Game column by name would interleave Crystal with Colosseum and put
      Yellow last; what a reader wants is Red/Blue, then Yellow, then Gold/Silver.
      Sorting is stable, so within one game the rows keep the order the partition
      listed them in, which is by area.
    */
    sortValue: (g) => g.gameOrder,
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

type AllGamesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: EncounterRow[]; failed: string[] }
  | { status: 'error'; message: string }

/**
 * Every game's encounter rows for one species, once `enabled`.
 *
 * NOT usePartitionRows, and the difference is the reason this exists: that hook
 * loads ONE partition and its `ready` carries rows alone. This load is fourteen
 * files that settle independently, so `ready` has to carry the list of the ones
 * that did not arrive -- a table quietly missing three games' rows would read as
 * "not found in those games", which is the exact false claim the LoadState split
 * was written to prevent. The state machine is otherwise the same shape,
 * deliberately: idle / loading / ready / error, readiness derived from a request
 * key rather than cleared in the effect body, and a retry that bumps the key.
 */
function useAllGameEncounters(
  speciesId: number,
  enabled: boolean,
): { state: AllGamesState; retry: () => void } {
  const [result, setResult] = useState<{
    key: string
    rows: EncounterRow[]
    failed: string[]
  } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [attempt, setAttempt] = useState(0)

  const key = `${speciesId}|${attempt}`

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    getEncountersForSpeciesAllGames(speciesId)
      .then(({ rows, failed }) => {
        if (!cancelled) setResult({ key, rows, failed })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFailure({ key, message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [speciesId, enabled, key])

  let state: AllGamesState
  if (!enabled) state = { status: 'idle' }
  else if (failure?.key === key) state = { status: 'error', message: failure.message }
  else if (result?.key === key) {
    state = { status: 'ready', rows: result.rows, failed: result.failed }
  } else state = { status: 'loading' }

  return { state, retry: () => setAttempt((n) => n + 1) }
}

export function SpeciesLocations({ species, variety }: { species: Species; variety: Variety }) {
  /*
    Sticky once true: the partitions are cached by the loader, but re-arming the
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

  const encounters = useAllGameEncounters(species.id, seen)

  /* Release position of every version in scope, flattened out of the version
     groups -- which listVersionGroups already returns in generation-then-order
     sequence, so this needs no dates of its own. */
  const gameOrder = useMemo(() => {
    const order = new Map<string, number>()
    for (const group of listVersionGroups()) {
      for (const version of group.versions) {
        if (version != null) order.set(version, order.size)
      }
    }
    return order
  }, [])

  const grouped = useMemo(() => {
    if (encounters.state.status !== 'ready') return []
    return groupEncounters(
      encounters.state.rows.filter((r) => r.pokemon_id === variety.pokemon_id),
      gameOrder,
    )
  }, [encounters.state, variety.pokemon_id, gameOrder])

  /* How many of the fourteen this species actually turns up in -- the honest
     headline for a game-agnostic table, and cheaper to read than counting badges. */
  const gamesFound = useMemo(() => new Set(grouped.map((g) => g.version)).size, [grouped])
  const totalGames = useMemo(
    () => listVersionGroups().reduce((n, g) => n + g.versions.filter((v) => v != null).length, 0),
    [],
  )

  return (
    <section
      ref={sectionRef}
      className="species-info-block"
      data-testid="species-locations"
      data-scope="all-games"
      data-games={gamesFound}
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

      {/* Says the table is EVERY game rather than the selected one -- the one
          place on this page where the app-wide selector does not apply, so it
          has to say so out loud. */}
      <p className="species-info-caption" data-testid="locations-scope">
        Every game
        {encounters.state.status === 'ready' && (
          <span className="species-meta-aside">
            found in <span className="num">{gamesFound}</span> of{' '}
            <span className="num">{totalGames}</span>
          </span>
        )}
      </p>

      {/* idle, i.e. off-screen and not fetched yet -- distinct from loading, and
          said out loud so the block is not a silent empty space. */}
      {!seen && (
        <p className="species-info-caption" data-testid="locations-idle">
          Loads when you scroll to it.
        </p>
      )}

      {encounters.state.status === 'loading' && (
        <p className="species-info-caption" data-testid="locations-loading">
          Loading every game&rsquo;s encounters…
        </p>
      )}

      {/* Some games arrived and some did not. Named, not counted: "missing
          Platinum" is actionable and "13 of 14 loaded" is not. */}
      {encounters.state.status === 'ready' && encounters.state.failed.length > 0 && (
        <p className="species-info-caption" data-testid="locations-partial" role="alert">
          Could not load {encounters.state.failed.map(versionGroupLabel).join(', ')} — those games
          are missing from this table.
        </p>
      )}

      {encounters.state.status === 'error' && (
        <div data-testid="locations-error">
          <p role="alert">Could not load the encounter data.</p>
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
            {/* "No recorded encounter", not "not found in the wild": PokeAPI puts
                gift and event encounters in this same table, so a species with
                rows here is not necessarily catchable and one with none is not
                necessarily wild-only. Bulbasaur's nine rows are all method
                "Gift". */}
            No recorded encounter in any game — evolve or trade for it.
          </p>
        ) : (
          <DataTable
            rows={grouped}
            columns={ENCOUNTER_COLUMNS}
            rowKey={(g) => g.key}
            /* Grouped by game in release order. See the Game column. */
            initialSort="version"
            testId="species-locations-rows"
          />
        ))}
    </section>
  )
}
